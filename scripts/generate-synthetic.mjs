/*
 * Inter-model synthetic training set.
 *
 * Generates balanced notices across all 8 categories x 4 statuses, spreading
 * the work over several model FAMILIES. Models from one lineage share their
 * habits, so a set written by one of them teaches the classifier that model's
 * voice rather than the concept. Every row records its generator so we can
 * check afterwards whether any single model skewed the result.
 *
 * Real anonymised notices are supplied as style anchors so the output reads
 * like DOF writing rather than like an LLM imagining government prose.
 *
 *   node scripts/generate-synthetic.mjs [perCombo]
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env','utf8').split(/\r?\n/)
    .filter(l=>l.trim()&&!l.trim().startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const KEY = env.AWS_BEARER_TOKEN_BEDROCK;
const REGION = env.AWS_REGION || 'us-west-2';

const GENERATORS = [
  { key:'claude', id:'us.anthropic.claude-opus-4-6-v1',              family:'Anthropic' },
  { key:'llama',  id:'us.meta.llama4-maverick-17b-instruct-v1:0',    family:'Meta' },
  { key:'nova',   id:'us.amazon.nova-pro-v1:0',                      family:'Amazon' },
  { key:'mistral',id:'us.mistral.pixtral-large-2502-v1:0',           family:'Mistral' },
  { key:'glm',    id:'zai.glm-4.7',                                  family:'Z.AI' },
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

const CATEGORIES = ['Maintenance','Security','Outage','Infrastructure','Compliance','Vendor','Application','Network'];
const STATUSES = ['scheduled','active','updated','resolved'];

const HINT = {
  // EVENT-TYPE categories. These describe what KIND of event it is, and are
  // what the taxonomy expects as PRIMARY.
  Maintenance:'planned work: patching, upgrades, migrations, config changes. Vary the SUBJECT widely - servers, a business application, network gear, a data centre, a vendor-run platform.',
  Outage:'something is broken or degraded right now, or has just been restored. Vary the SUBJECT - an application, a circuit, a data centre, a vendor service.',
  Security:'a security incident or advisory: suspicious activity, compromised credentials, mandatory security action, phishing campaign, emergency patch for an exploited vulnerability.',
  Compliance:'audit, attestation, regulatory freeze, IRS Pub 1075 assessment, records retention, mandatory training deadline.',
  Vendor:'the THIRD PARTY ITSELF is the story - a vendor outage, a vendor contract or support transition, a vendor security breach, end-of-support announcement. Not merely work a vendor happens to perform.',

  // SUBJECT categories. These are primary ONLY when the notice is purely
  // informational and no event-type framing applies. Generating these needs an
  // explicit steer or the model writes a maintenance notice every time.
  Infrastructure:'a purely INFORMATIONAL facilities or capacity notice with NO maintenance and NO outage: new data centre capacity available, a rack relocation policy, cooling capacity advisory, an equipment refresh programme announcement.',
  Application:'a purely INFORMATIONAL application notice with NO maintenance and NO outage: a new feature is available, a UI change, a reporting deadline in an application, a licence reallocation, training availability.',
  Network:'a purely INFORMATIONAL network notice with NO maintenance and NO outage: a new wifi SSID available, a bandwidth usage policy, an IP addressing standard, a change to remote access policy.',
};

// Style anchors from the real corpus (already anonymised).
const real = JSON.parse(fs.readFileSync('data/model/goldset.anon.json','utf8'));
const anchors = [real[3], real[60], real[150], real[200]]
  .filter(Boolean).map(r=>r.body.replace(/\s+/g,' ').slice(0,320));

const TOOL = { toolSpec:{ name:'emit_notices', description:'Return the generated notices.',
  inputSchema:{ json:{ type:'object', properties:{ notices:{ type:'array', items:{ type:'object',
    properties:{ body:{type:'string'} }, required:['body'] } } }, required:['notices'] } } } };

async function generate(gen, category, status, n, attempt = 1) {
  const system = `You write realistic internal IT service notices for the State of Delaware Department of Finance, for use as machine-learning training data.

House style, taken from real notices:
${anchors.map(a=>'  - "'+a+'"').join('\n')}

Match that register: plain, factual, bureaucratic, no marketing tone, no greeting flourishes beyond an occasional "Good morning,". Dates written as they appear above. Times in 24-hour or 12-hour form, varied.

Where a real notice would contain a host name, IP, email or link, write the placeholder [HOST_1], [IP_1], [EMAIL_1] or [URL_1] instead. Never invent real-looking addresses.

VARY HARD across the batch: different systems, different agencies, different lengths (one line to three paragraphs), different phrasing. Notices that all look alike are useless as training data.`;

  // Length must be orthogonal to category. If every Compliance notice is long
  // and every Outage is short, the classifier learns character count instead of
  // meaning - and then collapses on real mail, where the lengths are reversed.
  const BANDS = [
    'VERY SHORT: 1-2 sentences, roughly 120-200 characters. Terse, no sign-off.',
    'MEDIUM: roughly 250-400 characters. One short paragraph.',
    'LONG: roughly 550-850 characters. Two or three paragraphs, with detail and a contact line.',
  ];
  const spread = Array.from({ length: n }, (_, i) => `  Notice ${i + 1} — ${BANDS[i % BANDS.length]}`).join(String.fromCharCode(10));

  const user = `Write ${n} DIFFERENT notices that are unambiguously:
  CATEGORY: ${category} — ${HINT[category]}
  STATUS: ${status}

Each notice must hit a DIFFERENT length. Follow these exactly:
${spread}

The real corpus has a median of about 280 characters, so do not let everything drift long.

CRITICAL - the category is the KIND OF EVENT, not the thing it touches. Planned work is Maintenance even when it is network gear. A failure is an Outage even when it is an application. So:
${['Infrastructure','Application','Network'].includes(category)
  ? `These notices must contain NO planned work and NO failure - they are purely informational, or they will simply read as Maintenance or Outage.`
  : `Vary what the notice is ABOUT so the classifier does not learn to equate ${category} with one kind of system.`}

Every notice must clearly belong to that category and that status while reading like something a real DTI or DOF staffer typed.`;

  const res = await fetch(
    `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(gen.id)}/converse`,
    { method:'POST', headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},
      body: JSON.stringify({ system:[{text:system}], messages:[{role:'user',content:[{text:user}]}],
        inferenceConfig:{ maxTokens:4000, temperature:1 },
        toolConfig:{ tools:[TOOL] } }) });

  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0,90)}`);
  const out = await res.json();
  const content = out.output?.message?.content ?? [];
  let notices = content.find(c=>c.toolUse)?.toolUse?.input?.notices;
  if (!notices) {
    const m = content.map(c=>c.text??'').join('').match(/\{[\s\S]*\}/);
    if (m) { try { notices = JSON.parse(m[0]).notices; } catch {} }
  }
  if (!Array.isArray(notices)) throw new Error('no notices returned');
  return notices.map(x=>String(x.body||'').trim()).filter(b=>b.length>40);
}

async function generateWithRetry(gen, category, status, n) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await generate(gen, category, status, n); }
    catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  return [];
}

const PER = Number(process.argv[2] || 5);
const jobs = [];
for (const category of CATEGORIES)
  for (const status of STATUSES)
    for (const gen of GENERATORS)
      jobs.push({ gen, category, status });

console.log(`${jobs.length} generation jobs x ~${PER} notices = up to ${jobs.length*PER} rows\n`);

const rows = [];
const failures = {};
let done = 0;
const CONCURRENCY = 5;
const queue = [...jobs];

await Promise.all(Array.from({length:CONCURRENCY}, async () => {
  while (queue.length) {
    const job = queue.shift();
    try {
      const bodies = await generateWithRetry(job.gen, job.category, job.status, PER);
      for (const body of bodies)
        rows.push({ category: job.category, status: job.status, generator: job.gen.key,
                    family: job.gen.family, body });
    } catch (e) {
      failures[job.gen.key] = (failures[job.gen.key]??0)+1;
    }
    done++;
    if (done % 10 === 0 || done === jobs.length) process.stdout.write(`\r  ${done}/${jobs.length} jobs`);
  }
}));

// Drop near-duplicates: identical openings mean the model looped.
const seen = new Set();
const unique = rows.filter(r => {
  const k = r.body.replace(/\s+/g,' ').toLowerCase().slice(0,110);
  if (seen.has(k)) return false;
  seen.add(k); return true;
});
unique.forEach((r,i)=>{ r.id = `SY-${String(i+1).padStart(4,'0')}`; });

fs.writeFileSync('data/model/synthetic.json', JSON.stringify(unique,null,2));

console.log(`\n\ngenerated ${rows.length}, kept ${unique.length} after dedupe\n`);
console.log('per family:');
for (const g of GENERATORS) {
  const n = unique.filter(r=>r.generator===g.key).length;
  console.log(`  ${g.family.padEnd(10)} ${String(n).padStart(4)}   failed jobs: ${failures[g.key]??0}`);
}
console.log('\nper category:');
for (const c of CATEGORIES) console.log(`  ${c.padEnd(15)} ${unique.filter(r=>r.category===c).length}`);
console.log('\nwritten to data/model/synthetic.json');
