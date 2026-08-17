import { NextResponse } from 'next/server';

import { getArtifact, setArtifactApproval } from '@/lib/db';
import { assertHumanApproved } from '@/lib/routing';
import type { ArtifactKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The release gate for AI-generated content. There is no code path that marks
 * an artifact approved without a named human on the request — the auto-send
 * route forwards the original email only and never reaches this endpoint.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const notificationId = String(body.notificationId ?? '');
  const kind = String(body.kind ?? '') as ArtifactKind;
  const state = String(body.state ?? '');
  const approver = typeof body.approver === 'string' ? body.approver.trim() : '';

  if (kind !== 'infographic' && kind !== 'exec_summary') {
    return NextResponse.json({ error: 'kind must be "infographic" or "exec_summary".' }, { status: 400 });
  }
  if (state !== 'approved' && state !== 'rejected') {
    return NextResponse.json({ error: 'state must be "approved" or "rejected".' }, { status: 400 });
  }

  try {
    assertHumanApproved(approver);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Approver required.' },
      { status: 400 },
    );
  }

  if (!getArtifact(notificationId, kind)) {
    return NextResponse.json({ error: 'No draft to act on.' }, { status: 404 });
  }

  return NextResponse.json({ artifact: setArtifactApproval(notificationId, kind, state, approver) });
}
