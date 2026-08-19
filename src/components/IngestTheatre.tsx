'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import Odometer from '@/components/Odometer';

/**
 * The empty state, and the pipeline running.
 *
 * Everything replayed here is real: the stages ran during ingest and the
 * results come back from the API. The animation controls only the pace at
 * which they are revealed, because a pipeline that finishes in 40ms is
 * invisible and this is the part of the system worth watching.
 */

interface IngestedNotice {
  id: string;
  subject: string;
  category: string;
  confidence: number;
  route: 'auto_send' | 'human_review';
  holdReasons: string[];
  flagged: boolean;
}

const STAGES = [
  { key: 'connect', label: 'Opening mailbox' },
  { key: 'triage', label: 'Finding abnormal events' },
  { key: 'classify', label: 'Classifying' },
  { key: 'route', label: 'Routing' },
] as const;

/** Slow enough to read a row, fast enough not to be waiting on it. */
const ROW_INTERVAL_MS = 130;
const STAGE_INTERVAL_MS = 520;

export default function IngestTheatre({ mailbox }: { mailbox: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [notices, setNotices] = useState<IngestedNotice[]>([]);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [handingOver, setHandingOver] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    setStage(0);
    setNotices([]);
    setShown(0);

    // Walk the stage list while the request is in flight. The request is
    // usually faster than the walk, which is the point — the pacing exists
    // for the person watching, not for the machine.
    STAGES.forEach((_, i) => {
      if (i > 0) after(i * STAGE_INTERVAL_MS, () => setStage(i));
    });

    let data: { notices: IngestedNotice[] };
    try {
      const res = await fetch('/api/ingest?reset=1', { method: 'POST' });
      if (!res.ok) {
        // Read the body: the route reports the real cause, and a bare status
        // code sends whoever is debugging on a hunt they do not need.
        const detail = await res.json().catch(() => null);
        throw new Error(
          detail?.hint
            ? `${detail.hint} (${detail.error})`
            : detail?.error ?? `The mailbox returned ${res.status}.`,
        );
      }
      data = await res.json();
    } catch (e) {
      timers.current.forEach(clearTimeout);
      setError(e instanceof Error ? e.message : 'Could not reach the mailbox.');
      setRunning(false);
      setStage(-1);
      return;
    }

    const start = STAGES.length * STAGE_INTERVAL_MS;
    after(start, () => {
      setNotices(data.notices);
      data.notices.forEach((_, i) => {
        after(i * ROW_INTERVAL_MS, () => setShown(i + 1));
      });
      // Let the last row settle, then hand over to the real list.
      after(data.notices.length * ROW_INTERVAL_MS + 900, () => {
        setHandingOver(true);
        router.refresh();

        /*
         * router.refresh() is a soft refetch and it does not always land — in
         * dev especially, the server component tree can come back cached and
         * this component stays mounted showing its own list, which is exactly
         * the "nothing happens after classifying" complaint.
         *
         * So: give the soft path a moment, and if we are still here, navigate
         * properly. A hard load is worse than a refresh and much better than
         * a screen that never moves.
         */
        after(1800, () => {
          window.location.assign('/');
        });
      });
    });
  }

  const held = notices.slice(0, shown).filter((n) => n.route === 'human_review').length;
  const sent = notices.slice(0, shown).filter((n) => n.route === 'auto_send').length;

  if (!running) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <div className="max-w-[50ch] text-center anim-rise">
          <div className="sphere" aria-hidden="true" />
          <h2 className="text-[27px] sm:text-[31px] font-semibold tracking-[-0.025em] leading-[1.14] mt-9">
            Six hundred emails.
            <br />
            Seven that matter.
          </h2>
          <p className="text-[14.5px] text-muted mt-3 leading-relaxed mx-auto max-w-[40ch]">
            Pull the {mailbox} mailbox in and watch every notice go through triage,
            classification and routing.
          </p>
          <button onClick={run} className="btn btn-primary mt-7 mx-auto">
            <Icon name="events" size={15} />
            Get email from the mailbox
          </button>
          {error && (
            <p className="text-[13px] mt-3" style={{ color: 'var(--sig-red)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* stage rail */}
      <div className="shrink-0 border-b border-border px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className={`stage ${i < stage ? 'stage-done' : ''} ${i === stage ? 'stage-live' : ''}`}>
                {i < stage ? <Icon name="check" size={13} /> : <span className="stage-dot" />}
                {s.label}
              </span>
              {i < STAGES.length - 1 && <span className="stage-link" aria-hidden="true" />}
            </div>
          ))}
        </div>

        {handingOver && (
          <div className="flex items-center gap-2.5 mt-4 text-[13px] text-muted">
            <span className="spinner" aria-hidden="true" />
            <span>Opening the list…</span>
          </div>
        )}

        {shown > 0 && !handingOver && (
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-1 mt-4">
            <Tally n={shown} label="ingested" />
            <Tally n={sent} label="forwarded unchanged" signal="var(--sig-green)" />
            <Tally n={held} label="held for a person" signal="var(--sig-amber)" />
          </div>
        )}
      </div>

      {/* rows landing */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {notices.slice(0, shown).map((n) => (
          <div key={n.id} className="trow anim-land">
            <span
              className="trow-bar"
              style={{
                background:
                  n.route === 'auto_send' ? 'var(--sig-green)' : 'var(--sig-amber)',
              }}
            />
            <span className="hidden md:block w-[104px] shrink-0 text-[12.5px] text-muted truncate">
              {n.category}
            </span>
            <span className="flex-1 min-w-0 text-[14px] text-fg truncate">{n.subject}</span>

            {n.flagged && (
              <span className="shrink-0" style={{ color: 'var(--sig-amber)' }} title="Contains data that must not be sent">
                <Icon name="warning" size={15} />
              </span>
            )}

            <span className="hidden sm:block shrink-0 text-[12px] text-faint tabular-nums w-[42px] text-right">
              {Math.round(n.confidence * 100)}%
            </span>

            <span className="shrink-0 flex items-center gap-1.5 w-[132px]">
              <Icon name={n.route === 'auto_send' ? 'check' : 'eyeOff'} size={14} />
              <span className="text-[12.5px] text-muted truncate">
                {n.route === 'auto_send' ? 'Forwarded as-is' : n.holdReasons[0] ?? 'Held'}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A rolling count with its label, used while notices are landing. */
function Tally({ n, label, signal }: { n: number; label: string; signal?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <Odometer
        value={n}
        className="text-[20px] font-semibold tracking-[-0.02em]"
      />
      <span className="text-[12.5px] text-muted" style={signal ? { color: signal } : undefined}>
        {label}
      </span>
    </span>
  );
}
