import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { classify, classifyFromVector, extract } from './classifier';
import { findSimilar } from './precedents';
import { scanForSensitiveContent } from './redaction';
import { fromBlob, toBlob } from './vectors';
import { routeNotification } from './routing';
import type { Category, Status } from './taxonomy';
import type {
  ArtifactKind,
  ArtifactRecord,
  Decision,
  DecisionRecord,
  NotificationRecord,
  PrecedentMatch,
  PrecedentRecord,
} from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'pipeline.db');
const SCHEMA_PATH = path.join(process.cwd(), 'src', 'lib', 'schema.sql');
const EVENTS_PATH = path.join(process.cwd(), 'data', 'events.json');
/**
 * Embeddings for the demo corpus, produced by scripts/embed-events.ts.
 * Precomputed because seeding runs inside a synchronous better-sqlite3
 * transaction and cannot await a network call. Absent means the keyword
 * fallback is used instead — the app still runs, it just classifies worse.
 */
const VECTORS_PATH = path.join(process.cwd(), 'data', 'events.vectors.json');
const SEED_PRECEDENTS_PATH = path.join(process.cwd(), 'data', 'precedents.seed.json');

/** Notices held out of the demo's accuracy number. ~1/3 of the real sample. */
const HOLDOUT_IDS = new Set([
  'EVT-001',
  'EVT-004',
  'EVT-007',
  'EVT-013',
  'EVT-016',
  'EVT-019',
  'EVT-020',
  'EVT-021',
  'EVT-026',
  'EVT-030',
]);

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  return db;
}

/**
 * The app starts empty on purpose.
 *
 * A demo that opens with data already in it hides the part worth watching —
 * mail arriving, being triaged, classified and routed. Ingest is therefore an
 * explicit action, and it can be run again from scratch.
 */
export function notificationCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number }).n;
}

export function ingestMailbox(): number {
  const conn = getDb();
  if (notificationCount() > 0) return 0;
  seed(conn);
  return notificationCount();
}

/** Clears everything the demo produced, so it can be run again from empty. */
export function resetMailbox(): void {
  const conn = getDb();
  conn
    .transaction(() => {
      conn.prepare('DELETE FROM artifacts').run();
      conn.prepare('DELETE FROM decisions').run();
      // Seeded rulings are reference data that predate the demo, so they stay.
      conn.prepare('DELETE FROM precedents WHERE seeded = 0').run();
      // Six of the seeded rulings cite the notice they were made on. Once that
      // notice is gone the citation is dangling, and leaving it in place makes
      // the foreign key reject the delete and roll the whole reset back. The
      // ruling is the part worth keeping, so drop the reference and keep it.
      conn.prepare('UPDATE precedents SET notification_id = NULL').run();
      conn.prepare('DELETE FROM notifications').run();
    })();
}

// ---------------------------------------------------------------------------
// Ingest + seed
// ---------------------------------------------------------------------------

interface RawEvent {
  id: string;
  received_at: string;
  synthetic: boolean;
  synthetic_reason?: string;
  body: string;
  gold?: { primary: Category; secondary: Category[]; status: Status };
}

