/**
 * The generated poster: Gemini Nano Banana Pro draws the whole thing.
 *
 * This is the alternative to the rendered template, not a replacement for it.
 * The two fail in opposite directions and that is the point of offering both:
 *
 *   rendered   text is guaranteed correct, layout is fixed by us
 *   generated  layout is inventive, text is usually right but never guaranteed
 *
 * Nano Banana Pro genuinely spells — a test reproduced every time from a real
 * notice exactly, where two diffusion models produced "Maiteennce misintencros
 * 4 systems". But "usually correct" is not the same as "correct", so anything
 * from this path is marked unverified and a person has to read every word
 * before it goes anywhere.
 *
 * Results are cached on disk: generation costs money and takes seconds, so it
 * runs once per notice and template rather than once per page view.
 */

import fs from 'node:fs';
import path from 'node:path';

import { anonymize, assertNoSensitiveData } from './anonymize';
import type { InfographicPayload } from './artifacts';
import { assertPosterIsSafe, TEMPLATE_EYEBROW, type PosterTemplate } from './poster';

export const NANO_MODEL = 'nano-banana-pro-preview';

// Read-only deployment roots on serverless hosts; /tmp is the only writable
// place, and it is per-instance. A cache miss there costs a generation, so on
// those platforms this is a best-effort cache rather than a guarantee.
const CACHE_DIR = path.join(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp' : process.cwd(),
  'data',
  'generated',
);

export class NanoError extends Error {}

/**
 * Sniffs the real format from the magic bytes.
 *
 * The model returns JPEG despite the request, and serving it as image/png is
 * a small lie that some clients do care about. Read the bytes rather than
 * trusting the extension.
 */
export function imageMimeType(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length > 12 && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}

export function isNanoConfigured(): boolean {
  return Boolean(process.env.GEMINI_KEY || process.env.GEMINI_API_KEY);
}

/**
 * Describes each field's ROLE rather than naming it.
 *
 * The first attempt wrote "Headline:" and "When:" into the content block and
 * the model dutifully printed those words onto the poster. Saying what a line
 * is for, rather than labelling it, keeps the label out of the image.
 *
 * Pure, so the anonymisation can be asserted without spending anything.
 */
export function buildNanoPrompt(
  payload: InfographicPayload,
  template: PosterTemplate,
): string {
  // Refuse before anonymising if the notice itself is unsafe: that is a
  // problem with the notice, and hiding it would be the wrong fix.
  assertPosterIsSafe(payload);

  const lines: string[] = [
    `Title, large, in the header band: ${payload.headline}`,
    `Subtitle under the title: ${TEMPLATE_EYEBROW[template]}, Delaware Department of Finance`,
  ];

  if (payload.when) {
    lines.push(
      `Date and time, prominent: ${payload.when.start} until ${payload.when.end}. ` +
        `${payload.when.duration}${payload.when.crossesMidnight ? ', runs past midnight' : ''}.`,
    );
  }

  if (payload.timeline.length > 0) {
    lines.push('Timeline rows, each with a small icon and a coloured bar:');
    for (const t of payload.timeline.slice(0, 5)) {
      lines.push(`   ${t.label}, ${t.start} to ${t.end}`);
    }
  }

  if (payload.systems.length > 0) {
    lines.push(
      `A section headed AFFECTED SYSTEMS listing: ${payload.systems.slice(0, 6).join(', ')}`,
    );
  }

  lines.push(`A closing line: ${payload.impact}`);
  if (payload.actions[0]) lines.push(`A highlighted box containing: ${payload.actions[0]}`);
  lines.push('A small footer line: Draft, not approved for distribution.');

  const { text: content } = anonymize(lines.join('\n'));
  assertNoSensitiveData(content);

  return (
    'Create a professional infographic poster for a United States state government ' +
    'IT department. Portrait orientation, A4 proportions. A deep navy blue header ' +
    'band across the top with the title in white. Clean white body below with ' +
    'generous white space. Use flat 3D isometric icons for servers and network ' +
    'equipment. Restrained corporate palette: navy, steel blue, one accent colour.\n\n' +
    'Lay the poster out using exactly the content below. Reproduce every word and ' +
    'every time EXACTLY as written and spelled correctly. Do NOT print the role ' +
    'descriptions themselves, only the content after each colon. Invent no words, ' +
    'no extra numbers, no placeholder text.\n\n' +
    content +
    '\n\nDo not add a QR code. Do not add a logo. Do not invent an organisation ' +
    'name or any text that is not listed above.'
  );
}

function cachePath(notificationId: string, template: PosterTemplate): string {
  return path.join(CACHE_DIR, `${notificationId}-${template}.png`);
}

export function cachedPoster(notificationId: string, template: PosterTemplate): Buffer | null {
  const file = cachePath(notificationId, template);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/**
 * Generates and caches. Callers should check cachedPoster() first — this
 * always spends, so it should never run on a page view that could have been
 * served from disk.
 */
export async function generatePoster(
  notificationId: string,
  payload: InfographicPayload,
  template: PosterTemplate,
): Promise<Buffer> {
  const key = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new NanoError('No Gemini key configured, so nothing can be generated.');

  const prompt = buildNanoPrompt(payload, template);

  // Imported lazily so the SDK is only loaded when someone actually opts in.
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: key });

  const res = await client.models.generateContent({
    model: NANO_MODEL,
    contents: prompt,
  });

  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (data) {
      const buf = Buffer.from(data, 'base64');
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath(notificationId, template), buf);
      return buf;
    }
  }

  throw new NanoError('The model returned no image.');
}


/**
 * Notice ids that already have a generated poster on disk.
 *
 * Used to mark them in the list. Generating one takes about ten seconds, so in
 * a demo you want to know which notices are warm before you click rather than
 * after — and reading the directory is cheaper than remembering.
 */
export function notesWithGeneratedPoster(): Set<string> {
  try {
    if (!fs.existsSync(CACHE_DIR)) return new Set();
    return new Set(
      fs
        .readdirSync(CACHE_DIR)
        .filter((f) => f.endsWith('.png'))
        // "EVT-004-timeline.png" -> "EVT-004". The template suffix is dropped
        // because the marker answers "is anything ready here", not which style.
        .map((f) => f.replace(/\.png$/, '').replace(/-[a-z]+$/, '')),
    );
  } catch {
    return new Set();
  }
}
