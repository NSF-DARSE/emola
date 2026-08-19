import { createHash } from 'node:crypto';

import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';

import { buildInfographic, compactRange, type InfographicPayload } from '@/lib/artifacts';
import {
  cachedPoster,
  generatePoster,
  imageMimeType,
  isNanoConfigured,
  NanoError,
} from '@/lib/poster-nano';
import { getArtifact, getNotification } from '@/lib/db';
import { Mark } from '@/components/Mark';
import {
  assertPosterIsSafe,
  backdropArt,
  buildTrackBars,
  heroArt,
  systemIcon,
  PosterLeak,
  pickTemplate,
  POSTER,
  TEMPLATE_ACCENT,
  TEMPLATE_EYEBROW,
  TRACK_COLORS,
  type PosterTemplate,
  type TrackBar,
} from '@/lib/poster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rendered posters are cached in memory.
 *
 * Rasterising a 1000x1700 image takes about two seconds, and the result is a
 * pure function of the payload and the template — the same inputs always give
 * the same pixels. Re-doing that on every view made switching styles feel
 * broken.
 *
 * Keyed on a hash of the payload, not just the notice id, so an edited
 * artifact renders fresh rather than serving a stale picture. Bounded, because
 * an unbounded cache in a long-running server is a leak with a nice name.
 */
/*
 * Held on globalThis rather than as a module constant: the dev server
 * re-evaluates modules between requests, so a module-level Map is empty every
 * time and the cache silently never hits. Production keeps one module
 * instance, but the same code has to work in both or the thing you test is
 * not the thing that ships.
 */
const RENDER_CACHE: Map<string, Buffer> =
  ((globalThis as { __posterCache?: Map<string, Buffer> }).__posterCache ??= new Map());
const RENDER_CACHE_MAX = 40;

function cacheKey(
  id: string,
  template: string,
  payload: InfographicPayload,
  approved: boolean,
): string {
  // Approval is in the key because the footer changes with it — without this,
  // approving a poster would keep serving the one stamped "DRAFT".
  //
  // generatedAt is stripped first: buildInfographic stamps it with the current
  // time, so leaving it in made every payload unique and the cache never once
  // hit. It is also not drawn on the poster, so it cannot affect the pixels.
  const { generatedAt: _ignored, ...stable } = payload as { generatedAt?: string };
  const hash = createHash('sha1').update(JSON.stringify(stable)).digest('hex');
  return `${id}:${template}:${approved ? 'ok' : 'draft'}:${hash}`;
}

function remember(key: string, buf: Buffer): void {
  // Oldest out first. Map preserves insertion order, so the first key is it.
  if (RENDER_CACHE.size >= RENDER_CACHE_MAX) {
    const oldest = RENDER_CACHE.keys().next().value;
    if (oldest) RENDER_CACHE.delete(oldest);
  }
  RENDER_CACHE.set(key, buf);
}

const W = 1000;

/** Trims to the first sentence, so a paragraph becomes a line. */
function firstSentence(text: string, limit: number): string {
  const first = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? text.trim();
  if (first.length <= limit) return first;
  const cut = first.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 30 ? space : limit)}…`;
}

/**
 * A darker partner for an accent, returned as hex so an alpha pair can be
 * appended. Returning rgb() here produced `rgb(11,34,101)f2`, which is not a
 * colour, and satori refused the whole render.
 */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const dim = (v: number) => Math.max(0, Math.round(v * 0.62));
  const to2 = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to2(dim((n >> 16) & 255))}${to2(dim((n >> 8) & 255))}${to2(dim(n & 255))}`;
}

/**
 * The canvas is sized to the content.
 *
 * A fixed height left a notice with no timeline showing several hundred pixels
 * of blank paper above the footer, which reads as a broken export rather than
 * a short notice. These are deliberate over-estimates per section — running a
 * little long is invisible, running short clips the text.
 */