function seed(conn: Database.Database): void {
  const events: RawEvent[] = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));

  const vectors: Record<string, number[]> = fs.existsSync(VECTORS_PATH)
    ? JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'))
    : {};
  if (Object.keys(vectors).length === 0) {
    console.warn(
      'No embeddings found, so the keyword fallback will classify the corpus. ' +
        'Run: npx tsx scripts/embed-events.ts',
    );
  }

  const insert = conn.prepare(`
    INSERT INTO notifications (
      id, received_at, body, synthetic, synthetic_reason,
      gold_primary, gold_secondary, gold_status, holdout,
      model_primary, model_secondary, model_status, model_confidence,
      model_reasoning, model_engine,
      extracted_json, safety_json, route, route_reasons, review_state, embedding
    ) VALUES (
      @id, @received_at, @body, @synthetic, @synthetic_reason,
      @gold_primary, @gold_secondary, @gold_status, @holdout,
      @model_primary, @model_secondary, @model_status, @model_confidence,
      @model_reasoning, @model_engine,
      @extracted_json, @safety_json, @route, @route_reasons, 'pending', @embedding
    )
  `);

  const run = conn.transaction((rows: RawEvent[]) => {
    for (const e of rows) {
      // Stages 1–3. The trained model when we have an embedding for this
      // notice, the keyword fallback when we do not.
      const vector = vectors[e.id];
      const model = vector ? classifyFromVector(e.body, vector) : classify(e.body);
      const extracted = extract(e.body, e.received_at);
      const safety = scanForSensitiveContent(e.body);
      const routing = routeNotification(model, extracted, safety);

      insert.run({
        id: e.id,
        received_at: e.received_at,
        body: e.body,
        synthetic: e.synthetic ? 1 : 0,
        synthetic_reason: e.synthetic_reason ?? null,
        gold_primary: e.gold?.primary ?? null,
        gold_secondary: JSON.stringify(e.gold?.secondary ?? []),
        gold_status: e.gold?.status ?? null,
        holdout: HOLDOUT_IDS.has(e.id) ? 1 : 0,
        model_primary: model.primary,
        model_secondary: JSON.stringify(model.secondary),
        model_status: model.status,
        model_confidence: model.confidence,
        model_reasoning: model.reasoning,
        model_engine: model.engine,
        extracted_json: JSON.stringify(extracted),
        safety_json: JSON.stringify(safety),
        route: routing.route,
        route_reasons: JSON.stringify(routing.reasons),
        embedding: vector ? toBlob(vector) : null,
      });
    }
  });

  run(events);
  threadUpdates(conn);
  seedPrecedents(conn);
}

/**
 * Stage 6 (threading). An update or resolution is linked back to the original
 * notice rather than standing alone, so the generated artifact can describe the
 * merged current state instead of contradicting the earlier one.
 */
function threadUpdates(conn: Database.Database): void {
  const rows = conn
    .prepare('SELECT id, received_at, model_status, extracted_json FROM notifications ORDER BY received_at, id')
    .all() as Array<{ id: string; received_at: string; model_status: string; extracted_json: string }>;

  const systemsOf = (json: string): string[] => JSON.parse(json).affectedSystems ?? [];
  const link = conn.prepare('UPDATE notifications SET thread_parent_id = ? WHERE id = ?');

  for (const row of rows) {
    if (row.model_status !== 'updated' && row.model_status !== 'resolved') continue;
    const mine = new Set(systemsOf(row.extracted_json));
    if (mine.size === 0) continue;

    const candidates = rows.filter(
      (c) =>
        c.id !== row.id &&
        c.received_at <= row.received_at &&
        (c.model_status === 'active' || c.model_status === 'scheduled') &&
        systemsOf(c.extracted_json).some((s) => mine.has(s)),
    );
    if (candidates.length === 0) continue;

    // A resolution most likely closes an active incident; otherwise take the
    // most recent open notice about the same system.
    candidates.sort((a, b) => {
      if (row.model_status === 'resolved') {
        const aActive = a.model_status === 'active' ? 1 : 0;
        const bActive = b.model_status === 'active' ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
      }
      return b.received_at.localeCompare(a.received_at);
    });

    link.run(candidates[0].id, row.id);
  }
}

/**
 * Seed the precedent table with rulings on the genuinely ambiguous cases in the
 * sample so the demo is not cold-started.
 */
