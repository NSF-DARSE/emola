import Link from 'next/link';

import SwipeDeck, { type BlindCard } from '@/components/SwipeDeck';
import { Note } from '@/components/ui';
import { getReviewQueue, listNotifications } from '@/lib/db';
import { subjectFor } from '@/lib/mail';
import { formatDuration, formatWindowPoint } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * The queue is rendered as a deck rather than a table, and the projection
 * below is the reason it stays blind-first: only these fields cross to the
 * client. The model's category, confidence and reasoning are never serialised
 * into the page, so no amount of poking at the DOM reveals them early.
 */
export default function ReviewQueuePage() {
  const queue = getReviewQueue();
  const decided = listNotifications().filter((n) => n.reviewState !== 'pending');

  const cards: BlindCard[] = queue.map((n) => ({
    id: n.id,
    subject: subjectFor(n),
    body: n.body,
    receivedAt: n.receivedAt,
    systems: n.extracted.affectedSystems,
    // Format server-side: the card is a plain string so the deck never has
    // to know about window shapes, timezones or cross-midnight cases.
    window: n.extracted.window
      ? `${formatWindowPoint(n.extracted.window.start)} — ${formatWindowPoint(
          n.extracted.window.end,
        )} ${n.extracted.window.timezone} (${formatDuration(n.extracted.window.durationMinutes)})`
      : null,
  }));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 sm:px-6">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Review</h1>
        <span className="text-[13px] text-faint tabular-nums">{queue.length} waiting</span>
        {decided.length > 0 && (
          <Link
            href="/precedents"
            className="ml-auto text-[13px] text-muted hover:text-fg transition-colors"
          >
            {decided.length} already decided
          </Link>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="flex-1 grid place-items-center p-8">
          <div className="text-center max-w-[40ch]">
            <div className="text-[15px] font-semibold">Nothing waiting</div>
            <p className="text-[13.5px] text-muted mt-1.5 leading-relaxed">
              Every notice has been through a person.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-4 sm:px-6 pt-5 mx-auto w-full max-w-[720px]">
            <Note tone="blue" icon="eyeOff">
              <strong>You go first.</strong> The card shows the notice and nothing else. What the
              model thought is not in this page — it arrives only after your decision is written,
              so it cannot colour your read.
            </Note>
          </div>
          <SwipeDeck cards={cards} />
        </>
      )}
    </div>
  );
}
