/*
 * Repair pass over labels.json.
 *
 *  1. Retries only the model/notice pairs that errored (network drops), so we
 *     do not pay to re-label 226 notices to fix 8.
 *  2. Recomputes agreement on the two axes SEPARATELY. The first run flagged a
 *     notice as "disagreement" when the models split on status even though they
 *     agreed on category, which overstated real disagreement.
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = env.AWS_BEARER_TOKEN_BEDROCK;
const REGION = env.AWS_REGION || 'us-west-2';

const MODELS = [
  { key: 'claude', id: 'us.anthropic.claude-opus-4-6-v1' },
  { key: 'llama', id: 'us.meta.llama4-maverick-17b-instruct-v1:0' },
  { key: 'nova', id: 'us.amazon.nova-pro-v1:0' },
];

const CATEGORIES = ['Maintenance','Security','Outage','Infrastructure','Compliance','Vendor','Application','Network'];
const STATUSES = ['scheduled','active','updated','resolved'];

const SYSTEM = fs.readFileSync('scripts/label-goldset.mjs','utf8')
  .split('const SYSTEM = `')[1].split('`;')[0];

const TOOL = { toolSpec: { name: 'classify_notice', description: 'Return the classification of this notice.',
  inputSchema: { json: { type: 'object', properties: {
    primary: { type: 'string', enum: CATEGORIES },
    secondary: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
    status: { type: 'string', enum: STATUSES },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  }, required: ['primary','status','confidence'] } } } };

async function classify(model, body, attempt = 1) {
  try {
    const res = await fetch(
      `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(model.id)}/converse`,
      { method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: [{ text: SYSTEM }],
          messages: [{ role: 'user', content: [{ text: `Classify this notice:\n\n${body}` }] }],
          inferenceConfig: { maxTokens: 600, temperature: 0 },
          toolConfig: { tools: [TOOL] },
        }) });
    if (!res.ok) throw new Error(`${res.status}`);
    const out = await res.json();
    const content = out.output?.message?.content ?? [];
    const call = content.find((c) => c.toolUse)?.toolUse?.input;
    if (call?.primary) return call;
    const m = content.map((c) => c.text ?? '').join('').match(/\{[\s\S]*\}/);
    if (m) { const p = JSON.parse(m[0]); if (p.primary) return p; }
    throw new Error('no classification');
  } catch (e) {
    // Transient network failures are the whole reason this pass exists.
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      return classify(model, body, attempt + 1);
    }
    throw e;
  }
}

function vote(values) {
  const tally = {};
  for (const v of values.filter(Boolean)) tally[v] = (tally[v] ?? 0) + 1;
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const [top, count] = sorted[0] ?? [null, 0];
  return { top, count, distinct: sorted.length, tally };
}

const rows = JSON.parse(fs.readFileSync('data/model/labels.json', 'utf8'));
const broken = rows.filter((r) => MODELS.some((m) => r.labels[m.key]?.error));
console.log(`retrying ${broken.length} notices with failed model calls\n`);

for (const row of broken) {
  for (const m of MODELS) {
    if (!row.labels[m.key]?.error) continue;
    try {
      row.labels[m.key] = await classify(m, row.body);
      console.log(`  fixed  ${row.id}  ${m.key}`);
    } catch (e) {
      console.log(`  STILL FAILING  ${row.id}  ${m.key}  ${e.message}`);
    }
  }
}

// Recompute both axes independently.
for (const row of rows) {
  const cats = MODELS.map((m) => row.labels[m.key]?.primary);
  const stats = MODELS.map((m) => row.labels[m.key]?.status);
  const c = vote(cats);
  const s = vote(stats);
  row.consensus = {
    primary: c.top, primaryVotes: c.count,
    status: s.top, statusVotes: s.count,
    categoryAgreement: c.count === 3 ? 'unanimous' : c.count === 2 ? 'majority' : 'split',
    statusAgreement: s.count === 3 ? 'unanimous' : s.count === 2 ? 'majority' : 'split',
    // Both models proposing a defensible category is not an error - record the
    // alternatives so evaluation can accept either.
    acceptableCategories: [...new Set(cats.filter(Boolean))],
    acceptableStatuses: [...new Set(stats.filter(Boolean))],
  };
}

fs.writeFileSync('data/model/labels.json', JSON.stringify(rows, null, 2));

const missing = rows.filter((r) => MODELS.some((m) => !r.labels[m.key]?.primary)).length;
const catA = {}, statA = {};
for (const r of rows) {
  catA[r.consensus.categoryAgreement] = (catA[r.consensus.categoryAgreement] ?? 0) + 1;
  statA[r.consensus.statusAgreement] = (statA[r.consensus.statusAgreement] ?? 0) + 1;
}
console.log(`\nincomplete rows remaining: ${missing}`);
console.log('\nCATEGORY agreement:', JSON.stringify(catA));
console.log('STATUS   agreement:', JSON.stringify(statA));
