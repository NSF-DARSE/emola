import type { ExecSummaryPayload } from '@/lib/artifacts';
import { SIGNAL_VAR, type Signal } from '@/lib/severity';

const RISK_SIGNAL: Record<ExecSummaryPayload['riskLevel'], Signal> = {
  Low: 'green',
  Moderate: 'amber',
  Elevated: 'red',
};

/**
 * Leadership-facing template. Same extracted JSON as the infographic, a
 * different question: business impact, operational risk, what needs deciding.
 */
export default function ExecSummary({ data }: { data: ExecSummaryPayload }) {
  const signal = RISK_SIGNAL[data.riskLevel];
  const color = SIGNAL_VAR[signal];

  return (
    <article className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-border relative">
        <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color }} />
        <div className="label">Executive summary</div>
        <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-fg">
          {data.headline}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <span className={`badge badge-${signal}`}>{data.riskLevel} risk</span>
          {data.source && (
            <span className="badge">
              {data.source === 'ai' ? 'Written by Claude on Bedrock' : 'Template'}
            </span>
          )}
          <span className="text-[12px] text-muted">{data.window}</span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 text-[12.5px] text-fg">
        <div>
          <div className="label mb-1.5">Business impact</div>
          <p>{data.businessImpact}</p>
        </div>

        <div>
          <div className="label mb-1.5">Operational risk</div>
          <p>{data.operationalRisk}</p>
        </div>

        <div>
          <div className="label mb-1.5">Affected services</div>
          <div className="flex flex-wrap gap-1.5">
            {data.affectedServices.map((s) => (
              <span key={s} className="badge">
                {s}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="label mb-1.5">Decisions for leadership</div>
          <ol className="space-y-1">
            {data.decisions.map((d, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-mono text-[11px] text-faint shrink-0 mt-px">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {data.outbound && (
        <details className="px-5 py-3 border-t border-border">
          <summary className="text-[12.5px] text-muted hover:text-fg">
            Exactly what was sent to AWS — no host names, IP addresses or contacts
          </summary>
          <pre className="mt-2.5 whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed bg-elevated border border-border rounded-md p-3 text-muted max-h-64 overflow-y-auto">
            {data.outbound}
          </pre>
        </details>
      )}

      <footer className="px-5 py-2.5 border-t border-border bg-elevated text-[11px] text-faint">
        {data.governanceNote}
      </footer>
    </article>
  );
}
