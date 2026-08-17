import { NextResponse } from 'next/server';

import { buildExecSummary, buildInfographic } from '@/lib/artifacts';
import { getNotification, upsertArtifact } from '@/lib/db';
import { isBedrockConfigured } from '@/lib/llm/bedrock';
import { generateExecSummary, outboundPreview } from '@/lib/llm/exec-summary-llm';
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

  if (kind === 'infographic') {
    return NextResponse.json({ artifact: upsertArtifact(n.id, kind, buildInfographic(n, parent)) });
  }

  // Executive summary: AI-drafted when Bedrock is configured, otherwise the
  // deterministic template. Either way the result is a draft needing approval.
  if (isBedrockConfigured()) {
    try {
      const payload = await generateExecSummary(n);
      return NextResponse.json({
        artifact: upsertArtifact(n.id, kind, {
          ...payload,
          source: 'ai' as const,
          outbound: outboundPreview(n),
        }),
      });
    } catch (err) {
      // Never silently downgrade — the reviewer is told the AI path failed and
      // that what they are looking at came from the template instead.
      const reason = err instanceof Error ? err.message : 'unknown error';
      const fallback = buildExecSummary(n, parent);
      return NextResponse.json({
        artifact: upsertArtifact(n.id, kind, {
          ...fallback,
          source: 'template' as const,
          governanceNote: `${fallback.governanceNote} (AI drafting was attempted and failed: ${reason})`,
        }),
      });
    }
  }

  const fallback = buildExecSummary(n, parent);
  return NextResponse.json({
    artifact: upsertArtifact(n.id, kind, { ...fallback, source: 'template' as const }),
  });
}
