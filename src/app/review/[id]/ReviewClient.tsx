'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Icon from '@/components/Icon';
import { Badge, CategoryLabel, Field, Meter, Note, StatusBadge } from '@/components/ui';
import type { Signal } from '@/lib/severity';
import { CATEGORIES, STATUSES, type Category, type Status } from '@/lib/taxonomy';
import type { ExtractedFields, ModelAssessment, PrecedentMatch, SafetyReport } from '@/lib/types';

interface RevealPayload {
  model: ModelAssessment;
  safety: SafetyReport;
  routeReasons: string[];
  precedents: PrecedentMatch[];
}

function spanSignal(kind: string): Signal {
  if (kind === 'ip_address') return 'red';
  if (kind === 'server_name' || kind === 'unknown_term') return 'amber';
  return 'neutral';
}

export default function ReviewClient({
  id,
  extracted,
  humanReadableWindow,
}: {
  id: string;
  extracted: ExtractedFields;
  humanReadableWindow: string;
}) {
  const router = useRouter();

  const [reviewer, setReviewer] = useState('');
  const [primary, setPrimary] = useState<Category | ''>('');
  const [secondary, setSecondary] = useState<Category[]>([]);
  const [status, setStatus] = useState<Status | ''>('');
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | ''>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);

  const complete =
    reviewer.trim() !== '' && primary !== '' && status !== '' && reason.trim().length >= 10 && decision !== '';

  function toggleSecondary(c: Category) {
    setSecondary((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function submit() {
    if (!complete) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: id,
          decision,
          humanPrimary: primary,
          humanSecondary: secondary,
          humanStatus: status,
          reason,
          reviewer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not record the decision.');
      setReveal(data.reveal as RevealPayload);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---- After the decision is recorded -----------------------------------
  if (reveal) {
    const catAgree = reveal.model.primary === primary;
    const statusAgree = reveal.model.status === status;

    return (
      <div className="space-y-3">
        <Note tone="blue" icon="check">
          <strong>Decision recorded.</strong> Your ruling and reason are in the precedent table.
          What the engine said is below — it was not stored as a precedent.
        </Note>

        <div className="card px-4 py-3">
          <div className="label mb-2">Engine assessment · {reveal.model.engine}</div>
          <Field label="Category">
            <div className="flex flex-wrap items-center gap-2.5">
              <CategoryLabel value={reveal.model.primary} />
              {reveal.model.secondary.map((s) => (
                <span key={s} className="cat opacity-70">
                  {s}
                </span>
              ))}
              <Badge signal={catAgree ? 'green' : 'red'}>
                {catAgree ? 'matches you' : `you said ${primary}`}
              </Badge>
            </div>
          </Field>
          <Field label="Status">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge value={reveal.model.status} />
              <Badge signal={statusAgree ? 'green' : 'red'}>
                {statusAgree ? 'matches you' : `you said ${status}`}
              </Badge>
            </div>
          </Field>
          <Field label="Confidence">
            <Meter value={reveal.model.confidence} />
          </Field>
          <Field label="Reasoning">
            <span className="text-muted">{reveal.model.reasoning}</span>
          </Field>
          <Field label="Why it was held">
            <ul className="space-y-0.5 text-muted">
              {reveal.routeReasons.map((r, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-faint">–</span>
                  {r}
                </li>
              ))}
            </ul>
          </Field>
        </div>

        <div className="card px-4 py-3">
          <div className="label mb-2">Redaction scan · {reveal.safety.score.toFixed(2)}</div>
          {reveal.safety.spans.length === 0 ? (
            <div className="text-[12.5px] text-faint">Nothing flagged.</div>
          ) : (
            <ul className="space-y-1.5">
              {reveal.safety.spans.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <Badge signal={spanSignal(s.kind)}>{s.kind.replace('_', ' ')}</Badge>
                  <code className="font-mono text-[11px] text-fg">{s.text}</code>
                  <span className="text-faint">{s.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card px-4 py-3">
          <div className="label mb-2">Similar past rulings</div>
          {reveal.precedents.length === 0 ? (
            <div className="text-[12.5px] text-faint">No close match in the precedent table.</div>
          ) : (
            <ul className="space-y-3">
              {reveal.precedents.map((m) => (
                <li key={m.precedent.id} className="text-[12.5px]">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[11px] text-faint">
                      {Math.round(m.similarity * 100)}%
                    </span>
                    <CategoryLabel value={m.precedent.humanPrimary} />
                    <StatusBadge value={m.precedent.humanStatus} />
                    <span className="text-[11px] text-faint">{m.precedent.reviewer}</span>
                  </div>
                  <div className="mt-1 text-muted">{m.precedent.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Link href={`/?selected=${id}`} className="btn btn-primary">
            Open the event
          </Link>
          <Link href="/review" className="btn">
            Back to queue
          </Link>
        </div>
      </div>
    );
  }

  // ---- Blind phase -------------------------------------------------------
  return (
    <div className="space-y-3">
      <Note tone="amber" icon="eyeOff">
        <strong>You are reviewing blind.</strong> The engine&apos;s category, confidence, reasoning
        and redaction flags are withheld until you submit — so the decision is yours, not a yes/no
        on a suggestion.
      </Note>

      <div className="card px-4 py-3">
        <div className="label mb-2">Extracted fields</div>
        <Field label="Event type">{extracted.eventType}</Field>
        <Field label="Affected systems">
          {extracted.affectedSystems.length ? (
            <div className="flex flex-wrap gap-1.5">
              {extracted.affectedSystems.map((s) => (
                <span key={s} className="badge">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-faint">Not itemised in the notice</span>
          )}
        </Field>
        <Field label="Schedule">
          <span className="font-mono text-[11.5px]">{humanReadableWindow}</span>
        </Field>
        <Field label="Impact">{extracted.impact}</Field>
        <Field label="Required action">{extracted.requiredAction}</Field>
      </div>

      <div className="card px-4 py-4 space-y-4">
        <div className="label">Your call</div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="text-[11.5px] text-faint mb-1.5">Primary category</div>
            <select value={primary} onChange={(e) => setPrimary(e.target.value as Category)}>
              <option value="">Select…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[11.5px] text-faint mb-1.5">Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="">Select…</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="text-[11.5px] text-faint mb-1.5">Secondary tags (optional)</div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter((c) => c !== primary).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleSecondary(c)}
                className={`badge ${secondary.includes(c) ? 'badge-blue' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11.5px] text-faint mb-1.5">
            Why — required, minimum 10 characters
            <span className="font-mono ml-1.5">({reason.trim().length})</span>
          </div>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What made you classify it this way, and what should the next reviewer know?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="block">
            <div className="text-[11.5px] text-faint mb-1.5">Reviewer</div>
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <div>
            <div className="text-[11.5px] text-faint mb-1.5">Decision</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDecision('approve')}
                className="btn flex-1"
                style={
                  decision === 'approve'
                    ? {
                        borderColor: 'var(--sig-green)',
                        background: 'var(--sig-green-bg)',
                        color: 'var(--sig-green)',
                      }
                    : undefined
                }
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setDecision('reject')}
                className="btn flex-1"
                style={
                  decision === 'reject'
                    ? {
                        borderColor: 'var(--sig-red)',
                        background: 'var(--sig-red-bg)',
                        color: 'var(--sig-red)',
                      }
                    : undefined
                }
              >
                Reject
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-[12px]" style={{ color: 'var(--sig-red)' }}>
            {error}
          </div>
        )}

        <button type="button" disabled={!complete || submitting} onClick={submit} className="btn btn-primary">
          <Icon name="check" size={14} />
          {submitting ? 'Recording…' : 'Submit decision and reveal the engine'}
        </button>
      </div>
    </div>
  );
}