function posterHeight(p: InfographicPayload): number {
  // The headline shares its row with a 200px hero, so the header is as tall as
  // whichever is bigger. Estimating from the text alone clipped the footer.
  const headlineLines = Math.max(1, Math.ceil(p.headline.length / 22));

  let h = 150 + Math.max(headlineLines * 62, 210);
  if (p.when) h += 190;
  if (p.timeline.length) {
    const rows = Math.min(p.timeline.length, 5);
    h += 66 + rows * 92 + 56 + rows * 30;
  }
  if (p.systems.length) h += 200; // the icon row
  h += 150; // the one-line "what it means"
  if (p.actions.length) h += 120; // the callout
  h += 170; // footer
  return Math.max(900, Math.min(2400, Math.round(h * 1.02)));
}

/**
 * Renders a notice to a PNG.
 *
 * No image model: the layout is drawn from the JSON, so the pixels say exactly
 * what the notice says. A generative model would invent the times, and a
 * maintenance window that reads 1630 in the source coming out 1530 in the
 * picture is the kind of error nobody catches until someone misses an outage.
 *
 *   /api/infographic/EVT-001                 the notice's own template
 *   /api/infographic/EVT-001?template=outage force one, for previewing
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const n = getNotification(params.id);
  if (!n) return NextResponse.json({ error: 'No such notice.' }, { status: 404 });

  // An edited artifact wins over a freshly derived one, so corrections a
  // person made are what gets drawn.
  const stored = getArtifact(params.id, 'infographic');
  const payload: InfographicPayload = stored
    ? (JSON.parse(stored.payload) as InfographicPayload)
    : buildInfographic(n);

  try {
    assertPosterIsSafe(payload);
  } catch (err) {
    if (err instanceof PosterLeak) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const url = new URL(request.url);
  const forced = url.searchParams.get('template') as PosterTemplate | null;
  const template: PosterTemplate = forced ?? pickTemplate(payload);

  /*
   * Two engines, opposite failure modes:
   *
   *   rendered   text guaranteed correct, layout fixed by us    (default)
   *   generated  layout inventive, text usually right, never guaranteed
   *
   * Rendered is the default deliberately. The generated path costs money and
   * produces something nobody has proofread, so it has to be asked for.
   */
  if (url.searchParams.get('engine') === 'generated') {
    const cached = cachedPoster(params.id, template);
    if (cached) {
      return new Response(new Uint8Array(cached), {
        headers: {
          'Content-Type': imageMimeType(cached),
          'X-Poster-Engine': 'generated-cached',
        },
      });
    }

    if (!isNanoConfigured()) {
      return NextResponse.json(
        { error: 'No Gemini key is configured, so nothing can be generated. Use the rendered poster.' },
        { status: 503 },
      );
    }

    try {
      const buf = await generatePoster(params.id, payload, template);
      return new Response(new Uint8Array(buf), {
        headers: { 'Content-Type': imageMimeType(buf), 'X-Poster-Engine': 'generated' },
      });
    } catch (err) {
      const message =
        err instanceof NanoError || err instanceof PosterLeak
          ? err.message
          : 'The image model could not be reached.';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  const accent = TEMPLATE_ACCENT[template];
  const approved = stored?.approvalState === 'approved';
  const bars = buildTrackBars(payload.timeline);
  const art = heroArt(template);
  const backdrop = backdropArt(template);

  const key = cacheKey(params.id, template, payload, approved);
  const hit = RENDER_CACHE.get(key);
  if (hit) {
    return new Response(new Uint8Array(hit), {
      headers: { 'Content-Type': 'image/png', 'X-Poster-Engine': 'rendered-cached' },
    });
  }

  const image = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          fontFamily: 'sans-serif',
          // The generated artwork is the base layer. Ten attempts showed the
          // model cannot place a band reliably — it put them mid-page, at
          // partial width, or filling the sheet — so the structure below is
          // drawn in code and the art shows through around it.
          backgroundImage: backdrop
            ? `linear-gradient(${POSTER.paper}f2, ${POSTER.paper}f2), url(${backdrop})`
            : undefined,
          backgroundColor: POSTER.paper,
          backgroundSize: '100% 100%',
        }}
      >
        {/* ---------------- header ---------------- */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            // The generated texture sits underneath a gradient of the accent,
            // so the band keeps its meaning while gaining depth. Text is
            // rendered over it, never generated into it.
            // Our geometry, the model's texture: the gradient is slightly
            // translucent so the generated artwork reads through it.
            backgroundImage: backdrop
              ? `linear-gradient(135deg, ${accent}f0 0%, ${shade(accent)}fa 100%), url(${backdrop})`
              : `linear-gradient(135deg, ${accent} 0%, ${shade(accent)} 100%)`,
            backgroundSize: '100% 100%, 100% 340%',
            padding: '44px 56px 42px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{ display: 'flex',
                  fontSize: 21,
                  letterSpacing: 3,
                  color: 'rgba(255,255,255,0.72)',
                  textTransform: 'uppercase',
                }}
              >
                {TEMPLATE_EYEBROW[template]}
              </div>
              <div style={{ display: 'flex', fontSize: 17, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                Delaware Department of Finance
              </div>
            </div>
            {/* The same mark component the nav rail renders, so the identity
                is one shape rather than two definitions that drift apart. */}
            <div style={{ display: 'flex' }}>
              <Mark size={54} on="dark" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
            <div
              style={{ display: 'flex',
                flex: 1,
                fontSize: 52,
                fontWeight: 700,
                color: POSTER.paper,
                lineHeight: 1.14,
              }}
            >
              {payload.headline}
            </div>
            {/* Decoration, and only decoration: it carries no information the
                text does not already state, so a missing file costs nothing. */}
            {art && (
              <img
                src={art}
                width={200}
                height={200}
                style={{ marginLeft: 26, borderRadius: 18, opacity: 0.96 }}
              />
            )}
          </div>
        </div>

        {/* ---------------- when ---------------- */}
        {payload.when && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: POSTER.wash,
              padding: '30px 56px',
            }}
          >
            <div style={{ display: 'flex', fontSize: 20, color: POSTER.faint, letterSpacing: 2 }}>WHEN</div>
            <div style={{ display: 'flex', fontSize: 33, color: POSTER.ink, fontWeight: 600, marginTop: 10 }}>
              {`${payload.when.start}  —  ${payload.when.end}`}
            </div>
            <div style={{ display: 'flex', fontSize: 21, color: POSTER.body, marginTop: 8 }}>
              {`${payload.when.duration} · ${payload.when.timezone}${
                payload.when.crossesMidnight ? ' · runs past midnight' : ''
              }`}
            </div>
          </div>
        )}

        {/* ---------------- timeline ---------------- */}
        {payload.timeline.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '34px 56px 6px' }}>
            <div style={{ display: 'flex', fontSize: 20, color: POSTER.faint, letterSpacing: 2 }}>
              {'OUTAGE DETAILS AND TIMELINE'}
            </div>

            {/* The bar shows the shape of the night at a glance: which system
                is down when, and how the windows overlap. Omitted entirely if
                the times could not be parsed, rather than drawn wrong. */}
            {bars.length > 0 && (
              <div
                style={{ display: 'flex',
                  flexDirection: 'column',
                  marginTop: 20,
                  padding: '20px 22px',
                  background: POSTER.wash,
                  borderRadius: 14,
                }}
              >
                {bars.map((b: TrackBar, i: number) => (
                  <div
                    key={b.label + i}
                    style={{ display: 'flex', alignItems: 'center', marginTop: i === 0 ? 0 : 14 }}
                  >
                    <div
                      style={{ display: 'flex',
                        width: 210,
                        fontSize: 20,
                        color: POSTER.ink,
                        fontWeight: 600,
                      }}
                    >
                      {b.label}
                    </div>
                    <div
                      style={{ display: 'flex',
                        position: 'relative',
                        width: 520,
                        height: 16,
                        background: POSTER.track,
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{ display: 'flex',
                          position: 'absolute',
                          left: `${(b.left * 100).toFixed(2)}%`,
                          width: `${(b.width * 100).toFixed(2)}%`,
                          top: 0,
                          bottom: 0,
                          background: b.color,
                          borderRadius: 8,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {payload.timeline.slice(0, 5).map((t, i) => (
              <div
                key={t.label + i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: 18,
                  paddingBottom: 16,
                  borderBottom: `1px solid ${POSTER.rule}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: 15,
                    height: 15,
                    borderRadius: 8,
                    background: TRACK_COLORS[i % TRACK_COLORS.length],
                    marginRight: 20,
                  }}
                />
                <div style={{ display: 'flex', fontSize: 27, color: POSTER.ink, fontWeight: 600, width: 350 }}>
                  {t.label}
                </div>
                <div style={{ display: 'flex', fontSize: 25, color: POSTER.body }}>
                  {compactRange(t.start, t.end)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------------- systems + impact ---------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '28px 56px 0' }}>
          {payload.systems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 30 }}>
              <div style={{ display: 'flex', fontSize: 20, color: POSTER.faint, letterSpacing: 2 }}>
                AFFECTED SYSTEMS
              </div>
              {/* A row of pictures rather than a comma-separated list: the
                  reader is scanning a poster, not reading a paragraph. */}
              <div style={{ display: 'flex', marginTop: 16 }}>
                {payload.systems.slice(0, 5).map((sys, i) => {
                  const icon = systemIcon(sys);
                  return (
                    <div
                      key={sys + i}
                      style={{ display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: 172,
                        marginRight: 8,
                      }}
                    >
                      {icon && (
                        <img src={icon} width={92} height={92} style={{ borderRadius: 16 }} />
                      )}
                      <div
                        style={{ display: 'flex',
                          fontSize: 19,
                          color: POSTER.ink,
                          marginTop: 10,
                          textAlign: 'center',
                          lineHeight: 1.25,
                        }}
                      >
                        {sys.length > 22 ? `${sys.slice(0, 21)}…` : sys}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* One line, not a paragraph. The full wording is in the email that
              this poster accompanies; repeating it here turns a poster into a
              document, which is the note Jay gave. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 20, color: POSTER.faint, letterSpacing: 2 }}>
              WHAT IT MEANS
            </div>
            <div
              style={{ display: 'flex',
                fontSize: 28,
                color: POSTER.ink,
                marginTop: 12,
                lineHeight: 1.35,
              }}
            >
              {firstSentence(payload.impact, 128)}
            </div>
          </div>

          {payload.actions.length > 0 && (
            <div
              style={{ display: 'flex',
                alignItems: 'center',
                marginTop: 26,
                padding: '20px 24px',
                background: POSTER.wash,
                borderRadius: 16,
                borderLeft: `6px solid ${accent}`,
              }}
            >
              <div style={{ display: 'flex', fontSize: 25, color: POSTER.ink, lineHeight: 1.35 }}>
                {firstSentence(payload.actions[0], 118)}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- footer ---------------- */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderTop: `1px solid ${POSTER.rule}`,
            padding: '26px 56px 30px',
          }}
        >
          {payload.contact && (
            <div style={{ display: 'flex', fontSize: 23, color: POSTER.ink }}>
              <div style={{ display: 'flex', marginRight: 10 }}>Questions:</div>
              <div style={{ display: 'flex', color: accent }}>{payload.contact}</div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 17,
                color: approved ? POSTER.green : POSTER.red,
                fontWeight: 600,
                letterSpacing: 1,
                marginRight: 16,
              }}
            >
              {approved ? 'APPROVED FOR DISTRIBUTION' : 'DRAFT — NOT APPROVED'}
            </div>
            <div style={{ display: 'flex', fontSize: 17, color: POSTER.faint }}>
              Generated from the original notice. The email remains the system of record.
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: posterHeight(payload) },
  );

  // ImageResponse is a stream; buffer it once so it can be both cached and
  // returned. Reading it twice is not possible.
  const bytes = Buffer.from(await image.arrayBuffer());
  remember(key, bytes);

  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/png', 'X-Poster-Engine': 'rendered' },
  });
}
