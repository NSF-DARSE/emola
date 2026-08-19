/**
 * Generates the poster artwork, ONCE.
 *
 * Produced offline, eyeballed, and committed — never generated per notice. An
 * image model asked for a fresh picture on every send would put unreviewed
 * artwork out under the State's name, and nobody would see it before the
 * recipients did. A fixed set gets looked at once and trusted after that.
 *
 * Two things learned the hard way and encoded here:
 *
 *   One subject per prompt. "A server rack with a wrench beside it" returned a
 *   mechanic's socket organiser — the second noun captured the whole image.
 *
 *   Ask for what the model actually produces. Every prompt saying "flat vector"
 *   came back as a lit 3D render anyway, so the style names that instead.
 *   Fighting the default gives an incoherent set; naming it gives a coherent one.
 *
 * Text is forbidden in the prompt AND the negative prompt, because models in
 * this family garble lettering and invented words beside real outage times is
 * the exact failure the render-don't-generate approach exists to prevent.
 *
 *   node scripts/generate-art.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const KEY = env.AWS_BEARER_TOKEN_BEDROCK;
const REGION = env.AWS_REGION || 'us-west-2';
const MODEL = 'stability.stable-image-core-v1:1';

const STYLE =
  '3D isometric icon, single centred object, deep navy blue and brushed silver, ' +
  'soft studio lighting, subtle drop shadow, seamless very light grey background, ' +
  'clean corporate style, no text, no words, no letters, no numbers, no logos';

/** Large art, one per poster template. */
const HEROES = [
  { key: 'maintenance', prompt: `A single gear wheel, ${STYLE}` },
  { key: 'timeline', prompt: `A tall data centre server cabinet with small glowing status lights, ${STYLE}` },
  { key: 'outage', prompt: `A single rounded warning triangle with an exclamation mark, ${STYLE}` },
  { key: 'security', prompt: `A shield with a keyhole, ${STYLE}` },
  { key: 'resolved', prompt: `A single large check mark, ${STYLE}` },
];

/** Small art, matched to whatever systems a notice happens to name. */
const ICONS = [
  { key: 'server', prompt: `A small server tower, ${STYLE}` },
  { key: 'network', prompt: `A network hub with three connected nodes, ${STYLE}` },
  { key: 'cloud', prompt: `A simple cloud shape, ${STYLE}` },
  { key: 'database', prompt: `A stack of three database discs, ${STYLE}` },
  { key: 'file', prompt: `A folder with a document, ${STYLE}` },
  { key: 'map', prompt: `A folded paper map with a location pin, ${STYLE}` },
  { key: 'mail', prompt: `A sealed envelope, ${STYLE}` },
  { key: 'lock', prompt: `A closed padlock, ${STYLE}` },
  { key: 'vpn', prompt: `A padlock in front of a globe, ${STYLE}` },
  { key: 'calendar', prompt: `A desk calendar, ${STYLE}` },
  { key: 'clock', prompt: `A round wall clock, ${STYLE}` },
  { key: 'desktop', prompt: `A desktop computer monitor, ${STYLE}` },
  { key: 'printer', prompt: `An office printer, ${STYLE}` },
  { key: 'wifi', prompt: `A wireless signal symbol, ${STYLE}` },
  { key: 'chart', prompt: `A bar chart with three rising bars, ${STYLE}` },
  { key: 'gear', prompt: `Two interlocking gear wheels, ${STYLE}` },
  { key: 'phone', prompt: `A desk telephone handset, ${STYLE}` },
  { key: 'office', prompt: `A desk with a computer monitor and a small plant, ${STYLE}` },
];

async function generate(item, dir, size) {
  const out = path.join('public', 'art', dir);
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${item.key}.png`);

  const res = await fetch(
    `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(MODEL)}/invoke`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: item.prompt,
        negative_prompt:
          'text, words, letters, numbers, labels, watermark, signature, ui, buttons, people, faces',
        mode: 'text-to-image',
        aspect_ratio: '1:1',
        output_format: 'png',
      }),
    },
  );

  if (!res.ok) {
    console.error(`  ${item.key.padEnd(12)} FAILED ${res.status} ${(await res.text()).slice(0, 80)}`);
    return;
  }

  const raw = Buffer.from((await res.json()).images[0], 'base64');
  // Downscaled hard: these get base64'd into every render, and a megabyte of
  // decoration would cost more than the whole rest of the poster.
  await sharp(raw).resize(size, size, { fit: 'cover' }).png({ quality: 82, compressionLevel: 9 }).toFile(file);
  const kb = fs.statSync(file).size / 1024;
  console.log(`  ${item.key.padEnd(12)} ${(raw.length / 1024).toFixed(0)} KB -> ${kb.toFixed(0)} KB`);
}

console.log('heroes (512px)');
for (const h of HEROES) await generate(h, 'hero', 512);

console.log('\nicons (192px)');
for (const i of ICONS) await generate(i, 'icon', 192);

console.log('\nLook at every one of these before shipping them.');
