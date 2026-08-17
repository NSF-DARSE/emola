import { NextResponse } from 'next/server';

import { getNotification } from '@/lib/db';
import { isBedrockConfigured } from '@/lib/llm/bedrock';
import { generatePeriodReport } from '@/lib/llm/period-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Draft a period report over a selection of notices. Like every other
 * generated artifact this comes back as a draft — it is not sent anywhere.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one notification.' }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json(
      { error: 'That is too many notices for one report. Select 200 or fewer.' },
      { status: 400 },
    );
  }

  const notices = ids.map((id) => getNotification(id)).filter((n): n is NonNullable<typeof n> => n !== null);
  if (notices.length === 0) {
    return NextResponse.json({ error: 'None of those notifications exist.' }, { status: 404 });
  }

  if (!isBedrockConfigured()) {
    return NextResponse.json(
      {
        error:
          'Bedrock is not configured, so no report can be drafted. Add AWS_BEARER_TOKEN_BEDROCK to .env.',
      },
      { status: 503 },
    );
  }

  try {
    const report = await generatePeriodReport(notices);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not draft the report.' },
      { status: 502 },
    );
  }
}
