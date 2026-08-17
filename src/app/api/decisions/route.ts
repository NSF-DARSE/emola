import { NextResponse } from 'next/server';

import { getNotification, precedentsFor, submitDecision } from '@/lib/db';
import { isCategory, isStatus } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

/**
 * Records a reviewer's decision, then — and only then — returns the reveal
 * payload: what the model had said, the redaction flags, and similar past
 * precedents. The client never holds any of that before the decision is
 * written, so the blind-first flow is enforced by the API surface rather than
 * by hiding things in the DOM.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const notificationId = String(body.notificationId ?? '');
  const decision = String(body.decision ?? '');
  const humanPrimary = String(body.humanPrimary ?? '');
  const humanStatus = String(body.humanStatus ?? '');
  const reason = String(body.reason ?? '');
  const reviewer = String(body.reviewer ?? '').trim();
  const humanSecondary = Array.isArray(body.humanSecondary) ? body.humanSecondary.map(String) : [];

  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject".' }, { status: 400 });
  }
  if (!isCategory(humanPrimary)) {
    return NextResponse.json({ error: 'A primary category is required.' }, { status: 400 });
  }
  if (!isStatus(humanStatus)) {
    return NextResponse.json({ error: 'A status is required.' }, { status: 400 });
  }
  if (!humanSecondary.every(isCategory)) {
    return NextResponse.json({ error: 'Secondary tags must be valid categories.' }, { status: 400 });
  }
  if (reason.trim().length < 10) {
    return NextResponse.json(
      { error: 'A written reason of at least 10 characters is required before a decision is stored.' },
      { status: 400 },
    );
  }
  if (!reviewer) {
    return NextResponse.json({ error: 'Reviewer name is required.' }, { status: 400 });
  }

  try {
    const record = submitDecision({
      notificationId,
      decision,
      humanPrimary,
      humanSecondary: humanSecondary.filter(isCategory),
      humanStatus,
      reason,
      reviewer,
    });

    const n = getNotification(notificationId)!;

    return NextResponse.json({
      decision: record,
      reveal: {
        model: n.model,
        safety: n.safety,
        routeReasons: n.routeReasons,
        precedents: precedentsFor(n),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not record the decision.' },
      { status: 400 },
    );
  }
}
