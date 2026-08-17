// Live end-to-end check: anonymise -> Bedrock -> rehydrate.
// Run: npx tsx scripts/try-exec-summary.mts [EVENT_ID]
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const { classify, extract } = await import('../src/lib/classifier.js');
const { scanForSensitiveContent } = await import('../src/lib/redaction.js');
const { routeNotification } = await import('../src/lib/routing.js');
const { generateExecSummary, outboundPreview } = await import('../src/lib/llm/exec-summary-llm.js');

const id = process.argv[2] ?? 'SYN-001';
const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8'));
const e = events.find((x: { id: string }) => x.id === id);
if (!e) throw new Error(`no such event ${id}`);

const model = classify(e.body);
const extracted = extract(e.body, e.received_at);
const safety = scanForSensitiveContent(e.body);
const routing = routeNotification(model, extracted, safety);

const n = {
  id: e.id,
  receivedAt: e.received_at,
  body: e.body,
  synthetic: !!e.synthetic,
  syntheticReason: e.synthetic_reason ?? null,
  goldPrimary: null,
  goldSecondary: [],
  goldStatus: null,
  holdout: false,
  model,
  extracted,
  safety,
  route: routing.route,
  routeReasons: routing.reasons,
  reviewState: 'pending' as const,
  threadParentId: null,
};

console.log('=============== WHAT ACTUALLY LEAVES THE MACHINE ===============');
console.log(outboundPreview(n));
console.log('===============================================================\n');

console.time('bedrock');
const payload = await generateExecSummary(n);
console.timeEnd('bedrock');

console.log('\n=================== REHYDRATED SUMMARY ===================');
console.log(`HEADLINE   ${payload.headline}`);
console.log(`RISK       ${payload.riskLevel}`);
console.log(`WINDOW     ${payload.window}`);
console.log(`\nIMPACT     ${payload.businessImpact}`);
console.log(`\nRISK       ${payload.operationalRisk}`);
console.log(`\nSERVICES   ${payload.affectedServices.join(', ')}`);
console.log('\nDECISIONS');
for (const d of payload.decisions) console.log(`  - ${d}`);
