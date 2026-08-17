/**
 * Safety / redaction scan.
 *
 * Runs on the raw email body, independently of category classification. Exact
 * patterns (IP addresses, host naming conventions, phone numbers) are matched
 * with regexes rather than handed to a language model — an LLM is the wrong
 * tool for exact-pattern matching and will occasionally miss or invent one.
 *
 * The unknown-terminology check is a vocabulary diff against a known-terms
 * list. That list is maintained by the DOF team; anything outside it is
 * surfaced to a reviewer rather than guessed at.
 */

import type { FlaggedSpan, SafetyReport } from './types';

// IPv4, excluding things that are really version numbers by requiring all four
// octets to be in range.
const IPV4 =
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g;

// State host naming convention: site-role-env-nn (e.g. wpdc-ctx-prd-04).
const SERVER_NAME = /\b[a-z]{2,6}-[a-z]{2,8}-(?:prd|prod|dev|tst|test|qa|stg)-\d{1,3}\b/gi;

const PHONE = /\b\d{3}-\d{3}-\d{4}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

/**
 * Terminology the DOF team recognises. Anything capitalised and unfamiliar in
 * a notice gets flagged for a human to confirm before it goes into a
 * generated artifact.
 */
export const KNOWN_TERMS = new Set(
  [
    'DTI',
    'DOF',
    'IRAS',
    'PHRST',
    'FSF',
    'ERP',
    'SFTP',
    'FirstMap',
    'ArcGIS',
    'ProWatch',
    'TN3270',
    'Oracle',
    'Linux',
    'Windows',
    'VPN',
    'SSL',
    'CI/CD',
    'Citrix',
    'MFA',
    'CAB',
    'ISO',
    'FTI',
    'IRS',
    'PDF',
    'William Penn',
    'Biggs',
    'Crown Castle',
    'Advantech',
    'Portal',
    'Production',
    'Development',
    'Test',
    'Service Desk',
    'Change Enablement',
  ].map((t) => t.toUpperCase()),
);

/** Words that look like acronyms/product names but are ordinary prose. */
const STOPWORDS = new Set(
  [
    'UPDATE',
    'SECURITY',
    'ADVISORY',
    'NOTE',
    'IMPORTANT',
    'ALL',
    'THE',
    'A',
    'I',
    'AM',
    'PM',
    'EST',
    'EDT',
    'AND',
    'OR',
    'ON',
    'AT',
    'IN',
    'TO',
    'BY',
    'IT',
    'NO',
  ].map((t) => t.toUpperCase()),
);

// Candidate terminology: ALL-CAPS runs (KRONOS-BRIDGE, HALON) of 3+ chars.
const CANDIDATE_TERM = /\b[A-Z][A-Z0-9]{2,}(?:-[A-Z0-9]{2,})*\b/g;

function collect(
  body: string,
  re: RegExp,
  kind: FlaggedSpan['kind'],
  note: string,
  filter?: (m: string) => boolean,
): FlaggedSpan[] {
  const out: FlaggedSpan[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (filter && !filter(m[0])) continue;
    out.push({ kind, text: m[0], start: m.index, end: m.index + m[0].length, note });
  }
  return out;
}

export function scanForSensitiveContent(body: string): SafetyReport {
  const spans: FlaggedSpan[] = [
    ...collect(body, IPV4, 'ip_address', 'Bare IP address — must not leave the State network.'),
    ...collect(
      body,
      SERVER_NAME,
      'server_name',
      'Matches the internal host naming convention.',
    ),
    ...collect(
      body,
      CANDIDATE_TERM,
      'unknown_term',
      'Terminology not on the known-terms list.',
      (t) => !KNOWN_TERMS.has(t) && !STOPWORDS.has(t) && !/^\d+$/.test(t),
    ),
    ...collect(body, PHONE, 'phone', 'Phone number — check it is the public Service Desk line.'),
    ...collect(body, EMAIL, 'email', 'Email address in body.'),
  ].sort((a, b) => a.start - b.start);

  // Weighting: an IP or an internal hostname is disqualifying on its own.
  // Unknown terms are a nudge, phone/email are informational.
  const weights: Record<FlaggedSpan['kind'], number> = {
    ip_address: 1,
    server_name: 0.8,
    unknown_term: 0.25,
    phone: 0,
    email: 0,
  };

  const score = Math.min(1, spans.reduce((acc, s) => acc + weights[s.kind], 0));
  const blocking = spans.some((s) => weights[s.kind] >= 0.25);

  return { score: Math.round(score * 100) / 100, clean: !blocking, spans };
}

/** Replace flagged spans with placeholders, for a redacted preview. */
export function redact(body: string, spans: FlaggedSpan[]): string {
  const redactable = spans
    .filter((s) => s.kind === 'ip_address' || s.kind === 'server_name')
    .sort((a, b) => b.start - a.start);
  let out = body;
  for (const s of redactable) {
    const label = s.kind === 'ip_address' ? '[IP REDACTED]' : '[HOSTNAME REDACTED]';
    out = out.slice(0, s.start) + label + out.slice(s.end);
  }
  return out;
}
