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
  try {
    return ingest(request);
  } catch (err) {
    /*
     * Without this the route threw straight through Next and came back as a
     * bare 500 with no body, so the client could only report the status code.
     * On a serverless host that is the difference between "something broke"
     * and "better_sqlite3.node is missing from the bundle".
     */
    const message = err instanceof Error ? err.message : String(err);
    console.error('Ingest failed:', err);
    return NextResponse.json(
      {
        error: message,
        // Named separately because the message alone rarely says which of the
        // three usual serverless causes it was.
        hint: message.includes('better_sqlite3') || message.includes('bindings')
          ? 'The SQLite native binary is not in the deployed bundle.'
          : message.includes('ENOENT')
            ? 'A data file the server reads at runtime was not deployed.'
            : message.includes('EROFS') || message.includes('read-only')
              ? 'The filesystem is read-only; the database path is not writable here.'
              : undefined,
      },
      { status: 500 },
    );
  }
}

function ingest(request: Request) {
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
