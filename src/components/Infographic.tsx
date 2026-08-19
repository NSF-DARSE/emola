'use client';

import { useState } from 'react';

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
  // Changing anything must bust the browser's cache for the same URL.
  const [nonce, setNonce] = useState(0);

  const src = `/api/infographic/${notificationId}?v=${nonce}${
    style ? `&template=${style}` : ''
  }${engine === 'generated' ? '&engine=generated' : ''}`;

  function change(fn: () => void) {
    fn();
    setFailed(null);
    setNonce((n) => n + 1);
  }

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
          offer a control that does nothing much. */}
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
        <img
          src={src}
          alt={`Poster for ${data.headline}`}
          className="w-full h-auto rounded-[10px] border border-border"
          onError={async () => {
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
