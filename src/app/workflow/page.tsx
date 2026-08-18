import ResetDemo from '@/components/ResetDemo';
import { Badge, Note, Panel, Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STAGES: Array<{ n: string; title: string; body: string; state: 'built' | 'stub' }> = [
  {
    n: '01',
    title: 'Ingest',
    body: 'Reads a local dataset of sample notices. No live mailbox connector in the prototype.',
    state: 'built',
  },
  {
    n: '02',
    title: 'Classify + extract',
    body: 'The trained classifier reads the category and its confidence; rules read status and the structured fields. 97.8% on 226 real notices against an 88.9% baseline.',
    state: 'built',
  },
  {
    n: '03',
    title: 'Route',
    body: 'Clean + high confidence + explicitly non-production + planned → forward the original email untouched. Anything else → human review.',
    state: 'built',
  },
  {
    n: '04',
    title: 'Precedent lookup',
    body: 'Borderline cases are matched against prior human rulings. Surfaced as reference context, never as an auto-decision.',
    state: 'stub',
  },
  {
    n: '05',
    title: 'Human review (blind-first)',
    body: 'Reviewer sees the notice and extracted fields, records their own call plus a written reason, and only then sees the engine output, redaction flags and precedents.',
    state: 'built',
  },
  {
    n: '06',
    title: 'Store decision',
    body: 'The human ruling and reason go into the precedent table. The engine output is snapshotted for override reporting only.',
    state: 'built',
  },
  {
    n: '07',
    title: 'Generate (on request)',
    body: 'Select an event, press one of two buttons. Infographic and executive summary render from the same extracted JSON into two fixed templates, both requiring named approval.',
    state: 'built',
  },
];

const RULES: Array<[string, string]> = [
  [
    'Auto-send never carries generated content',
    'The auto-send path forwards the original email byte for byte. Generated artifacts are drafted on request and gated separately.',
  ],
  [
    'Blind-first review',
    'The API withholds the engine assessment, redaction flags and precedents until a decision is written. The client cannot reveal them early because it is never sent them.',
  ],
  [
    'Only human decisions become precedent',
    'The precedents table has no column for the engine guess. The system never learns from its own output.',
  ],
  [
    'A written reason is mandatory',
    'A decision under ten characters of justification is rejected at the API, not just discouraged in the UI.',
  ],
  [
    'Regenerating drops approval',
    'Regenerating an artifact resets it to draft, so nobody inherits an approval for content they never saw.',
  ],
  [
    'Exact patterns use exact matching',
    'IP addresses and host names are found with regexes. A language model is not asked to do pattern matching it cannot do reliably.',
  ],
  [
    'Unstated environment is treated as risk',
    'A notice that never says whether production is affected does not qualify for auto-send.',
  ],
];

export default function WorkflowPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Panel
        title="How it works"
        description="Pipeline, governance position, and what is real versus placeholder in this prototype."
      >
        <Note tone="blue" icon="shield">
          <strong>AI sorts and drafts; only humans publish.</strong> Auto-send forwards the
          original, unmodified email and nothing else. No generated content reaches a recipient
          without a named person approving it — a hard rule in the routing code and the approval
          endpoint, not a threshold anyone can turn down.
        </Note>

        <Section title="Pipeline">
          <ol className="space-y-1.5">
            {STAGES.map((s) => (
              <li key={s.n} className="card px-4 py-3 flex gap-3.5">
                <span className="font-mono text-[11px] text-faint shrink-0 mt-0.5">{s.n}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-medium text-[13px] text-fg">{s.title}</span>
                    <Badge signal={s.state === 'built' ? 'green' : 'amber'}>
                      {s.state === 'built' ? 'built' : 'placeholder'}
                    </Badge>
                  </div>
                  <p className="text-[12.5px] text-muted mt-1">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Governance decisions baked into the code">
          <ul className="space-y-2.5 text-[12.5px]">
            {RULES.map(([title, body]) => (
              <li key={title} className="border-l border-border pl-4">
                <div className="font-medium text-fg">{title}</div>
                <div className="text-muted mt-0.5">{body}</div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Run the demo"
          hint="The app starts empty. Ingest is an explicit action so the pipeline can be watched rather than arrived at."
        >
          <ResetDemo />
        </Section>

        <Section title="What is real and what is not">
          <Note tone="blue" icon="check">
            <div>
              <strong>The category classifier is trained and running.</strong> Logistic regression
              over Amazon Titan embeddings, learned from 458 synthetic notices labelled by a
              three-model panel, then scored once on 226 real ones: 97.8% against an 88.9%
              majority-class baseline. It ships as{' '}
              <code className="font-mono">weights.json</code> — eight rows of numbers — so there is
              no model server to host and no Python at runtime.
            </div>
          </Note>
          <Note tone="amber" icon="warning">
            <div>
              <strong>Status, extraction and precedent similarity are still rules.</strong> We
              trained a category model and nothing else, so a status shown here comes from wording,
              not from a model. Each sits behind a stable signature —{' '}
              <code className="font-mono">extract()</code>,{' '}
              <code className="font-mono">findSimilar()</code> — so replacing one touches that file
              and nothing else.
            </div>
          </Note>
          <Note tone="amber" icon="warning">
            <div>
              <strong>No human has labelled anything yet.</strong> Both the training labels and the
              answer key came from models. Until a person labels a stratified sample and we compute
              Cohen&rsquo;s kappa, every accuracy figure in this app is models agreeing with models.
            </div>
          </Note>
        </Section>
      </Panel>
    </div>
  );
}
