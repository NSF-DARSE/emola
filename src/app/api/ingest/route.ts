import { NextResponse } from 'next/server';

import { ingestMailbox, listNotifications, resetMailbox } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Pulls the mailbox in, and returns each notice with the result of every stage
 * so the interface can play the pipeline back rather than just showing a
 * finished table.
 *
 * The stage results are computed during ingest exactly as they always are —
 * nothing here is staged for the demo. The animation is a replay of real work,
 * not a re-enactment of it.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('reset') === '1') resetMailbox();

  ingestMailbox();

  const notices = listNotifications().map((n) => ({
    id: n.id,
    receivedAt: n.receivedAt,
    subject: n.body.split('\n')[0].slice(0, 78),
    category: n.model.primary,
    confidence: n.model.confidence,
    route: n.route,
    holdReasons: n.routeReasons,
    flagged: !n.safety.clean,
    engine: n.model.engine,
  }));

  return NextResponse.json({ count: notices.length, notices });
}

export async function DELETE() {
  try {
    resetMailbox();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not clear the mailbox.' },
      { status: 500 },
    );
  }
}
