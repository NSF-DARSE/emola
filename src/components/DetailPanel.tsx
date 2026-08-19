import Link from 'next/link';

import GenerateBar from '@/components/GenerateBar';
import Icon from '@/components/Icon';
import Resizable from '@/components/Resizable';
import { Badge, CategoryLabel, Dot, Field, Meter, Note, StatusBadge } from '@/components/ui';
import { getArtifact, getDecisionFor, getNotification } from '@/lib/db';
import { subjectFor } from '@/lib/mail';
import { redact } from '@/lib/redaction';
import { eventSignal, reviewSignal, SIGNAL_VAR, type Signal } from '@/lib/severity';
import { formatDuration, formatWindowPoint } from '@/lib/time';
import type { NotificationRecord } from '@/lib/types';

function spanSignal(kind: string): Signal {
  if (kind === 'ip_address') return 'red';
  if (kind === 'server_name') return 'amber';
  if (kind === 'unknown_term') return 'amber';
  return 'neutral';
}

export default function DetailPanel({
  notification: n,
  closeHref,
}: {
  notification: NotificationRecord;
  closeHref: string;
}) {
  const parent = n.threadParentId ? getNotification(n.threadParentId) : null;
  const decision = getDecisionFor(n.id);
  const review = reviewSignal(n);
  const w = n.extracted.window;
  const hasRedactable = n.safety.spans.some(
    (s) => s.kind === 'ip_address' || s.kind === 'server_name',
  );

  return (
    <Resizable id="detail" defaultWidth={560}>
    <aside className="w-full lg:border-l border-border bg-surface flex flex-col min-h-0 anim-slide">
      <div className="h-14 shrink-0 border-b border-border flex items-center gap-2.5 px-4">
        <span
          className="w-[3px] h-5 rounded-full"
          style={{ background: SIGNAL_VAR[eventSignal(n)] }}
        />
        <span className="text-[13px] text-muted">Notification details</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href={closeHref} className="rail-btn" title="Close" aria-label="Close panel">
            <Icon name="close" size={15} />
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
        <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-fg">
          {subjectFor(n)}
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <CategoryLabel value={n.model.primary} />
          <StatusBadge value={n.model.status} />
          <Badge signal={review.signal}>
            <Dot signal={review.signal} size={7} />
            {review.label}
          </Badge>
        </div>

        <div className="mt-2.5 text-[13px] text-faint">Received {n.receivedAt}</div>

        {n.synthetic && (
          <div className="mt-4">
            <Note tone="amber" icon="flask">
              <strong>Synthetic notice</strong> — not a real State of Delaware communication.{' '}
              {n.syntheticReason}
            </Note>
          </div>
        )}

        {parent && (
          <div className="mt-4">
            <Note tone="blue" icon="thread">
              Threaded onto{' '}
              <Link href={`/?selected=${parent.id}`} className="underline underline-offset-2">
                {parent.id}
              </Link>
              . Generated content describes the merged current state.
            </Note>
          </div>
        )}

        <div className="mt-4 text-[13px] leading-[1.65] whitespace-pre-wrap text-fg">{n.body}</div>

        <div className="mt-5 pt-5 border-t border-border">
          <GenerateBar
            notificationId={n.id}
            initial={{ infographic: getArtifact(n.id, 'infographic') ?? undefined }}
          />
        </div>

        {n.route === 'human_review' && n.reviewState === 'pending' && (
          <div className="mt-5">
            <Note tone="amber" icon="eyeOff">
              Held for review before anything goes out.{' '}
              <Link href={`/review/${n.id}`} className="underline underline-offset-2 font-medium">
                Open the blind review
              </Link>
              .
            </Note>
          </div>
        )}

        <details className="mt-5 card px-3.5 py-2.5">
          <summary className="flex items-center gap-1.5 text-[12px] text-muted hover:text-fg">
            <Icon name="chevronRight" size={13} />
            Pipeline detail
          </summary>

          <div className="mt-2.5">
            <Field label="Routing">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge signal={n.route === 'auto_send' ? 'green' : 'amber'}>
                  {n.route === 'auto_send' ? 'Original auto-sent' : 'Held for review'}
                </Badge>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-muted">
                {n.routeReasons.map((r, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-faint">–</span>
                    {r}
                  </li>
                ))}
              </ul>
            </Field>

            <Field label="Engine read">
              <div className="flex items-center gap-2 flex-wrap">
                <CategoryLabel value={n.model.primary} />
                {n.model.secondary.map((s) => (
                  <span key={s} className="label opacity-60">
                    {s}
                  </span>
                ))}
                <Meter value={n.model.confidence} />
              </div>
              <div className="mt-1 text-muted">{n.model.reasoning}</div>
            </Field>

            <Field label="Schedule">
              {w ? (
                <>
                  <span className="font-mono text-[11.5px]">
                    {formatWindowPoint(w.start)} → {formatWindowPoint(w.end)}
                  </span>
                  <span className="text-muted">
                    {' '}
                    · {formatDuration(w.durationMinutes)}
                    {w.crossesMidnight && ' · crosses midnight'}
                  </span>
                </>
              ) : (
                <span className="text-faint">Not parsable from this notice.</span>
              )}
            </Field>

            <Field label="Systems">
              {n.extracted.affectedSystems.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {n.extracted.affectedSystems.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-faint">Not itemised</span>
              )}
            </Field>

            <Field label={`Redaction ${n.safety.score.toFixed(2)}`}>
              {n.safety.spans.length === 0 ? (
                <span className="text-faint">Nothing flagged.</span>
              ) : (
                <ul className="space-y-1.5">
                  {n.safety.spans.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <Badge signal={spanSignal(s.kind)}>{s.kind.replace('_', ' ')}</Badge>
                      <code className="font-mono text-[11px] text-fg">{s.text}</code>
                      <span className="text-faint">{s.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            {hasRedactable && (
              <Field label="Redacted">
                <pre className="whitespace-pre-wrap font-sans text-[12px] bg-elevated border border-border rounded-md p-2.5 text-muted">
                  {redact(n.body, n.safety.spans)}
                </pre>
              </Field>
            )}

            {decision && (
              <Field label="Human decision">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge signal={decision.decision === 'approve' ? 'green' : 'red'}>
                    {decision.decision}
                  </Badge>
                  <CategoryLabel value={decision.humanPrimary} />
                  <span className="text-muted">{decision.reviewer}</span>
                </div>
                <div className="mt-1 text-fg">{decision.reason}</div>
                <div className="mt-1 text-faint">
                  Engine had said {decision.modelPrimaryAtDecision}/
                  {decision.modelStatusAtDecision} —{' '}
                  {decision.humanPrimary === decision.modelPrimaryAtDecision &&
                  decision.humanStatus === decision.modelStatusAtDecision
                    ? 'no override'
                    : 'overridden'}
                  .
                </div>
              </Field>
            )}
          </div>
        </details>
      </div>
    </aside>
    </Resizable>
  );
}
