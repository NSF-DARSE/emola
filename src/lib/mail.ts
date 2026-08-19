/**
 * Presentation helpers that make a notification read like an email, because
 * that is what it is. Sender, subject and snippet are derived from the notice
 * body — none of this changes the stored record.
 */

import type { NotificationRecord } from './types';

export function senderFor(n: NotificationRecord): { name: string; email: string } {
  const body = n.body;
  if (/DOF IT Support/i.test(body)) {
    return { name: 'DOF IT Support Team', email: 'ExampleEmail@delaware.gov' };
  }
  if (/Change Enablement/i.test(body)) {
    return { name: 'DTI Change Enablement', email: 'ExampleEmail@delaware.gov' };
  }
  if (/Service Desk/i.test(body)) {
    return { name: 'DE Service Desk', email: 'ExampleEmail@delaware.gov' };
  }
  return { name: 'DTI Notifications', email: 'ExampleEmail@delaware.gov' };
}

const LEAD = /^(good morning,?|good afternoon,?|please be advised that|hello,?)\s*/i;

export function subjectFor(n: NotificationRecord): string {
  const systems = n.extracted.affectedSystems;
  const scope = systems.length ? systems.slice(0, 2).join(' and ') : null;

  const prefix =
    n.model.status === 'updated'
      ? 'UPDATE'
      : n.model.status === 'resolved'
        ? 'RESOLVED'
        : n.model.status === 'active'
          ? 'ONGOING'
          : null;

  const kind =
    n.model.primary === 'Maintenance'
      ? 'Scheduled maintenance'
      : n.model.primary === 'Outage'
        ? 'Service disruption'
        : n.model.primary === 'Security'
          ? 'Security advisory'
          : n.model.primary === 'Compliance'
            ? 'Compliance notice'
            : n.model.primary === 'Vendor'
              ? 'Vendor change'
              : `${n.model.primary} notice`;

  const core = scope ? `${kind} — ${scope}` : kind;
  return prefix ? `${prefix}: ${core}` : core;
}

export function snippetFor(n: NotificationRecord): string {
  return n.body.replace(/\s+/g, ' ').replace(LEAD, '').trim();
}

/** "Jan 20" for this year, "Jan 20, 2025" otherwise. */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * "Jul 28", or "Jul 28, 2025" outside the current year.
 *
 * Takes only the date portion: this split the whole string on "-" and read the
 * third piece as the day, which turned "2026-07-28T09:14:00" into
 * Number("28T09:14:00") — NaN. Every row in the inbox read "Aug NaN", because
 * the mailbox export carries times and the notices do not.
 *
 * An unreadable date returns an em dash rather than a broken string. A date
 * that cannot be parsed is missing information, and "—" says that; "NaN" says
 * the software is broken, which is a different claim.
 */
export function shortDate(iso: string, now = new Date()): string {
  const [y, m, d] = (iso ?? '').slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '—';
  if (m < 1 || m > 12 || d < 1 || d > 31) return '—';

  const month = MONTHS[m - 1];
  return y === now.getFullYear() ? `${month} ${d}` : `${month} ${d}, ${y}`;
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
