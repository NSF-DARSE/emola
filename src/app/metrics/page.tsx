import Odometer from '@/components/Odometer';
import { Note, Panel, Section } from '@/components/ui';
import {
  categoriesTooRareToJudge,
  categoriesWithoutRealExamples,
  readEvaluation,
  triageScore,
} from '@/lib/evaluation';
import { computeMetrics } from '@/lib/metrics';
import { CATEGORIES } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  // A value that is purely a number rolls; anything with a percent sign, a
  // slash or a decimal is left alone, because rolling "9/10" digit by digit
  // reads as nonsense.
  const rolls = /^\d+$/.test(value);
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums mt-1 text-fg">
        {rolls ? <Odometer value={Number(value)} /> : value}
      </div>
      {sub && <div className="font-mono text-[11px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

/** "a, b and c" — an Oxford-comma-free list, because these read as prose. */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export default function MetricsPage() {
  const m = computeMetrics();
  const evaluation = readEvaluation();
  const triage = triageScore();
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const unseen = categoriesWithoutRealExamples(CATEGORIES);
  const tooRare = categoriesTooRareToJudge();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Panel
        title="Evaluation"
        description={`Agreement against labelled notices, plus how often reviewers overrule the engine. Current engine: ${m.engine}.`}
      >
        <Note tone="amber" icon="flask">
          <strong>Every label here was produced by models, not people.</strong> The classifier was
          trained on notices three models agreed on, and scored against 226 real notices those same
          models labelled. Until a person labels a sample independently, this measures models
          agreeing with models — a real number, but not yet a validated one.
        </Note>

        <Section
          title="Stage 1 — finding abnormal events in the mailbox"
          hint={`Subject-line rules over all ${triage.total} emails in the export. A false alarm is the expensive mistake here: it puts routine mail in front of a reviewer.`}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Stat label="Emails" value={String(triage.total)} sub="in the export" />
            <Stat
              label="Abnormal events"
              value={String(triage.abnormal)}
              sub={`${pct(triage.prevalence)} of the mailbox`}
            />
            <Stat
              label="Found"
              value={`${triage.found}/${triage.abnormal}`}
              sub={triage.missed === 0 ? 'none missed' : `${triage.missed} missed`}
            />
            <Stat
              label="False alarms"
              value={String(triage.falseAlarms)}
              sub={`out of ${triage.total - triage.abnormal} routine`}
            />
          </div>
        </Section>

        {evaluation && (
          <Section
            title="Stage 2 — the trained classifier"
            hint={`Trained on ${evaluation.trainedOn} synthetic notices, then scored once on ${evaluation.testedOn} real ones it had never seen.`}
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Stat
                label="Accuracy"
                value={pct(evaluation.accuracy)}
                sub={`${evaluation.testedOn} real notices`}
              />
              <Stat
                label="Baseline to beat"
                value={pct(evaluation.baseline)}
                sub={`always "${evaluation.baselineLabel}"`}
              />
              <Stat
                label="Any defensible label"
                value={pct(evaluation.lenientAccuracy)}
                sub="dual-natured notices allowed"
              />
              <Stat
                label="Macro F1"
                value={evaluation.macroF1.toFixed(2)}
                sub="all categories equally"
              />
            </div>

            <Note tone="amber" icon="warning">
              <strong>Read the per-category numbers, not the accuracy.</strong> 88.9% of real
              notices are Maintenance, so a model that says &ldquo;Maintenance&rdquo; every time
              scores {pct(evaluation.baseline)}. Macro F1 is low for the same reason — it averages
              categories that barely occur in real mail.
            </Note>

            <div className="card overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[440px]">
                <thead>
                  <tr className="bg-elevated border-b border-border">
                    <th className="text-left px-3 py-2 label">Category</th>
                    <th className="text-right px-3 py-2 label">Real notices</th>
                    <th className="text-right px-3 py-2 label">Precision</th>
                    <th className="text-right px-3 py-2 label">Recall</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.perCategory.map((c) => (
                    <tr key={c.category} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{c.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{c.support}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.support === 0 ? '—' : c.precision.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.support === 0 ? '—' : c.recall.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12.5px] text-muted leading-relaxed">
              A category with one or two real notices tells you nothing reliable — a single
              decision moves its score by half. Only Maintenance and Outage have enough real
              examples to judge.
            </p>
          </Section>
        )}

        <Section
          title="Demo corpus agreement"
          hint={`Only ${m.holdout.n} notices, so each one is worth ${(100 / Math.max(m.holdout.n, 1)).toFixed(0)} percentage points. This shows the pipeline working end to end; it is not an evaluation.`}
        >
          <Note tone="amber" icon="warning">
            <strong>Do not quote these numbers.</strong> With {m.holdout.n} notices they land on
            round figures that look more precise than they are. The evaluation above is the one
            that means something.
          </Note>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
            <div className="card overflow-hidden">
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
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
            <p className="text-[12.5px] text-muted">
              No decisions recorded yet — work an item in the review queue and this fills in.
            </p>
          )}
        </Section>

        <Section title="Routing split">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Stat label="Ingested" value={String(m.routing.total)} />
            <Stat label="Auto-sent" value={String(m.routing.autoSend)} />
            <Stat label="Held" value={String(m.routing.humanReview)} />
            <Stat label="Pending" value={String(m.routing.pending)} />
          </div>
        </Section>

        <Section title="Data coverage caveat">
          <Note tone="red" icon="warning">
            <div>
              <strong>
                {unseen.length > 0
                  ? `${unseen.length} categories never appear in the real corpus: ${list(unseen)}.`
                  : 'Every category appears at least once in the real corpus.'}
              </strong>{' '}
              {tooRare.length > 0 && (
                <>
                  {list(tooRare)} {tooRare.length === 1 ? 'appears' : 'appear'} only a handful of
                  times, which is too few to conclude anything from.{' '}
                </>
              )}
              The classifier can be trained on those categories but not validated on them, so any
              claim about how it performs there is unsupported until DOF supplies real examples.
            </div>
          </Note>
        </Section>
      </Panel>
    </div>
  );
}
