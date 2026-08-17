/**
 * ============================================================================
 * PLACEHOLDER CLASSIFIER — not the real model.
 * ============================================================================
 *
 * This is a deterministic keyword/rule pass that exists so the UI has
 * plausible data to render. It is intentionally simple and intentionally
 * fallible: on several notices it returns a low confidence or the wrong label,
 * which is exactly what the review queue is there to catch.
 *
 * The real implementation swaps out `classify()` behind this same signature.
 * Nothing else in the app reads keywords directly. Open questions to settle
 * before that swap (model choice, hosting, training data) are in
 * docs/MODEL-NOTES.md.
 */

import { CATEGORIES, type Category, type Status } from './taxonomy';
import { normalizeSchedule } from './time';
import type { ExtractedFields, ModelAssessment } from './types';

export const ENGINE_ID = 'stub-rules-v0';

/**
 * The two axes are not symmetric. What *kind of event* this is (the primary
 * category) is a different question from *what it touches* (which mostly
 * belongs in secondary tags). Scoring them in one pool made "servers, data
 * center" outrank "maintenance" on a routine change notice, which is wrong.
 *
 * INTENT categories can be primary. SUBJECT categories are tags describing
 * scope, and only become primary if nothing else matched at all.
 */
const INTENT_CATEGORIES: Category[] = ['Security', 'Outage', 'Compliance', 'Maintenance', 'Vendor'];
const SUBJECT_CATEGORIES: Category[] = ['Infrastructure', 'Application', 'Network'];

/** Tie-break order when two intents score equally. Earlier wins. */
const INTENT_PRIORITY: Category[] = ['Security', 'Outage', 'Compliance', 'Maintenance', 'Vendor'];

const PATTERNS: Record<Category, RegExp[]> = {
  Maintenance: [
    /\bmaintenance\b/i,
    /\bpatch(es|ing)?\b/i,
    /\bconfiguration freeze\b/i,
    /\bupgrade\b/i,
    /\bfirmware update\b/i,
    /\brepointed\b/i,
    /\brecycled\b/i,
  ],
  Outage: [
    /\boutage\b/i,
    /\bnot able to connect\b/i,
    /\bknown issue\b/i,
    /\bexperiencing a system issue\b/i,
    /\bhave been restored\b/i,
    /\bis resolved\b/i,
  ],
  Security: [
    /\bsecurity advisory\b/i,
    /\banomalous\b/i,
    /\bauthentication traffic\b/i,
    /\bMFA\b/,
    /\bforensic\b/i,
    /\bre-?authenticate\b/i,
  ],
  Compliance: [
    /\bPublication 1075\b/i,
    /\bcompliance\b/i,
    /\battestation\b/i,
    /\baudit\b/i,
    /\bFTI\b/,
  ],
  Vendor: [/\bvendor\b/i, /\bAdvantech\b/i, /\bCrown Castle\b/i, /\bthird[- ]party\b/i],
  Network: [/\bnetwork\b/i, /\bVPN\b/i, /\bfiber\b/i, /\bgateway\b/i, /\bcircuit\b/i],
  Infrastructure: [
    /\bservers?\b/i,
    /\bdata center\b/i,
    /\bmainframe\b/i,
    /\belectrical\b/i,
    /\bcluster\b/i,
    /\bpower loss\b/i,
    /\bcontrollers?\b/i,
  ],
  Application: [
    /\bapplications?\b/i,
    /\bIRAS\b/,
    /\bPortal\b/,
    /\bPHRST\b/,
    /\bFSF\b/,
    /\bPension\b/i,
    /\bArcGIS\b/i,
    /\bFirstMap\b/i,
    /\bTN3270\b/,
    /\bdatabases?\b/i,
    /\bprinters?\b/i,
  ],
};

/**
 * "While no outage is anticipated, there is a risk of power loss" is a
 * maintenance notice, not an outage. Strip negated mentions before scoring so
 * a reassurance does not become the event type.
 */
const NEGATED = /\bno\s+(?:outage|impact|downtime|interruption)\s+(?:is|are)\s+(?:anticipated|expected)\b/gi;

function scoreCategories(body: string, pool: Category[]): Map<Category, number> {
  const text = body.replace(NEGATED, ' ');
  const scores = new Map<Category, number>();
  for (const category of pool) {
    let hits = 0;
    for (const p of PATTERNS[category]) if (p.test(text)) hits += 1;
    if (hits > 0) scores.set(category, hits);
  }
  return scores;
}

