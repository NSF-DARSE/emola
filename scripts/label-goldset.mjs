/*
 * Multi-model labelling run.
 *
 * Each notice is independently classified by three models from different
 * lineages. Independent is the point: models that share a family share their
 * blind spots, so their agreement would mean less than it appears to.
 *
 *   agree 3/3  -> high confidence answer key entry
 *   agree 2/3  -> majority, worth a human spot check
 *   split      -> genuinely ambiguous, needs a human
 *
 *   node scripts/label-goldset.mjs [limit]
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
  { key: 'claude', id: 'us.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6' },
  { key: 'llama', id: 'us.meta.llama4-maverick-17b-instruct-v1:0', label: 'Llama 4 Maverick' },
  { key: 'nova', id: 'us.amazon.nova-pro-v1:0', label: 'Nova Pro' },
];

// Fail fast on a dead key. Without this an expired token costs a full run of
// doomed requests before anyone notices - which is exactly what happened.
async function preflight() {
  const probeId = (typeof MODELS !== 'undefined' ? MODELS[0].id : GENERATORS[0].id);
  const r = await fetch(
    `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(probeId)}/converse`,
    { method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: [{ text: 'ok' }] }],
                             inferenceConfig: { maxTokens: 5 } }) });
  if (!r.ok) {
    const body = await r.text();
    if (/expired/i.test(body)) {
      console.error('STOPPING: your Bedrock key has expired.');
      console.error('Generate a new one (AWS Console > Bedrock > API keys, us-west-2)');
      console.error('and put it in .env as AWS_BEARER_TOKEN_BEDROCK.');
    } else {
      console.error(`STOPPING: Bedrock rejected the key (${r.status}): ${body.slice(0, 200)}`);
    }
    process.exit(1);
  }
}
await preflight();

const CATEGORIES = ['Maintenance', 'Security', 'Outage', 'Infrastructure', 'Compliance', 'Vendor', 'Application', 'Network'];
const STATUSES = ['scheduled', 'active', 'updated', 'resolved'];

const SYSTEM = `You classify IT service notices for the State of Delaware Department of Finance.

Two independent axes:

PRIMARY CATEGORY - what KIND of event this is. Exactly one of:
  Maintenance    planned work on systems
  Outage         something is broken or degraded, planned or not
  Security       a security incident, advisory, or threat
  Compliance     audit, attestation, regulatory freeze
  Vendor         a third party is the subject of the notice
  Infrastructure servers, data centres, power, network hardware
  Application    a named business application is the subject
  Network        connectivity, VPN, fibre, circuits

Choose the category describing the EVENT TYPE, not merely what it touches.
Maintenance on a server is Maintenance, not Infrastructure - Infrastructure
belongs in the secondary tags. Only choose Infrastructure, Application or
Network as PRIMARY when no event-type category fits.

STATUS - where in its lifecycle:
  scheduled  announced for the future
  active     happening now, unresolved
  updated    revises an earlier notice
  resolved   the issue is closed

Placeholders like [PERSON_1], [URL_3], [EMAIL_2] are redacted values. Ignore
them; they carry no classification signal.

Be decisive but honest: if the notice genuinely does not say, use a lower
confidence rather than inventing certainty.`;

const TOOL = {
  toolSpec: {
    name: 'classify_notice',
    description: 'Return the classification of this notice.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          primary: { type: 'string', enum: CATEGORIES },
          secondary: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
          status: { type: 'string', enum: STATUSES },
          confidence: { type: 'number', description: '0 to 1' },
          reasoning: { type: 'string', description: 'One short sentence.' },
        },
        required: ['primary', 'status', 'confidence'],
      },
    },
  },
};

async function classify(model, body) {
  const res = await fetch(
    `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(model.id)}/converse`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: [{ text: SYSTEM }],
        messages: [{ role: 'user', content: [{ text: `Classify this notice:\n\n${body}` }] }],
        inferenceConfig: { maxTokens: 600, temperature: 0 },
        toolConfig: { tools: [TOOL] },
      }),
    },
  );

  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  const out = await res.json();
  const content = out.output?.message?.content ?? [];

  const call = content.find((c) => c.toolUse)?.toolUse?.input;
  if (call?.primary) return call;

  // Some models return JSON as prose instead of a tool call.
  const text = content.map((c) => c.text ?? '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed.primary) return parsed;
    } catch { /* fall through */ }
  }
  throw new Error('no usable classification returned');
}

// ---------------------------------------------------------------------------
const rows = JSON.parse(fs.readFileSync('data/model/goldset.anon.json', 'utf8'));
const limit = Number(process.argv[2] || rows.length);
const work = rows.slice(0, limit);

console.log(`labelling ${work.length} notices with ${MODELS.length} models\n`);

const results = [];
const CONCURRENCY = 4;
let done = 0;

async function handle(row) {
  const labels = {};
  for (const model of MODELS) {
    try {
      labels[model.key] = await classify(model, row.body);
    } catch (e) {
      labels[model.key] = { error: String(e.message).slice(0, 100) };
    }
  }

  const votes = MODELS.map((m) => labels[m.key]?.primary).filter(Boolean);
  const tally = {};
  for (const v of votes) tally[v] = (tally[v] ?? 0) + 1;
  const [top, count] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  const sVotes = MODELS.map((m) => labels[m.key]?.status).filter(Boolean);
  const sTally = {};
  for (const v of sVotes) sTally[v] = (sTally[v] ?? 0) + 1;
  const [sTop, sCount] = Object.entries(sTally).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  results.push({
    id: row.id,
    received_at: row.received_at,
    body: row.body,
    labels,
    consensus: {
      primary: top,
      primaryVotes: count,
      status: sTop,
      statusVotes: sCount,
      // unanimous | majority | split
      agreement: count === MODELS.length && sCount === MODELS.length
        ? 'unanimous'
        : count >= 2 ? 'majority' : 'split',
    },
  });

  done += 1;
  if (done % 10 === 0 || done === work.length) {
    process.stdout.write(`\r  ${done}/${work.length}`);
  }
}

const queue = [...work];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await handle(queue.shift());
  }),
);

results.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync('data/model/labels.json', JSON.stringify(results, null, 2));

// ---- report ---------------------------------------------------------------
const agree = { unanimous: 0, majority: 0, split: 0 };
for (const r of results) agree[r.consensus.agreement] += 1;

console.log('\n\n=== agreement ===');
for (const [k, v] of Object.entries(agree)) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}  ${((v / results.length) * 100).toFixed(1)}%`);
}

console.log('\n=== per-model availability ===');
for (const m of MODELS) {
  const ok = results.filter((r) => r.labels[m.key]?.primary).length;
  console.log(`  ${m.label.padEnd(18)} ${ok}/${results.length} classified`);
}

console.log('\n=== consensus category spread ===');
const spread = {};
for (const r of results) spread[r.consensus.primary] = (spread[r.consensus.primary] ?? 0) + 1;
for (const [k, v] of Object.entries(spread).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padEnd(16)} ${v}`);
}

console.log(`\nwritten to data/model/labels.json`);
console.log(`${agree.split + agree.majority} notices need a human look.`);
