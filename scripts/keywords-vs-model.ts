/**
 * Answers a fair question: if a regex is good enough to spot abnormal events,
 * why not use regexes for the eight categories too?
 *
 * Runs the keyword classifier over the same 226 real notices the trained model
 * was evaluated on, and scores them the same way.
 *
 *   npx tsx scripts/keywords-vs-model.ts
 */
import fs from 'node:fs';
import { classify } from '../src/lib/classifier';

interface Row {
  id: string;
  body: string;
  category: string;
  acceptableCategories?: string[];
}

const rows: Row[] = JSON.parse(fs.readFileSync('data/model/test.json', 'utf8'));
const model = JSON.parse(fs.readFileSync('data/model/predictions.json', 'utf8')) as {
  id: string; truth: string; predicted: string;
}[];
const modelById = new Map(model.map((m) => [m.id, m]));

let kwStrict = 0, kwLenient = 0, mStrict = 0, mLenient = 0;
const kwConfusion = new Map<string, number>();

for (const r of rows) {
  const ok = new Set(r.acceptableCategories?.length ? r.acceptableCategories : [r.category]);
  const kw = classify(r.body).primary;
  if (kw === r.category) kwStrict += 1;
  if (ok.has(kw)) kwLenient += 1;
  if (kw !== r.category) {
    const key = `${r.category} called ${kw}`;
    kwConfusion.set(key, (kwConfusion.get(key) ?? 0) + 1);
  }
  const m = modelById.get(r.id);
  if (m) {
    if (m.predicted === r.category) mStrict += 1;
    if (ok.has(m.predicted)) mLenient += 1;
  }
}

const n = rows.length;
const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;

console.log(`${n} real notices\n`);
console.log('                        exact    any defensible label');
console.log(`  always "Maintenance"  ${pct(rows.filter((r) => r.category === 'Maintenance').length)}`);
console.log(`  keyword rules         ${pct(kwStrict)}    ${pct(kwLenient)}`);
console.log(`  trained model         ${pct(mStrict)}    ${pct(mLenient)}`);

console.log('\nwhere the keywords go wrong');
for (const [k, v] of [...kwConfusion].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}

// Outage is the category that matters: missing one is the expensive error.
const outages = rows.filter((r) => r.category === 'Outage');
const kwFound = outages.filter((r) => classify(r.body).primary === 'Outage').length;
const mFound = outages.filter((r) => modelById.get(r.id)?.predicted === 'Outage').length;
console.log(`\noutages found (${outages.length} in the corpus)`);
console.log(`  keyword rules   ${kwFound}`);
console.log(`  trained model   ${mFound}`);
