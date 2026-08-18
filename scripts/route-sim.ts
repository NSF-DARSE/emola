/**
 * What the whole routing rule does to the 226 real notices, using the trained
 * model rather than the keyword stub.
 *
 * Confidence is only one of several hold reasons, so the confidence threshold
 * alone does not decide the auto-send rate. This measures the actual rate, and
 * how it moves as the threshold moves.
 *
 *   npx tsx scripts/route-sim.ts
 */
import fs from 'node:fs';
import { classifyFromVector, extract } from '../src/lib/classifier';
import { scanForSensitiveContent } from '../src/lib/redaction';
import { routeNotification } from '../src/lib/routing';

interface Row { id: string; body: string; received_at: string; category: string; acceptableCategories?: string[] }

const rows: Row[] = JSON.parse(fs.readFileSync('data/model/test.json', 'utf8'));
const vectors: Record<string, number[]> = JSON.parse(
  fs.readFileSync('data/model/test.vectors.json', 'utf8'),
);
const usable = rows.filter((r) => vectors[r.id]);

const assessed = usable.map((r) => ({
  row: r,
  model: classifyFromVector(r.body, vectors[r.id]),
  extracted: extract(r.body, r.received_at),
  safety: scanForSensitiveContent(r.body),
}));

console.log(`${assessed.length} real notices, trained model\n`);

for (const threshold of [0.55, 0.6, 0.65, 0.7, 0.8]) {
  let auto = 0, held = 0, badAuto = 0, outageAuto = 0;
  const reasonCount = new Map<string, number>();

  for (const a of assessed) {
    const model = { ...a.model };
    const routing = routeNotification(model, a.extracted, a.safety);

    // An auto_send result still carries one reason - the explanation of why it
    // qualified - so emptiness of `reasons` is NOT the test. Take the genuine
    // hold reasons only, then drop the confidence one so a different threshold
    // can be simulated without mutating the shared module constant.
    const holds = routing.route === 'auto_send'
      ? []
      : routing.reasons.filter((x) => !x.startsWith('Unsure of the category'));
    const wouldHold = model.confidence < threshold ? [...holds, 'Unsure of the category'] : holds;

    if (wouldHold.length === 0) {
      auto += 1;
      const ok = new Set(a.row.acceptableCategories?.length ? a.row.acceptableCategories : [a.row.category]);
      if (!ok.has(model.primary)) badAuto += 1;
      if (a.row.category === 'Outage') outageAuto += 1;
    } else {
      held += 1;
      for (const r of wouldHold) reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
    }
  }

  const pct = (n: number) => `${((n / assessed.length) * 100).toFixed(0)}%`;
  console.log(
    `threshold ${threshold.toFixed(2)}  auto-send ${String(auto).padStart(3)} (${pct(auto).padStart(3)})  ` +
    `held ${String(held).padStart(3)}  misclassified auto-sent ${badAuto}  outages auto-sent ${outageAuto}`,
  );
  if (threshold === 0.7) {
    console.log('\n  why notices are held at 0.70:');
    for (const [r, n] of [...reasonCount].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(3)}  ${r}`);
    }
    console.log();
  }
}
