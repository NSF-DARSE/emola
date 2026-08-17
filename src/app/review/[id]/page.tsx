import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import Icon from '@/components/Icon';
import { CategoryLabel, Note, StatusBadge } from '@/components/ui';
import { getNotification } from '@/lib/db';
import { subjectFor } from '@/lib/mail';
import { eventSignal, SIGNAL_VAR } from '@/lib/severity';
import { formatDuration, formatWindowPoint } from '@/lib/time';

import ReviewClient from './ReviewClient';

export const dynamic = 'force-dynamic';

export default function ReviewPage({ params }: { params: { id: string } }) {
  const n = getNotification(params.id);
  if (!n) notFound();
  if (n.reviewState !== 'pending') redirect(`/?selected=${n.id}`);

  const w = n.extracted.window;
  const windowLabel = w
    ? `${formatWindowPoint(w.start)} → ${formatWindowPoint(w.end)} · ${formatDuration(
        w.durationMinutes,
      )}${w.crossesMidnight ? ' · crosses midnight' : ''}`
    : 'No schedule could be normalised from this notice.';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-11 shrink-0 border-b border-border flex items-center gap-2 px-5">
        <Link href="/review" className="btn btn-ghost h-7 px-2">
          <Icon name="arrowLeft" size={14} />
          Queue
        </Link>
        <span className="w-px h-4 bg-border" />
        <span className="font-mono text-[11px] text-muted">{n.id}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-8 py-7 max-w-[860px]">
          <div className="flex items-start gap-3">
            <span
              className="w-[3px] self-stretch rounded-full shrink-0"
              style={{ background: SIGNAL_VAR[eventSignal(n)] }}
            />
            <div className="min-w-0">
              <h1 className="text-[19px] font-semibold tracking-[-0.01em] leading-snug">
                {subjectFor(n)}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <CategoryLabel value={n.model.primary} />
                <StatusBadge value={n.model.status} />
                <span className="font-mono text-[11px] text-faint">received {n.receivedAt}</span>
              </div>
            </div>
          </div>

          {n.synthetic && (
            <div className="mt-5">
              <Note tone="amber" icon="flask">
                <strong>Synthetic notice.</strong> {n.syntheticReason}
              </Note>
            </div>
          )}

          <div className="mt-5 card px-4 py-3.5">
            <div className="label mb-2">Original notice</div>
            <div className="text-[13px] leading-[1.65] whitespace-pre-wrap text-fg">{n.body}</div>
          </div>

          <div className="mt-5">
            <ReviewClient id={n.id} extracted={n.extracted} humanReadableWindow={windowLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}
