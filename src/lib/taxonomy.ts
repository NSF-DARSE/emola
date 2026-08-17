// Two independent taxonomy axes. A notification always gets exactly one
// primary category, zero or more secondary tags drawn from the same set, and
// exactly one lifecycle status. Multi-category events are never collapsed into
// a single label.

export const CATEGORIES = [
  'Maintenance',
  'Security',
  'Outage',
  'Infrastructure',
  'Compliance',
  'Vendor',
  'Application',
  'Network',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['scheduled', 'active', 'updated', 'resolved'] as const;
export type Status = (typeof STATUSES)[number];

/*
 * Categories are shown spelled out everywhere. Colour is reserved for severity
 * and review state, so a category is styled as plain muted text rather than
 * given a hue of its own.
 */

/**
 * Categories with no real examples in the 30-notice sample set. Anything the
 * prototype shows for these is synthetic and must be labelled as such in the
 * final presentation.
 */
export const SYNTHETIC_ONLY_CATEGORIES: Category[] = ['Security', 'Compliance'];

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

export function isStatus(v: string): v is Status {
  return (STATUSES as readonly string[]).includes(v);
}
