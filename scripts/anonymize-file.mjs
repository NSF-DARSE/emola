/*
 * Anonymise a file locally, before it goes anywhere.
 *
 *   node scripts/anonymize-file.mjs <input> [output]
 *
 * Works on any text format — JSON, CSV, plain text — because it only ever
 * substitutes exact patterns (IPs, host names, emails, phone numbers) and
 * leaves the surrounding structure untouched.
 *
 * Writes two files:
 *   <output>              the safe copy — this is the one you share
 *   <output>.mapping.json the token -> real value key — KEEP THIS LOCAL
 *
 * Nothing here touches the network.
 */
import fs from 'node:fs';
import path from 'node:path';

const DETECTORS = [
  { kind: 'EMAIL', noun: 'email address', pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  {
    kind: 'IP',
    noun: 'IP address',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
  },
  {
    kind: 'HOST',
    noun: 'host name',
    pattern: /\b[a-z]{2,6}-[a-z]{2,8}-(?:prd|prod|dev|tst|test|qa|stg)-\d{1,3}\b/gi,
  },
  { kind: 'PHONE', noun: 'phone number', pattern: /\b\d{3}-\d{3}-\d{4}\b/g },
];

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/anonymize-file.mjs <input> [output]');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`no such file: ${input}`);
  process.exit(1);
}

const ext = path.extname(input);
const output =
  process.argv[3] ?? path.join(path.dirname(input), `${path.basename(input, ext)}.anon${ext}`);

const raw = fs.readFileSync(input, 'utf8');

const values = {};
const seen = new Map();
const counters = {};
const tally = {};

let out = raw;
for (const d of DETECTORS) {
  out = out.replace(d.pattern, (match) => {
    const key = `${d.kind}:${match}`;
    const hit = seen.get(key);
    if (hit) {
      tally[d.kind] = (tally[d.kind] ?? 0) + 1;
      return hit;
    }
    counters[d.kind] = (counters[d.kind] ?? 0) + 1;
    const token = `[${d.kind}_${counters[d.kind]}]`;
    seen.set(key, token);
    values[token] = match;
    tally[d.kind] = (tally[d.kind] ?? 0) + 1;
    return token;
  });
}

// Seatbelt: re-scan the result. If anything still matches, do not write a file
// that is claimed to be safe.
for (const d of DETECTORS) {
  d.pattern.lastIndex = 0;
  const leak = d.pattern.exec(out);
  if (leak) {
    console.error(`ABORTED — a ${d.noun} survived ("${leak[0]}"). Nothing was written.`);
    process.exit(2);
  }
}

fs.writeFileSync(output, out, 'utf8');
fs.writeFileSync(`${output}.mapping.json`, JSON.stringify(values, null, 2), 'utf8');

console.log(`read    ${input}  (${raw.length.toLocaleString()} chars)`);
console.log('replaced:');
for (const d of DETECTORS) {
  const n = tally[d.kind] ?? 0;
  const unique = counters[d.kind] ?? 0;
  console.log(`  ${d.noun.padEnd(14)} ${String(n).padStart(4)} mentions  (${unique} distinct)`);
}
console.log(`\nSAFE TO SHARE   ${output}`);
console.log(`KEEP LOCAL      ${output}.mapping.json`);
console.log('\nOpen the safe copy and read it before sending it anywhere.');
