import { Note, Panel, Section } from '@/components/ui';
import { computeMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums mt-1 text-fg">
        {value}
      </div>
      {sub && <div className="font-mono text-[11px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

export default function MetricsPage() {
  const m = computeMetrics();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Panel
        title="Evaluation"
        description={`Agreement against labelled notices, plus how often reviewers overrule the engine. Current engine: ${m.engine}.`}
      >
        <Note tone="amber" icon="flask">
          <strong>These numbers score a placeholder rules engine, not a trained classifier.</strong>{' '}
          They exist so the harness is in place — treat them as a baseline to beat, not a result.
        </Note>

        <Section
          title="Holdout agreement"
          hint={`${m.holdout.n} labelled real notices held out. Synthetic notices are excluded — they were written to exercise the pipeline and would flatter the score.`}
        >
          <Note tone="red" icon="alert">
            <strong>Not yet a generalisation estimate.</strong> The placeholder rules were
            hand-written with all 30 labels visible, so the holdout was never truly held out. A high
            score measures how well the rules were fitted, not how the system would do on an unseen
            notice.
          </Note>
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            <Stat
              label="Category"
              value={`${m.holdout.categoryRate}%`}
              sub={`${m.holdout.categoryMatches}/${m.holdout.n}`}
            />
            <Stat
              label="Status"
              value={`${m.holdout.statusRate}%`}
              sub={`${m.holdout.statusMatches}/${m.holdout.n}`}
            />
            <Stat
              label="Both axes"
              value={`${m.holdout.exactRate}%`}
              sub={`${m.holdout.bothMatch}/${m.holdout.n}`}
            />
          </div>

          {m.holdout.misses.length > 0 && (
            <div className="mt-3 card overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-elevated border-b border-border">
                    <th className="text-left px-3 py-2 label">Notice</th>
                    <th className="text-left px-3 py-2 label">Labelled</th>
                    <th className="text-left px-3 py-2 label">Engine</th>
                    <th className="text-left px-3 py-2 label">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {m.holdout.misses.map((x) => (
                    <tr key={x.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px]">{x.id}</td>
                      <td className="px-3 py-2">
                        {x.goldPrimary} / {x.goldStatus}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {x.modelPrimary} / {x.modelStatus}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {Math.round(x.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Human override rate"
          hint="Measured on decisions actually recorded in the review queue. A high rate is a signal about the engine, not about the reviewers."
        >
          <div className="grid grid-cols-4 gap-2.5">
            <Stat label="Decisions" value={String(m.overrides.decisions)} />
            <Stat
              label="Overridden"
              value={`${m.overrides.overrideRate}%`}
              sub={`${m.overrides.anyOverride}/${m.overrides.decisions}`}
            />
            <Stat label="Category changed" value={String(m.overrides.categoryOverrides)} />
            <Stat label="Status changed" value={String(m.overrides.statusOverrides)} />
          </div>
          {m.overrides.decisions === 0 && (
            <p className="mt-3 text-[12.5px] text-muted">
              No decisions recorded yet — work an item in the review queue and this fills in.
            </p>
          )}
        </Section>

        <Section title="Routing split">
          <div className="grid grid-cols-4 gap-2.5">
            <Stat label="Ingested" value={String(m.routing.total)} />
            <Stat label="Auto-sent" value={String(m.routing.autoSend)} />
            <Stat label="Held" value={String(m.routing.humanReview)} />
            <Stat label="Pending" value={String(m.routing.pending)} />
          </div>
        </Section>

        <Section title="Data coverage caveat">
          <Note tone="red" icon="warning">
            <div>
              <strong>No real examples exist for: {m.syntheticOnlyCategories.join(', ')}.</strong>{' '}
              The {m.syntheticCount} synthetic notices were written by us to exercise the classifier
              and the redaction path, and are excluded from every accuracy number above. Any claim
              about performance on those categories is unsupported until DOF supplies real examples.
            </div>
          </Note>
        </Section>
      </Panel>
    </div>
  );
}
