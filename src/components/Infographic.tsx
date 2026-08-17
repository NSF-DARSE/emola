import Icon from '@/components/Icon';
import type { InfographicPayload } from '@/lib/artifacts';
import { SIGNAL_VAR, type Signal } from '@/lib/severity';
import type { Status } from '@/lib/taxonomy';

const STATUS_SIGNAL: Record<string, Signal> = {
  scheduled: 'blue',
  active: 'red',
  updated: 'amber',
  resolved: 'green',
};

/**
 * Employee-facing template. Fixed layout — the model fills slots, it never
 * decides the design. Question it answers: what do I do, and when.
 */
export default function Infographic({ data }: { data: InfographicPayload }) {
  const signal = STATUS_SIGNAL[data.status as Status] ?? 'neutral';
  const color = SIGNAL_VAR[signal];

  return (
    <article className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-border relative">
        <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color }} />
        <div className="label" style={{ color }}>
          {data.eyebrow}
        </div>
        <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-fg">
          {data.headline}
        </h3>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <span className="cat">{data.category}</span>
          <span className={`badge badge-${signal}`}>{data.status}</span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {data.callouts.length > 0 && (
          <div className="space-y-1.5">
            {data.callouts.map((c, i) => (
              <div key={i} className="note note-amber">
                <span className="shrink-0 mt-px" style={{ color: 'var(--sig-amber)' }}>
                  <Icon name="warning" size={14} />
                </span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="label mb-2">When</div>
          {data.when ? (
            <div className="border border-border rounded-lg p-3.5 bg-elevated">
              <div className="font-mono text-[12.5px] text-fg">{data.when.start}</div>
              <div className="flex items-center gap-2 my-1.5">
                <span className="w-px h-3.5 bg-border-strong ml-[3px]" />
                <span className="text-[11px] text-muted">{data.when.duration}</span>
              </div>
              <div className="font-mono text-[12.5px] text-fg">{data.when.end}</div>
              <div className="mt-2 text-[11px] text-faint">
                {data.when.timezone}
                {data.when.crossesMidnight && ' · ends the following day'}
              </div>
            </div>
          ) : (
            <div className="text-[12.5px] text-faint">No window published in the notice.</div>
          )}
        </div>

        {data.timeline.length > 0 && (
          <div>
            <div className="label mb-2">System by system</div>
            <ul className="space-y-1.5">
              {data.timeline.map((t, i) => (
                <li key={i} className="flex gap-3 text-[12.5px] border-l border-border pl-3">
                  <span className="font-medium w-[130px] shrink-0 text-fg">{t.label}</span>
                  <span className="font-mono text-[11.5px] text-muted">
                    {t.start} → {t.end}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="label mb-2">What&apos;s affected</div>
          {data.systems.length ? (
            <div className="flex flex-wrap gap-1.5">
              {data.systems.map((s) => (
                <span key={s} className="badge">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-faint">Not itemised in the notice.</div>
          )}
          <p className="mt-2.5 text-[12.5px] text-fg">{data.impact}</p>
        </div>

        <div>
          <div className="label mb-2">What you need to do</div>
          <ul className="space-y-1.5">
            {data.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] text-fg">
                <span className="text-faint mt-px shrink-0">
                  <Icon name="chevronRight" size={12} />
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="px-5 py-2.5 border-t border-border bg-elevated flex justify-between gap-4 text-[11px] text-faint">
        <span>{data.contact ? `Questions: ${data.contact}` : 'State of Delaware Service Desk'}</span>
        <span>AI-drafted · requires approval</span>
      </footer>
    </article>
  );
}
