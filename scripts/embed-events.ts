/**
 * Embeds the demo corpus once, so the app can classify with the trained model
 * without a network call during seeding — better-sqlite3 transactions are
 * synchronous and cannot await.
 *
 * Text is anonymised inside embed(); raw bodies never leave the machine.
 *
 *   npx tsx scripts/embed-events.ts
 */
import fs from 'node:fs';
import { loadEnv } from './load-env';

loadEnv();

import { embed, isEmbeddingConfigured } from '../src/lib/model/embed';

const CONCURRENCY = 4;

async function main(): Promise<void> {
  if (!isEmbeddingConfigured()) {
    console.error('No AWS_BEARER_TOKEN_BEDROCK found. Nothing written.');
    process.exit(1);
  }

  const events: { id: string; body: string }[] = JSON.parse(
    fs.readFileSync('data/events.json', 'utf8'),
  );
  const out: Record<string, number[]> = {};
  const queue = [...events];
  let done = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const e = queue.shift();
        if (!e) return;
        out[e.id] = await embed(e.body);
        done += 1;
        process.stdout.write(`\r  ${done}/${events.length}`);
      }
    }),
  );

  fs.writeFileSync('data/events.vectors.json', JSON.stringify(out));
  console.log(`\nwrote ${Object.keys(out).length} vectors to data/events.vectors.json`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
