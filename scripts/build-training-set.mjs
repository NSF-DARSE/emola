/*
 * Assemble the final train/test datasets.
 *
 * The label used for TRAINING is the three-model panel consensus, NOT the
 * category the generator was asked for. This matters: the goldset was labelled
 * by the same panel, so using the panel for both means train and test share one
 * labelling function. Training on "what we asked for" while testing on "what
 * the panel says" would measure the gap between two different definitions of
 * truth rather than the classifier's ability.
 *
 * Rows where all three models disagreed have no majority and are held out.
 */
import fs from 'node:fs';

const synth = JSON.parse(fs.readFileSync('data/model/synthetic.labelled.json', 'utf8'));
const gold  = JSON.parse(fs.readFileSync('data/model/labels.json', 'utf8'));

const complete = (r) => r.labels?.claude?.primary && r.labels?.llama?.primary && r.labels?.nova?.primary;

const train = synth
  .filter(complete)
  .filter((r) => r.consensus.agreement !== 'split')
  .map((r) => ({
    id: r.id,
    body: r.body,
    category: r.consensus.primary,
    status: r.consensus.status,
    // Unanimous rows are cleaner signal; a trainer can weight on this.
    agreement: r.consensus.agreement,
    votes: r.consensus.primaryVotes,
    // Kept for auditing: which family wrote it, and what we had asked for.
    generator: r.generator,
    family: r.family,
    requested: r.intended,
    onTarget: r.consensus.primary === r.intended,
  }));

const test = gold
  .filter(complete)
  .map((r) => ({
    id: r.id,
    body: r.body,
    received_at: r.received_at,
    category: r.consensus.primary,
    status: r.consensus.status,
    agreement: r.consensus.categoryAgreement ?? r.consensus.agreement,
    // Both labels are defensible on genuinely dual-natured notices, so scoring
    // should accept either rather than marking a reasonable answer wrong.
    acceptableCategories: r.consensus.acceptableCategories ?? [r.consensus.primary],
    humanLabel: null,   // filled in after the human pass
  }));

fs.writeFileSync('data/model/train.json', JSON.stringify(train, null, 2));
fs.writeFileSync('data/model/test.json', JSON.stringify(test, null, 2));

const dist = (rows, k) => {
  const d = {};
  for (const r of rows) d[r[k]] = (d[r[k]] ?? 0) + 1;
  return Object.entries(d).sort((a, b) => b[1] - a[1]);
};

console.log(`TRAIN  ${train.length} synthetic rows   (dropped ${synth.length - train.length})`);
for (const [k, v] of dist(train, 'category')) console.log(`  ${String(k).padEnd(15)} ${v}`);
console.log(`  unanimous: ${train.filter(r => r.agreement === 'unanimous').length}`);

console.log(`\nTEST   ${test.length} real rows`);
for (const [k, v] of dist(test, 'category')) console.log(`  ${String(k).padEnd(15)} ${v}`);

const major = dist(test, 'category')[0];
console.log(`\nBASELINE to beat: always guessing "${major[0]}" scores ${((major[1] / test.length) * 100).toFixed(1)}%`);
console.log('Report PER-CATEGORY precision/recall - overall accuracy is meaningless at this imbalance.');
