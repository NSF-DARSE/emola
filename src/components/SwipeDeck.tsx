'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import { CATEGORIES, STATUSES, type Category, type Status } from '@/lib/taxonomy';

/**
 * The review queue as a card deck.
 *
 * Blind-first is the point, and it survives the faster interaction: the card
 * carries the notice and nothing else, the model's call is not in the page at
 * all, and it arrives only in the API response to a decision that has already
 * been written. Swiping cannot leak it because the client never had it.
 *
 * Swipe right to relay the original untouched, left to hold it for a person.
 * Both are also plain buttons and both answer to the arrow keys — a gesture
 * that is the only way to do something is an accessibility failure, and this
 * is a queue someone may work through for an hour.
 */

export interface BlindCard {
  id: string;
  subject: string;
  body: string;
  receivedAt: string;
  systems: string[];
  window: string | null;
}

interface Reveal {
  model: { primary: string; status: string; confidence: number; reasoning: string };
  routeReasons: string[];
}

type Call = 'approve' | 'reject';

const HOLD_REASONS = [
  'Affects production in business hours',
  'Ambiguous about the impact',
  'Needs the service owner to confirm',
  'Duplicate of an earlier notice',
];

const RELAY_REASONS = [
  'Routine planned work, no impact',
  'Non-production systems only',
  'Clear dates and clear scope',
  'Matches one we have relayed before',
];

/** Past this fraction of the card's width, releasing commits the swipe. */
const COMMIT_AT = 0.28;