function rank(scores: Map<Category, number>): Array<[Category, number]> {
  return [...scores.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const ai = INTENT_PRIORITY.indexOf(a[0]);
    const bi = INTENT_PRIORITY.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/**
 * Ongoing-incident notices routinely end with "a notification will be sent
 * once the issue has been resolved". That is a promise about the future, not a
 * resolution — reading it as one flips an active outage to resolved and stops
 * the real closure notice from threading onto it. Drop those clauses before
 * looking for resolution language, and test for an active incident first.
 */
const FUTURE_RESOLUTION =
  /\b(?:once|when|after)\b[^.]*\b(?:has been|is|are)\s+(?:resolved|restored)\b/gi;

function detectStatus(body: string): { status: Status; confident: boolean } {
  const text = body.replace(FUTURE_RESOLUTION, ' ');

  if (/^\s*UPDATE\b/i.test(text) || /\bhas been extended\b/i.test(text)) {
    return { status: 'updated', confident: true };
  }
  if (
    /\bcurrently experiencing\b/i.test(text) ||
    /\bare not able to\b/i.test(text) ||
    /\bthere is a known issue\b/i.test(text) ||
    /\bhas identified\b/i.test(text) ||
    /\bactively working\b/i.test(text) ||
    /\bis aware of the issue\b/i.test(text)
  ) {
    return { status: 'active', confident: true };
  }
  if (
    /\bhave been restored\b/i.test(text) ||
    /\bis resolved\b/i.test(text) ||
    /\bhas been resolved\b/i.test(text) ||
    /\bhas repaired\b/i.test(text)
  ) {
    return { status: 'resolved', confident: true };
  }
  if (/\bwill be\b|\bwill perform\b|\bwill have\b|\bscheduled\b|\bupcoming\b/i.test(text)) {
    return { status: 'scheduled', confident: true };
  }
  return { status: 'scheduled', confident: false };
}

/** PLACEHOLDER. Same signature the trained classifier will implement. */
export function classify(body: string): ModelAssessment {
  const intents = rank(scoreCategories(body, INTENT_CATEGORIES));
  const subjects = rank(scoreCategories(body, SUBJECT_CATEGORIES));

  // Primary comes from the intent pool. If nothing matched there, fall back to
  // the strongest subject, and finally to Maintenance — both with low
  // confidence, which sends the notice to a human.
  const primary: Category = intents[0]?.[0] ?? subjects[0]?.[0] ?? 'Maintenance';

  const secondary = [...subjects.map(([c]) => c), ...intents.slice(1).map(([c]) => c)]
    .filter((c) => c !== primary)
    .slice(0, 3);

  const { status, confident: statusConfident } = detectStatus(body);

  const top = intents[0]?.[1] ?? 0;
  const second = intents[1]?.[1] ?? 0;
  const margin = top === 0 ? 0 : (top - second) / top;

  let confidence: number;
  if (intents.length === 0) {
    // No intent signal at all — the notice does not say what kind of event it is.
    confidence = 0.25;
  } else {
    confidence = 0.55 + 0.3 * margin + Math.min(0.12, top * 0.04);
    if (!statusConfident) confidence -= 0.15;
  }
  confidence = Math.max(0.05, Math.min(0.97, Math.round(confidence * 100) / 100));

  const reasoning =
    intents.length === 0
      ? `No event-type keywords matched, so "${primary}" is a fallback rather than a read. ` +
        `Status guessed as "${status}".`
      : `Event type read as "${primary}" (${top} keyword hit${top === 1 ? '' : 's'})` +
        (intents[1]
          ? `, against "${intents[1][0]}" (${second}) — a narrow margin.`
          : ' with no competing event type.') +
        ` Scope tags from ${subjects.length ? subjects.map(([c]) => c).join(', ') : 'nothing'}.` +
        ` Status read as "${status}"${statusConfident ? '' : ' by default — no tense cue found'}.`;

  return { primary, secondary, status, confidence, reasoning, engine: ENGINE_ID };
}

const PRODUCTION_RE = /\bproduction\b|\bprod\b|\bPHRST\b|\bIRAS\b|\bPortal\b|\bERP\b/i;
const NON_PRODUCTION_RE = /\bnon-?production\b|\btest\b|\bdevelopment\b|\bdev\b|\bQA\b|\bstaging\b/i;

const SYSTEM_PATTERNS: Array<[RegExp, string]> = [
  [/\bIRAS Production\b/i, 'IRAS Production'],
  [/\bPortal\b/i, 'IRAS Portal'],
  [/\bPHRST\b/i, 'PHRST'],
  [/\bFSF\b/i, 'FSF'],
  [/\bPension\b/i, 'Pension'],
  [/\bFirstMap(?: 2\.0)?\b/i, 'FirstMap'],
  [/\bArcGIS\b/i, 'ArcGIS'],
  [/\bTN3270\b/i, 'TN3270 (mainframe)'],
  [/\bSFTP\b/i, 'SFTP'],
  [/\bCI\/CD\b/i, 'CI/CD servers'],
  [/\bProWatch\b/i, 'Enterprise ProWatch'],
  [/\bSSL\/VPN\b/i, 'SSL/VPN'],
  [/\bOracle\b/i, 'Oracle databases'],
  [/\bprinters?\b/i, 'Print services'],
  [/\bLinux [Pp]roduction servers?\b/i, 'Linux production servers'],
  [/\bLinux (?:Test and Development|non-?production) servers?\b/i, 'Linux test/dev servers'],
  [/\bWindows (?:Development and Test|Test and Development)\b/i, 'Windows test/dev servers'],
  [/\bWindows Production servers?\b/i, 'Windows production servers'],
  [/\bCitrix\b/i, 'Citrix gateway'],
  [/\bbadge readers?\b/i, 'Badge readers'],
];

function extractSystems(body: string): string[] {
  const out: string[] = [];
  for (const [re, name] of SYSTEM_PATTERNS) {
    if (re.test(body) && !out.includes(name)) out.push(name);
  }
  return out;
}

function extractImpact(body: string): string {
  const cues = [
    /([^.]*\bintermittent[^.]*\.)/i,
    /([^.]*\bunavailable[^.]*\.)/i,
    /([^.]*\bwill impact the availability[^.]*\.)/i,
    /([^.]*\bbrief outage[^.]*\.)/i,
    /([^.]*\brisk of power loss[^.]*\.)/i,
    /([^.]*\bunable to make changes[^.]*\.)/i,
    /([^.]*\bdelayed file delivery[^.]*\.)/i,
    /([^.]*\bfail open[^.]*\.)/i,
  ];
  for (const re of cues) {
    const m = body.match(re);
    if (m) return m[1].trim();
  }
  return 'Impact not stated explicitly in the notice.';
}

function extractAction(body: string): string {
  const cues = [
    /([^.]*\ball end users should be out of[^.]*\.)/i,
    /([^.]*\bmust re-authenticate[^.]*\.)/i,
    /([^.]*\bmust confirm[^.]*\.)/i,
    /([^.]*\bplease contact[^.]*\.)/i,
    /([^.]*\breport any[^.]*\.)/i,
  ];
  for (const re of cues) {
    const m = body.match(re);
    if (m) return m[1].trim();
  }
  return 'No action required — informational.';
}

function extractContact(body: string): string | null {
  const email = body.match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/);
  if (email) return email[0];
  const phone = body.match(/\b\d{3}-\d{3}-\d{4}\b/);
  if (phone) return phone[0];
  return null;
}

/** Structured extraction. Same JSON feeds both the infographic and the summary. */
export function extract(body: string, receivedAt: string): ExtractedFields {
  const schedule = normalizeSchedule(body, receivedAt);

  const explicitlyNonProduction = NON_PRODUCTION_RE.test(body);
  const isProduction = PRODUCTION_RE.test(body) && !/\bnon-?production\b/i.test(body);
  // A notice that never says which environment it touches ("maintenance on
  // multiple servers") is unknown, not safe. Only an explicit non-production
  // statement clears the low-risk bar in routing.
  const productionScope: ExtractedFields['productionScope'] = isProduction
    ? 'production'
    : explicitlyNonProduction
      ? 'non_production'
      : 'unstated';

  const isPlanned = /\bwill be\b|\bwill perform\b|\bscheduled\b|\bmaintenance\b/i.test(body) &&
    !/\bcurrently experiencing\b|\bknown issue\b|\bnot able to connect\b/i.test(body);

  return {
    eventType: body.split(/[.\n]/)[0].trim().slice(0, 120),
    affectedSystems: extractSystems(body),
    window: schedule.primary,
    subWindows: schedule.subWindows,
    scheduleConfidence: schedule.confidence,
    scheduleNotes: schedule.notes,
    impact: extractImpact(body),
    requiredAction: extractAction(body),
    contact: extractContact(body),
    isProduction,
    productionScope,
    isPlanned,
  };
}

export const ALL_CATEGORIES = CATEGORIES;
