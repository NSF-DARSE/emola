/**
 * Full-page poster artwork.
 *
 * The image model designs the whole visual — colour, texture, depth, the lot.
 * It does NOT write the words: generating the complete poster was tried and
 * every label came back as gibberish ("Maiteennce misintencros 4 systems"),
 * with invented timeline numbers and a QR code leading nowhere. Convincing at
 * a glance and unsendable.
 *
 * So the model owns the picture and the renderer owns the text. Prompts ban
 * lettering in both directions, and the composition leaves the upper band and
 * a clear centre column empty so real text has somewhere to sit.
 *
 *   node scripts/generate-backdrops.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const MODEL = 'stability.stable-image-ultra-v1:1';
const REGION = env.AWS_REGION || 'us-west-2';

/**
 * Composition, in spatial language.
 *
 * "top third a solid colour band" produced a vertical stripe down the middle —
 * the model does not reliably map fractions to regions. Naming the geometry
 * explicitly ("across the very top edge, spanning the full width, like a
 * letterhead banner") works, and that is the difference between these prompts
 * and the pair that failed before them.
 *
 * The middle is demanded empty on purpose: that is where real text goes.
 */
const BASE =
  'A tall white poster. Across the very top edge, a wide horizontal {COLOUR} rectangle ' +
  'spanning the full width, occupying the upper 30 percent, like a letterhead banner. ' +
  'Below it, plain white paper. The middle of the page is completely empty white space. ' +
  'No text, no letters, no numbers, no words.';

const BACKDROPS = [
  { key: 'maintenance', colour: 'dark navy blue', edge: 'a few small faint blue isometric server icons scattered along the bottom edge only' },
  { key: 'timeline', colour: 'dark navy blue', edge: 'a few small faint blue isometric data centre racks along the bottom edge only' },
  { key: 'outage', colour: 'dark crimson red', edge: 'a few small faint red warning chevrons along the bottom edge only' },
  { key: 'security', colour: 'dark amber bronze', edge: 'a few small faint bronze padlock shapes along the bottom edge only' },
  { key: 'resolved', colour: 'deep emerald green', edge: 'a few small faint green check marks along the bottom edge only' },
].map((b) => ({ key: b.key, prompt: `${BASE.replace('{COLOUR}', b.colour)} ${b.edge}` }));

const OUT = path.join('public', 'art', 'backdrop');
fs.mkdirSync(OUT, { recursive: true });

for (const b of BACKDROPS) {
  const res = await fetch(
    `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL)}/invoke`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: b.prompt,
        negative_prompt:
          'text, letters, numbers, words, typography, captions, labels, logos, watermark, ' +
          'qr code, barcode, charts, graphs, people, faces, hands, clutter, ' +
          // The failure mode this set exists to avoid.
          'vertical stripe, vertical column, centre column, busy centre',
        mode: 'text-to-image',
        aspect_ratio: '2:3',
        output_format: 'png',
      }),
    },
  );
  if (!res.ok) { console.error(`${b.key}: ${res.status} ${(await res.text()).slice(0, 90)}`); continue; }

  const raw = Buffer.from((await res.json()).images[0], 'base64');
  const file = path.join(OUT, `${b.key}.png`);
  await sharp(raw).resize(1000, 1500, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(file);
  console.log(`  ${b.key.padEnd(12)} ${(raw.length / 1024).toFixed(0)} KB -> ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
