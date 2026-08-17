import type { PeriodReportPayload } from '@/lib/llm/period-report';
import { SIGNAL_VAR, type Signal } from '@/lib/severity';

const RISK_SIGNAL: Record<PeriodReportPayload['riskLevel'], Signal> = {
  Low: 'green',
  Moderate: 'amber',
  Elevated: 'red',
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border rounded-lg px-3 py-2.5 bg-elevated">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="text-[19px] font-semibold tabular-nums mt-0.5 text-fg">{value}</div>
    </div>
  );
}

export default function PeriodReport({ data }: { data: PeriodReportPayload }) {
  const signal = RISK_SIGNAL[data.riskLevel];
  const color = SIGNAL_VAR[signal];

  return (
    <article className="card overflow-hidden">
      <div className="px-4 sm:px-6 py-5 border-b border-border relative">
        <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color }} />
        <div className="label">Operations report · {data.periodLabel}</div>
        <h3 className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-fg">
          {data.headline}
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <span className={`badge badge-${signal}`}>{data.riskLevel} risk</span>
          <span className="badge">Written by Claude on Bedrock</span>
          <span className="badge">{data.stats.total} notices</span>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-6 text-[13.5px] text-fg">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Stat label="Notices" value={data.stats.total} />
          <Stat label="Sent as-is" value={data.stats.autoSent} />
          <Stat label="Held for review" value={data.stats.heldForReview} />
          <Stat label="Touched production" value={data.stats.productionTouching} />
        </div>

        <div>
          <div className="label mb-2">What happened</div>
          <p>{data.summary}</p>
        </div>

        <div>
          <div className="label mb-2">Operational risk</div>
          <p>{data.operationalRisk}</p>
        </div>

        {data.themes.length > 0 && (
          <div>
            <div className="label mb-2">Patterns across the period</div>
            <ul className="space-y-1.5">
              {data.themes.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="text-faint shrink-0">—</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.notableEvents.length > 0 && (
          <div>
            <div className="label mb-2">Notable individual events</div>
            <ul className="space-y-1.5">
              {data.notableEvents.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="text-faint shrink-0">—</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="label mb-2">Decisions for leadership</div>
          <ol className="space-y-1.5">
            {data.decisions.map((d, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-[11px] text-faint shrink-0 mt-1">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="label mb-2">Breakdown</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.stats.byCategory).map(([k, v]) => (
              <span key={k} className="badge">
                {k} {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {data.outbound && (
        <details className="px-4 sm:px-6 py-3 border-t border-border">
          <summary className="text-[12.5px] text-muted hover:text-fg">
            Exactly what was sent to AWS — {data.stats.total} notices, anonymised
          </summary>
          <pre className="mt-2.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-elevated border border-border rounded-md p-3 text-muted max-h-80 overflow-y-auto">
            {data.outbound}
          </pre>
        </details>
      )}

      <footer className="px-4 sm:px-6 py-3 border-t border-border bg-elevated text-[11.5px] text-faint">
        {data.governanceNote}
      </footer>
    </article>
  );
}
