import { NextResponse } from 'next/server';

import { buildExecSummary, buildInfographic } from '@/lib/artifacts';
import { getNotification, upsertArtifact } from '@/lib/db';
import type { ArtifactKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Stage 7 — draft an artifact. Drafting is always allowed; releasing is not.
 * Everything created here lands in `draft` and needs a named human approval
 * before it can be sent (see ./approve/route.ts).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const notificationId = String(body.notificationId ?? '');
  const kind = String(body.kind ?? '') as ArtifactKind;

  if (kind !== 'infographic' && kind !== 'exec_summary') {
    return NextResponse.json({ error: 'kind must be "infographic" or "exec_summary".' }, { status: 400 });
  }

  const n = getNotification(notificationId);
  if (!n) return NextResponse.json({ error: 'Unknown notification.' }, { status: 404 });

  const parent = n.threadParentId ? getNotification(n.threadParentId) : null;
  const payload = kind === 'infographic' ? buildInfographic(n, parent) : buildExecSummary(n, parent);

  const record = upsertArtifact(n.id, kind, payload);
  return NextResponse.json({ artifact: record });
}