export default function SwipeDeck({ cards }: { cards: BlindCard[] }) {
  const [index, setIndex] = useState(0);
  const [call, setCall] = useState<Call | null>(null);
  const [primary, setPrimary] = useState<Category | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [reason, setReason] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [drag, setDrag] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const card = cards[index];
  const done = index >= cards.length;

  // The reviewer's name is the same all session; asking once is enough.
  useEffect(() => {
    setReviewer(window.localStorage.getItem('reviewer') ?? '');
  }, []);

  const choose = useCallback((c: Call) => {
    setCall(c);
    setReason('');
    setError(null);
    setDrag(0);
  }, []);

  // Arrow keys drive the deck, but not while someone is typing a reason.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (call || reveal || done) return;
      if (e.key === 'ArrowRight') choose('approve');
      if (e.key === 'ArrowLeft') choose('reject');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [call, reveal, done, choose]);

  function onPointerDown(e: React.PointerEvent) {
    if (call || reveal) return;
    dragging.current = true;
    startX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setDrag(e.clientX - startX.current);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    const width = cardRef.current?.offsetWidth ?? 480;
    if (Math.abs(drag) > width * COMMIT_AT) choose(drag > 0 ? 'approve' : 'reject');
    else setDrag(0);
  }

  async function save() {
    if (!card || !call) return;
    if (!primary || !status) {
      setError('Pick a category and a status first.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Add a reason — at least a few words.');
      return;
    }
    if (!reviewer.trim()) {
      setError('Add your name, so the decision is attributable.');
      return;
    }

    setSaving(true);
    setError(null);
    window.localStorage.setItem('reviewer', reviewer.trim());

    const res = await fetch('/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationId: card.id,
        decision: call,
        humanPrimary: primary,
        humanSecondary: [],
        humanStatus: status,
        reason: reason.trim(),
        reviewer: reviewer.trim(),
      }),
    });
    setSaving(false);

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Could not save that.');
      return;
    }
    setReveal({ model: json.reveal.model, routeReasons: json.reveal.routeReasons });
  }

  function next() {
    setIndex((i) => i + 1);
    setCall(null);
    setPrimary(null);
    setStatus(null);
    setReason('');
    setReveal(null);
    setError(null);
    setDrag(0);
  }

  if (done) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <div className="text-center anim-rise max-w-[40ch]">
          <div className="text-[15px] font-semibold">Queue clear</div>
          <p className="text-[13.5px] text-muted mt-1.5 leading-relaxed">
            {cards.length} {cards.length === 1 ? 'notice' : 'notices'} reviewed. Your decisions are
            in the precedent table. The model&rsquo;s guesses are not.
          </p>
        </div>
      </div>
    );
  }

  const rotation = drag / 26;
  const intent: Call | null = drag > 60 ? 'approve' : drag < -60 ? 'reject' : null;
  const agreed = reveal ? reveal.model.primary === primary : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-[12.5px] text-faint">
          <span className="tabular-nums">
            {index + 1} of {cards.length}
          </span>
          {!call && !reveal && (
            <span className="hidden sm:block">Drag the card, or use the arrow keys</span>
          )}
        </div>

        {/* ---- the notice, and nothing the model thinks about it ---- */}
        <div
          ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`card-deck ${call || reveal ? '' : 'card-grab'}`}
          style={{
            transform: `translateX(${drag}px) rotate(${rotation}deg)`,
            transition: dragging.current ? 'none' : 'transform 240ms cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {intent && !call && (
            <span className={`card-stamp ${intent === 'approve' ? 'stamp-relay' : 'stamp-hold'}`}>
              {intent === 'approve' ? 'Relay' : 'Hold'}
            </span>
          )}

          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[16px] font-semibold leading-snug">{card.subject}</h2>
            <span className="text-[12.5px] text-faint shrink-0 tabular-nums">
              {card.receivedAt.slice(0, 10)}
            </span>
          </div>

          <p className="text-[14px] leading-[1.62] text-muted whitespace-pre-wrap mt-3">
            {card.body}
          </p>

          {(card.systems.length > 0 || card.window) && (
            <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px]">
              {card.window && (
                <span className="text-muted">
                  <span className="text-faint">When </span>
                  {card.window}
                </span>
              )}
              {card.systems.length > 0 && (
                <span className="text-muted">
                  <span className="text-faint">Systems </span>
                  {card.systems.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>

        {!call && !reveal && (
          <div className="flex gap-3">
            <button onClick={() => choose('reject')} className="btn flex-1 justify-center">
              <Icon name="eyeOff" size={15} />
              Hold for a person
            </button>
            <button onClick={() => choose('approve')} className="btn flex-1 justify-center">
              <Icon name="check" size={15} />
              Relay original
            </button>
          </div>
        )}

        {/* ---- your own read, recorded before any reveal ---- */}
        {call && !reveal && (
          <div className="flex flex-col gap-4 anim-rise">
            <div className="text-[13px] text-muted">
              You chose to{' '}
              <strong className="text-fg">
                {call === 'approve' ? 'relay the original' : 'hold this for a person'}
              </strong>
              . Record your own read before the system shows you its one.
            </div>

            <ChipRow label="Category" options={CATEGORIES} value={primary} onPick={setPrimary} />
            <ChipRow label="Status" options={STATUSES} value={status} onPick={setStatus} />

            <div>
              <div className="label mb-1.5">Reason</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(call === 'approve' ? RELAY_REASONS : HOLD_REASONS).map((r) => (
                  <button key={r} onClick={() => setReason(r)} className="chip">
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why? The next reviewer will read this."
                className="field w-full resize-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="Your name"
                className="field w-[180px]"
              />
              <button onClick={save} disabled={saving} className="btn btn-primary">
                {saving ? 'Saving…' : 'Save and reveal'}
              </button>
              <button onClick={() => setCall(null)} className="btn">
                Back
              </button>
            </div>

            {error && (
              <div className="text-[13px]" style={{ color: 'var(--sig-red)' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ---- reveal, only after the decision is written ---- */}
        {reveal && (
          <div className="flex flex-col gap-3 anim-rise">
            <div
              className="reveal"
              style={{ borderColor: agreed ? 'var(--sig-green)' : 'var(--sig-amber)' }}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <Icon name={agreed ? 'check' : 'alert'} size={15} />
                <span className="text-[13.5px] font-semibold">
                  {agreed ? 'The model agreed with you' : 'You and the model differ'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                <span className="text-faint">You said</span>
                <span className="text-faint">Model said</span>
                <span className="text-fg font-medium">
                  {primary} · {status}
                </span>
                {/* The percentage belongs to the CATEGORY only. Status comes
                    from wording rules and carries no probability, so placing
                    the number after both reads as a confidence the model
                    never expressed. */}
                <span className="text-fg font-medium">
                  {reveal.model.primary}{' '}
                  <span className="text-faint tabular-nums">
                    {Math.round(reveal.model.confidence * 100)}%
                  </span>
                  <span className="text-faint"> · </span>
                  {reveal.model.status}
                  <span className="text-faint"> (rule)</span>
                </span>
              </div>

              <p className="text-[12.5px] text-muted mt-2.5 leading-relaxed">
                {reveal.model.reasoning}
              </p>
              <p className="text-[12px] text-faint mt-2">
                Your decision was stored. The model&rsquo;s was not.
              </p>
            </div>

            <button onClick={next} className="btn btn-primary self-start">
              Next notice
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onPick(o)}
            className={`chip ${value === o ? 'chip-active' : ''}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
