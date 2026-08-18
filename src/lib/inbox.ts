/**
 * The shared mailbox — everything that arrives, not just the abnormal events.
 *
 * This is the "before" half of the picture. The classifier and the review
 * queue only ever see abnormal events, which makes them look like they solve
 * an easy problem. They do not: the seven that matter arrive alongside roughly
 * six hundred that do not, and that ratio is the actual case for automating
 * the sorting.
 *
 * Subjects only — the export carries no message bodies.
 */

import fs from 'node:fs';
import path from 'node:path';

import { triageSubject, type TriageResult } from './triage';

const INBOX_PATH = path.join(process.cwd(), 'data', 'model', 'triage.json');

interface RawInboxRow {
  id: string;
  subject: string;
  sender: string;
  received_at: string;
  /** The tag Jay applied in Outlook. Our only human-applied ground truth. */
  category: string;
  is_abnormal_event: boolean;
}

export interface InboxMessage {
  id: string;
  subject: string;
  sender: string;
  receivedAt: string;
  mailboxTag: string;
  /** What Jay tagged it. */
  taggedAbnormal: boolean;
  /** What stage 1 decided, from the subject line alone. */
  triage: TriageResult;
  /** True when stage 1 and Jay disagree — the only rows worth arguing about. */
  disagrees: boolean;
}

let cache: InboxMessage[] | null = null;

export function listInbox(): InboxMessage[] {
  if (cache) return cache;
  if (!fs.existsSync(INBOX_PATH)) return [];

  const raw: RawInboxRow[] = JSON.parse(fs.readFileSync(INBOX_PATH, 'utf8'));
  cache = raw
    .map((r) => {
      const triage = triageSubject(r.subject);
      return {
        id: r.id,
        subject: r.subject,
        sender: r.sender,
        receivedAt: r.received_at,
        mailboxTag: r.category,
        taggedAbnormal: r.is_abnormal_event,
        triage,
        disagrees: triage.abnormal !== r.is_abnormal_event,
      };
    })
    // Newest first, with undated messages last rather than sorted as if they
    // were the oldest thing in the mailbox.
    .sort((a, b) => {
      if (!a.receivedAt) return 1;
      if (!b.receivedAt) return -1;
      return b.receivedAt.localeCompare(a.receivedAt);
    });
  return cache;
}

export interface InboxStats {
  total: number;
  abnormal: number;
  routine: number;
  /** Distinct mailbox tags, largest first. */
  tags: Array<{ tag: string; n: number }>;
  /** Stage 1 scored against Jay's tags. */
  found: number;
  missed: number;
  falseAlarms: number;
  span: { from: string; to: string; days: number } | null;
}

export function inboxStats(): InboxStats {
  const rows = listInbox();
  const tagCounts = new Map<string, number>();
  for (const r of rows) tagCounts.set(r.mailboxTag, (tagCounts.get(r.mailboxTag) ?? 0) + 1);

  const dated = rows.map((r) => r.receivedAt).filter(Boolean).sort();
  const span = dated.length
    ? {
        from: dated[0].slice(0, 10),
        to: dated[dated.length - 1].slice(0, 10),
        days:
          Math.round(
            (Date.parse(dated[dated.length - 1].slice(0, 10)) - Date.parse(dated[0].slice(0, 10))) /
              86_400_000,
          ) + 1,
      }
    : null;

  return {
    total: rows.length,
    abnormal: rows.filter((r) => r.taggedAbnormal).length,
    routine: rows.filter((r) => !r.taggedAbnormal).length,
    tags: [...tagCounts].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n),
    found: rows.filter((r) => r.taggedAbnormal && r.triage.abnormal).length,
    missed: rows.filter((r) => r.taggedAbnormal && !r.triage.abnormal).length,
    falseAlarms: rows.filter((r) => !r.taggedAbnormal && r.triage.abnormal).length,
    span,
  };
}
