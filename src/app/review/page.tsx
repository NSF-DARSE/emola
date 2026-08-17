import Link from 'next/link';

import { Badge, CategoryLabel, Dot, Empty, Note } from '@/components/ui';
import { getReviewQueue, listNotifications } from '@/lib/db';
import { shortDate, subjectFor } from '@/lib/mail';
import { eventSignal, SIGNAL_VAR } from '@/lib/severity';

export const dynamic = 'force-dynamic';

export default function ReviewQueuePage() {
  const queue = getReviewQueue();
  const decided = listNotifications().filter((n) => n.reviewState !== 'pending');

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-11 shrink-0 border-b border-border flex items-center gap-3 px-5">
        <h1 className="text-[13px] font-semibold tracking-[-0.01em]">Review queue</h1>
        <span className="font-mono text-[11px] text-faint">{queue.length}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 pt-5 max-w-[900px]">
          <Note tone="blue" icon="eyeOff">
            <strong>Blind-first.</strong> Opening an item shows the notice and the extracted fields
            only — the engine&apos;s category, confidence and redaction flags stay hidden until
            after you record your own call.
          </Note>
        </div>

        <div className="mt-4">
          {queue.map((n) => (
            <Link key={n.id} href={`/review/${n.id}`} className="trow h-auto py-2.5">
              <span className="trow-bar" style={{ background: SIGNAL_VAR[eventSignal(n)] }} />
              <span className="hidden md:block w-[104px] shrink-0">
                <CategoryLabel value={n.model.primary} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-medium text-fg truncate">
                  {subjectFor(n)}
                </span>
                <span className="block text-[12px] text-faint truncate mt-0.5">
                  <span className="md:hidden">{n.model.primary} · </span>
                  {n.routeReasons.join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] text-faint w-[64px] text-right">
                {shortDate(n.receivedAt)}
              </span>
            </Link>
          ))}
          {queue.length === 0 && <Empty>Queue is clear.</Empty>}
        </div>

        {decided.length > 0 && (
          <div className="mt-8">
            <div className="px-5 pb-2 label">Already decided</div>
            {decided.map((n) => (
              <Link key={n.id} href={`/?selected=${n.id}`} className="trow">
                <span className="trow-bar" style={{ background: SIGNAL_VAR[eventSignal(n)] }} />
                <span className="shrink-0">
                  <Badge signal={n.reviewState === 'approved' ? 'green' : 'red'}>
                    <Dot signal={n.reviewState === 'approved' ? 'green' : 'red'} size={6} />
                    {n.reviewState}
                  </Badge>
                </span>
                <span className="flex-1 min-w-0 text-[13.5px] text-muted truncate">
                  {subjectFor(n)}
                </span>
                <span className="hidden sm:block shrink-0 text-[12.5px] text-faint w-[64px] text-right">
                  {shortDate(n.receivedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
