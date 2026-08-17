/**
 * Maps a notification onto the signal palette.
 *
 * Two independent signals, because collapsing them floods the table with one
 * colour: the left bar carries EVENT severity, the right dot carries REVIEW
 * state. Category never gets a colour — it is rendered as a mono label.
 */

import type { NotificationRecord } from './types';

export type Signal = 'red' | 'amber' | 'green' | 'blue' | 'neutral';

/** Left edge bar — how serious the event itself is. */
export function eventSignal(n: NotificationRecord): Signal {
  if (n.model.primary === 'Security' || n.model.secondary.includes('Security')) return 'red';
  if (n.model.status === 'active') return 'red';
  if (n.model.status === 'resolved') return 'green';
  if (n.model.status === 'updated') return 'amber';
  if (n.model.status === 'scheduled') return 'blue';
  return 'neutral';
}

/** Right side dot — where this sits in the approval workflow. */
export function reviewSignal(n: NotificationRecord): { signal: Signal; label: string } {
  if (n.route === 'auto_send') return { signal: 'green', label: 'Sent as-is' };
  if (n.reviewState === 'approved') return { signal: 'green', label: 'Approved' };
  if (n.reviewState === 'rejected') return { signal: 'red', label: 'Rejected' };
  return { signal: 'amber', label: 'Needs review' };
}

export const SIGNAL_VAR: Record<Signal, string> = {
  red: 'var(--sig-red)',
  amber: 'var(--sig-amber)',
  green: 'var(--sig-green)',
  blue: 'var(--sig-blue)',
  neutral: 'var(--border-strong)',
};