function seedPrecedents(conn: Database.Database): void {
  if (!fs.existsSync(SEED_PRECEDENTS_PATH)) return;
  const seeds = JSON.parse(fs.readFileSync(SEED_PRECEDENTS_PATH, 'utf8')) as Array<{
    notification_id: string | null;
    phrase: string;
    human_primary: Category;
    human_status: Status;
    decision: Decision;
    reason: string;
    reviewer: string;
    created_at: string;
  }>;

  const insert = conn.prepare(`
    INSERT INTO precedents (
      notification_id, phrase, human_primary, human_status,
      decision, reason, reviewer, created_at, seeded
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const run = conn.transaction(() => {
    for (const s of seeds) {
      insert.run(
        s.notification_id,
        s.phrase,
        s.human_primary,
        s.human_status,
        s.decision,
        s.reason,
        s.reviewer,
        s.created_at,
      );
    }
  });
  run();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function hydrate(row: any): NotificationRecord {
  return {
    id: row.id,
    receivedAt: row.received_at,
    body: row.body,
    synthetic: Boolean(row.synthetic),
    syntheticReason: row.synthetic_reason,
    goldPrimary: row.gold_primary,
    goldSecondary: JSON.parse(row.gold_secondary),
    goldStatus: row.gold_status,
    holdout: Boolean(row.holdout),
    model: {
      primary: row.model_primary,
      secondary: JSON.parse(row.model_secondary),
      status: row.model_status,
      confidence: row.model_confidence,
      reasoning: row.model_reasoning,
      engine: row.model_engine,
    },
    extracted: JSON.parse(row.extracted_json),
    safety: JSON.parse(row.safety_json),
    route: row.route,
    routeReasons: JSON.parse(row.route_reasons),
    reviewState: row.review_state,
    threadParentId: row.thread_parent_id,
  };
}

export function listNotifications(): NotificationRecord[] {
  return (getDb().prepare('SELECT * FROM notifications ORDER BY received_at DESC, id DESC').all() as any[]).map(
    hydrate,
  );
}

export function getNotification(id: string): NotificationRecord | null {
  const row = getDb().prepare('SELECT * FROM notifications WHERE id = ?').get(id) as any;
  return row ? hydrate(row) : null;
}

export function getThreadChildren(id: string): NotificationRecord[] {
  return (
    getDb().prepare('SELECT * FROM notifications WHERE thread_parent_id = ? ORDER BY received_at').all(id) as any[]
  ).map(hydrate);
}

export function getReviewQueue(): NotificationRecord[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM notifications
         WHERE route = 'human_review' AND review_state = 'pending'
         ORDER BY received_at DESC, id DESC`,
      )
      .all() as any[]
  ).map(hydrate);
}

export function listPrecedents(): PrecedentRecord[] {
  return (getDb().prepare('SELECT * FROM precedents ORDER BY created_at DESC, id DESC').all() as any[]).map(
    (r) => ({
      id: r.id,
      notificationId: r.notification_id,
      phrase: r.phrase,
      humanPrimary: r.human_primary,
      humanStatus: r.human_status,
      decision: r.decision,
      reason: r.reason,
      reviewer: r.reviewer,
      createdAt: r.created_at,
      seeded: Boolean(r.seeded),
      embedding: r.embedding ? fromBlob(r.embedding) : null,
    }),
  );
}

/** Stage 4 — precedent lookup for a borderline case. Reference context only. */
export function precedentsFor(n: NotificationRecord, limit = 3): PrecedentMatch[] {
  const query = [
    n.body.slice(0, 400),
    ...n.safety.spans.filter((s) => s.kind === 'unknown_term').map((s) => s.text),
  ].join(' ');
  // Drop the ruling this reviewer just recorded — otherwise it comes straight
  // back as a "similar past case", which is circular and reads as false
  // corroboration. Seeded rulings genuinely predate the review and stay.
  const others = listPrecedents().filter((p) => p.seeded || p.notificationId !== n.id);

  // The notice was already embedded to classify it, so retrieval is free.
  const row = getDb()
    .prepare('SELECT embedding FROM notifications WHERE id = ?')
    .get(n.id) as { embedding: Buffer | null } | undefined;

  return findSimilar(query, others, limit, row?.embedding ? fromBlob(row.embedding) : null);
}

export function listDecisions(): DecisionRecord[] {
  return (getDb().prepare('SELECT * FROM decisions ORDER BY created_at DESC, id DESC').all() as any[]).map(
    (r) => ({
      id: r.id,
      notificationId: r.notification_id,
      decision: r.decision,
      humanPrimary: r.human_primary,
      humanSecondary: JSON.parse(r.human_secondary),
      humanStatus: r.human_status,
      reason: r.reason,
      reviewer: r.reviewer,
      createdAt: r.created_at,
      modelPrimaryAtDecision: r.model_primary_at_decision,
      modelStatusAtDecision: r.model_status_at_decision,
      modelConfidenceAtDecision: r.model_confidence_at_decision,
    }),
  );
}

