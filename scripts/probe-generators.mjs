// Can this account reach a NON-Anthropic text model? That decides whether the
// multi-model synthetic-generation design is possible here at all.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = env.AWS_BEARER_TOKEN_BEDROCK;
const REGION = env.AWS_REGION || 'us-west-2';
const auth = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const list = await (
  await fetch(`https://bedrock.${REGION}.amazonaws.com/foundation-models`, {
    headers: { Authorization: `Bearer ${KEY}` },
  })
).json();

// Text-out models from providers other than Anthropic.
const candidates = (list.modelSummaries ?? [])
  .filter(
    (m) =>
      (m.outputModalities ?? []).includes('TEXT') &&
      m.providerName !== 'Anthropic' &&
      !/embed|image|video|speech|rerank/i.test(m.modelId),
  )
  .map((m) => ({ id: m.modelId, provider: m.providerName }));

console.log(`testing ${candidates.length} non-Anthropic text models\n`);

// Bedrock's Converse API gives one request shape for every provider.
const works = [];
for (const { id, provider } of candidates) {
  for (const mid of [id, `us.${id}`]) {
    try {
      const r = await fetch(
        `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(mid)}/converse`,
        {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({
            messages: [{ role: 'user', content: [{ text: 'Reply with exactly: OK' }] }],
            inferenceConfig: { maxTokens: 12 },
          }),
        },
      );
      if (r.ok) {
        const b = await r.json();
        const text = (b.output?.message?.content ?? []).map((c) => c.text).join('').trim();
        console.log(`WORKS  ${provider.padEnd(12)} ${mid}   "${text}"`);
        works.push({ provider, id: mid });
        break;
      }
      if (mid.startsWith('us.')) {
        const t = await r.text();
        const why = /not authorized/.test(t)
          ? 'IAM blocked'
          : /not available|access/.test(t)
            ? 'no access'
            : /invalid/i.test(t)
              ? 'bad id'
              : t.replace(/\s+/g, ' ').slice(0, 60);
        console.log(`  --   ${provider.padEnd(12)} ${id}   ${why}`);
      }
    } catch (e) {
      console.log(`  --   ${provider.padEnd(12)} ${mid}   ${e.message}`);
    }
  }
}

console.log(`\n${works.length} non-Anthropic generator(s) available:`);
for (const w of works) console.log(`  ${w.provider}  ${w.id}`);
