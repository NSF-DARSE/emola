'use client';

import { useEffect, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import type { InfographicPayload } from '@/lib/artifacts';

/**
 * The poster preview.
 *
 * Shows the actual image that would be sent, not an HTML re-creation of it.
 * There was a version that laid the same JSON out in the DOM and it drifted:
 * what a reviewer approved on screen was not what got attached. One renderer,
 * one output.
 *
 * Two engines with opposite failure modes, so both are offered:
 *   Built here    text comes from the notice, so it cannot be wrong
 *   Drawn by AI   the layout is inventive, the words are not guaranteed
 */

const STYLES = [
  { key: '', label: 'Pick automatically' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'outage', label: 'Outage' },
  { key: 'security', label: 'Security' },
  { key: 'resolved', label: 'All clear' },
] as const;

export type Engine = 'rendered' | 'generated';

export default function Infographic({
  data,
  notificationId,
  onEngineChange,
}: {
  data: InfographicPayload;
  notificationId: string;
  /** Reported upward so the provenance note can describe the right engine. */
  onEngineChange?: (engine: Engine) => void;
}) {
  const [engine, setEngine] = useState<Engine>('rendered');
  const [style, setStyle] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /*
   * Shown only once loading has lasted long enough to notice. A cached poster
   * arrives in about thirty milliseconds, and a spinner that appears and
   * vanishes in that time is a flash of noise — worse than showing nothing.
   */
  const [showSpinner, setShowSpinner] = useState(false);
  /*
   * The last height the image rendered at, held so the box keeps its size
   * while the next one loads. Without it the container collapses to nothing
   * and everything below jumps up, then jumps back.
   */
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Changing anything must bust the browser's cache for the same URL.
  const [nonce, setNonce] = useState(0);

  const src = `/api/infographic/${notificationId}?v=${nonce}${
    style ? `&template=${style}` : ''
  }${engine === 'generated' ? '&engine=generated' : ''}`;

  /*
   * A browser keeps painting the PREVIOUS image until the next one arrives.
   * Drawing one takes about ten seconds, so switching to the AI engine left
   * the rendered poster on screen the whole time with nothing to say it was
   * working — it looked like the toggle had done nothing.
   *
   * Marking loading whenever the URL changes is what removes that. It is a
   * layout effect on `src` rather than something set inside the click
   * handler, so a style change and an engine change both get it without
   * either remembering to.
   */
  useEffect(() => {
    // Remember how tall the current picture is before swapping it out.
    if (imgRef.current?.clientHeight) setHeldHeight(imgRef.current.clientHeight);
    setLoading(true);
    setFailed(null);
  }, [src]);

  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(t);
  }, [loading]);

  /*
   * Warms the other styles once the visible one has arrived.
   *
   * Each style is a separate render costing about two seconds the first time,
   * so flipping through them was slow exactly once per style. Fetching them in
   * the background after the first paint means the click is instant, and it
   * costs nothing extra — the server caches the result either way.
   *
   * Only the rendered engine is warmed. Doing this for the AI engine would
   * quietly fire four paid generations per notice.
   */
  const warmed = useRef(false);
  useEffect(() => {
    if (warmed.current || loading || failed || engine !== 'rendered') return;
    warmed.current = true;

    const idle =
      (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
      ((cb: () => void) => window.setTimeout(cb, 400));

    idle(() => {
      for (const s of STYLES) {
        if (s.key === style) continue;
        const img = new Image();
        img.src = `/api/infographic/${notificationId}?v=warm${s.key ? `&template=${s.key}` : ''}`;
      }
    });
  }, [loading, failed, engine, style, notificationId]);

  function change(fn: () => void) {
    fn();
    setNonce((n) => n + 1);
  }

  const slow = engine === 'generated';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="seg">
          {(
            [
              ['rendered', 'Built here'],
              ['generated', 'Drawn by AI'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() =>
                change(() => {
                  setEngine(key);
                  onEngineChange?.(key);
                })
              }
              className={`seg-item ${engine === key ? 'seg-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <a href={src} download={`${notificationId}.png`} className="btn ml-auto">
          Open full size
        </a>
      </div>

      {/* The style picker only changes how the poster looks, which is a
          decision the AI makes for itself. Showing it under that engine would
          offer a control that does nothing much — and each style is a separate
          paid generation, so it would also be a way to spend without noticing. */}
      {engine === 'rendered' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => change(() => setStyle(s.key))}
              className={`chip ${style === s.key ? 'chip-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {failed ? (
        <div className="note note-red">
          <span className="shrink-0 mt-px" style={{ color: 'var(--sig-red)' }}>
            <Icon name="alert" size={15} />
          </span>
          <div className="min-w-0">
            <strong>This could not be made.</strong> {failed}
          </div>
        </div>
      ) : (
        <div
          className="relative"
          // Holds the previous height while the next image decodes, so the
          // approval buttons below do not jump up and back.
          style={loading && heldHeight ? { minHeight: heldHeight } : undefined}
        >
          <img
            // Keyed on the URL so React swaps the element rather than reusing
            // one that is still showing the old picture.
            key={src}
            ref={imgRef}
            src={src}
            alt={`Poster for ${data.headline}`}
            className={`w-full h-auto rounded-[10px] border border-border transition-opacity duration-200 ${
              showSpinner ? 'opacity-25' : 'opacity-100'
            }`}
            onLoad={(e) => {
              setLoading(false);
              setHeldHeight(e.currentTarget.clientHeight);
            }}
            onError={async () => {
              setLoading(false);
              // A non-image response means the safety check refused, or the
              // model failed. Read the reason rather than showing a broken icon.
              try {
                const res = await fetch(src);
                const json = await res.json();
                setFailed(json.error ?? 'Something went wrong making it.');
              } catch {
                setFailed('Could not reach the server.');
              }
            }}
          />

          {showSpinner && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-2.5 rounded-[10px] bg-surface/90 px-5 py-4 border border-border">
                <span className="spinner" aria-hidden="true" />
                <span className="text-[13px] text-fg">
                  {slow ? 'Drawing this one' : 'Building it'}
                </span>
                {/* Only said where it is true: ten seconds of silence needs
                    explaining, one second does not. */}
                {slow && (
                  <span className="text-[12px] text-faint">
                    AI takes about ten seconds. Cached after this.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Plain-language note about where a poster came from. Shown after approval. */
export function PosterOrigin({ engine }: { engine: Engine }) {
  return engine === 'rendered' ? (
    <>
      <strong>Built here from the email.</strong> Every date, time and system name is copied
      straight out of the original notice, so the words cannot be wrong.
    </>
  ) : (
    <>
      <strong>Drawn by AI.</strong> Read every date and name against the original before you
      approve it — AI can get words wrong. Personal details, server names and addresses were
      removed before anything was sent.
    </>
  );
}