export function getDecisionFor(notificationId: string): DecisionRecord | null {
  const rows = listDecisions().filter((d) => d.notificationId === notificationId);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface SubmitDecisionInput {
  notificationId: string;
  decision: Decision;
  humanPrimary: Category;
  humanSecondary: Category[];
  humanStatus: Status;
  reason: string;
  reviewer: string;
}

/**
 * Stage 5 + 6. Records the human's call and writes it to the precedent table.
 * The model's guess is snapshotted onto the decision row for override-rate
 * reporting, but only the human's ruling becomes a precedent.
 */
export function submitDecision(input: SubmitDecisionInput): DecisionRecord {
  const reason = input.reason.trim();
  if (reason.length < 10) {
    throw new Error('A written reason of at least 10 characters is required.');
  }

  const conn = getDb();
  const n = getNotification(input.notificationId);
  if (!n) throw new Error(`Unknown notification ${input.notificationId}`);
  if (n.reviewState !== 'pending') throw new Error('This notification has already been decided.');

  const now = new Date().toISOString();

  const tx = conn.transaction(() => {
    conn
      .prepare(
        `INSERT INTO decisions (
           notification_id, decision, human_primary, human_secondary, human_status,
           reason, reviewer, created_at,
           model_primary_at_decision, model_status_at_decision, model_confidence_at_decision
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.notificationId,
        input.decision,
        input.humanPrimary,
        JSON.stringify(input.humanSecondary),
        input.humanStatus,
        reason,
        input.reviewer,
        now,
        n.model.primary,
        n.model.status,
        n.model.confidence,
      );

    conn
      .prepare('UPDATE notifications SET review_state = ? WHERE id = ?')
      .run(input.decision === 'approve' ? 'approved' : 'rejected', input.notificationId);

    // Precedent row carries the human ruling only — no model fields.
    conn
      .prepare(
        `INSERT INTO precedents (
           notification_id, phrase, human_primary, human_status,
           decision, reason, reviewer, created_at, seeded, embedding
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        input.notificationId,
        n.body.slice(0, 240),
        input.humanPrimary,
        input.humanStatus,
        input.decision,
        reason,
        input.reviewer,
        now,
        // Inherit the notice's vector so this ruling is retrievable by meaning
        // from the moment it is written, with no extra embedding call.
        (conn.prepare('SELECT embedding FROM notifications WHERE id = ?')
          .get(input.notificationId) as { embedding: Buffer | null } | undefined)?.embedding ?? null,
      );
  });

  tx();
  return getDecisionFor(input.notificationId)!;
}

export function getArtifacts(notificationId: string): ArtifactRecord[] {
  return (
    getDb()
      .prepare('SELECT * FROM artifacts WHERE notification_id = ? ORDER BY created_at DESC')
      .all(notificationId) as any[]
  ).map((r) => ({
    id: r.id,
    notificationId: r.notification_id,
    kind: r.kind,
    payload: r.payload,
    approvalState: r.approval_state,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    createdAt: r.created_at,
  }));
}

export function getArtifact(notificationId: string, kind: ArtifactKind): ArtifactRecord | null {
  return getArtifacts(notificationId).find((a) => a.kind === kind) ?? null;
}

export function upsertArtifact(notificationId: string, kind: ArtifactKind, payload: unknown): ArtifactRecord {
  const conn = getDb();
  const existing = getArtifact(notificationId, kind);
  const now = new Date().toISOString();

  if (existing) {
    // Regenerating always drops the artifact back to draft — an approval
    // never carries over to content the approver has not seen.
    conn
      .prepare(
        `UPDATE artifacts SET payload = ?, approval_state = 'draft',
         approved_by = NULL, approved_at = NULL, created_at = ? WHERE id = ?`,
      )
      .run(JSON.stringify(payload), now, existing.id);
  } else {
    conn
      .prepare(
        `INSERT INTO artifacts (notification_id, kind, payload, approval_state, created_at)
         VALUES (?, ?, ?, 'draft', ?)`,
      )
      .run(notificationId, kind, JSON.stringify(payload), now);
  }
  return getArtifact(notificationId, kind)!;
}

export function setArtifactApproval(
  notificationId: string,
  kind: ArtifactKind,
  state: 'approved' | 'rejected',
  approver: string,
): ArtifactRecord {
  getDb()
    .prepare(
      `UPDATE artifacts SET approval_state = ?, approved_by = ?, approved_at = ?
       WHERE notification_id = ? AND kind = ?`,
    )
    .run(state, approver, new Date().toISOString(), notificationId, kind);
  return getArtifact(notificationId, kind)!;
}

export function resetDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const p = DB_PATH + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  getDb();
}
