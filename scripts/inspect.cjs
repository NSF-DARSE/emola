// Dev helper: inspect the seeded pipeline state without going through the UI.
const D = require('better-sqlite3');
const d = new D('data/pipeline.db');

const rows = d.prepare('SELECT * FROM notifications ORDER BY id').all();

console.log('--- threading ---');
const t = rows.filter((r) => r.thread_parent_id);
for (const r of t) console.log('  ', r.id, '(' + r.model_status + ') -> parent', r.thread_parent_id);
if (t.length === 0) console.log('   (none)');

console.log('\n--- auto-send (original email forwarded, nothing generated) ---');
for (const r of rows.filter((r) => r.route === 'auto_send'))
  console.log('  ', r.id, '|', r.model_primary, '/', r.model_status, '| conf', r.model_confidence);

console.log('\n--- holdout agreement (labelled real notices only) ---');
const holdout = rows.filter((r) => r.holdout && !r.synthetic && r.gold_primary);
let cat = 0;
let st = 0;
for (const r of holdout) {
  const c = r.gold_primary === r.model_primary;
  const s = r.gold_status === r.model_status;
  if (c) cat++;
  if (s) st++;
  if (!c || !s)
    console.log(
      '   MISS', r.id, '| labelled', r.gold_primary + '/' + r.gold_status,
      '| engine', r.model_primary + '/' + r.model_status, '| conf', r.model_confidence,
    );
}
console.log(`   category ${cat}/${holdout.length}  status ${st}/${holdout.length}`);

console.log('\n--- full-set misses (all labelled real notices) ---');
const all = rows.filter((r) => !r.synthetic && r.gold_primary);
let miss = 0;
for (const r of all) {
  if (r.gold_primary !== r.model_primary || r.gold_status !== r.model_status) {
    miss++;
    console.log(
      '   ', r.id, '| labelled', r.gold_primary + '/' + r.gold_status,
      '| engine', r.model_primary + '/' + r.model_status,
    );
  }
}
console.log(`   ${all.length - miss}/${all.length} exact on both axes`);

console.log('\n--- precedents ---');
const p = d.prepare('SELECT COUNT(*) n, SUM(seeded) s FROM precedents').get();
console.log('   total', p.n, '| seeded', p.s, '| from live decisions', p.n - p.s);
console.log('   columns:', d.prepare('PRAGMA table_info(precedents)').all().map((c) => c.name).join(', '));
