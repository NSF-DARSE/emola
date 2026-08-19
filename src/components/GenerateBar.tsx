'use client';

import { useState } from 'react';

import Icon from '@/components/Icon';
import Infographic, { PosterOrigin, type Engine } from '@/components/Infographic';
import { Badge } from '@/components/ui';
import type { InfographicPayload } from '@/lib/artifacts';
import type { ArtifactKind, ArtifactRecord } from '@/lib/types';

/**
 * Per-notice generation is the INFOGRAPHIC only. An employee needs "your
 * maintenance is Thursday", which is inherently about one event.
 *
 * The executive summary moved to Reports, where it covers a selected period —
 * leadership reads a month, not an email.
 */
const KINDS: ArtifactKind[] = ['infographic'];

const LABEL: Record<string, string> = { infographic: 'Infographic' };
const AUDIENCE: Record<string, string> = { infographic: 'For employees' };

export default function GenerateBar({
  notificationId,
  initial,
}: {
  notificationId: string;
  initial: Partial<Record<ArtifactKind, ArtifactRecord>>;
}) {
  const [artifacts, setArtifacts] = useState(initial);
  // Only kinds this component still renders. A stale exec_summary artifact
  // from before that moved to Reports must never be opened here — it would be
  // handed to the infographic template and crash.
  const [open, setOpen] = useState<ArtifactKind | null>(
    initial.infographic ? 'infographic' : null,
  );
  const [busy, setBusy] = useState<ArtifactKind | null>(null);
  const [approver, setApprover] = useState('');
  // Mirrors the toggle inside Infographic, so the provenance note below the
  // approval buttons describes the engine actually being previewed.
  const [engine, setEngine] = useState<Engine>('rendered');
  const [error, setError] = useState<string | null>(null);

  async function generate(kind: ArtifactKind) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not generate.');
      setArtifacts((a) => ({ ...a, [kind]: data.artifact }));
      setOpen(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  async function decide(kind: ArtifactKind, state: 'approved' | 'rejected') {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/artifacts/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, kind, state, approver }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not record approval.');
      setArtifacts((a) => ({ ...a, [kind]: data.artifact }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const activeKind: ArtifactKind | null = open;
  const current = activeKind ? artifacts[activeKind] : undefined;
  const payload = current ? JSON.parse(current.payload) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((kind) => {
          const existing = artifacts[kind];
          const isOpen = activeKind === kind;
          return (
            <button
              key={kind}
              type="button"
              className={`btn ${isOpen ? 'btn-primary' : ''}`}
              disabled={busy !== null}
              onClick={() => (existing ? setOpen(kind) : generate(kind))}
            >
              {!existing && <Icon name="sparkle" size={14} />}
              {busy === kind ? 'Working…' : existing ? LABEL[kind] : `Generate ${LABEL[kind].toLowerCase()}`}
              {existing && existing.approvalState === 'approved' && (
                <span style={{ color: 'var(--sig-green)' }}>
                  <Icon name="check" size={13} />
                </span>
              )}
            </button>
          );
        })}
        {activeKind && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy !== null}
            onClick={() => generate(activeKind)}
          >
            Regenerate
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--sig-red)' }}>
          {error}
        </div>
      )}

      {activeKind && payload && current && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="label">{AUDIENCE[activeKind]}</span>
            <span className="ml-auto">
              <Badge
                signal={
                  current.approvalState === 'approved'
                    ? 'green'
                    : current.approvalState === 'rejected'
                      ? 'red'
                      : 'amber'
                }
              >
                {current.approvalState === 'draft'
                  ? 'not approved yet'
                  : current.approvalState}
              </Badge>
            </span>
          </div>

          <div className="flex flex-col gap-5 pb-4">
            <Infographic
              data={payload as InfographicPayload}
              notificationId={notificationId}
              onEngineChange={setEngine}
            />

            {/* Approval sits directly under the picture: the decision is the
                point of the panel, and it should not be below a paragraph
                explaining provenance. */}
            <div className="card px-4 py-3.5 flex flex-col gap-2.5">
              {current.approvalState === 'draft' ? (
                <>
                  <div className="text-[13px] text-muted">
                    Nobody sees this until you say so. Put your name on it and choose.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={approver}
                      onChange={(e) => setApprover(e.target.value)}
                      placeholder="Your name"
                    />
                    <button
                      type="button"
                      className="btn btn-primary shrink-0"
                      disabled={busy !== null || !approver.trim()}
                      onClick={() => decide(activeKind, 'approved')}
                    >
                      <Icon name="check" size={15} />
                      Looks right, send it
                    </button>
                    <button
                      type="button"
                      className="btn shrink-0"
                      disabled={busy !== null || !approver.trim()}
                      onClick={() => decide(activeKind, 'rejected')}
                    >
                      Not right, hold it
                    </button>
                  </div>
                </>
              ) : current.approvalState === 'approved' ? (
                <div className="text-[13px]" style={{ color: 'var(--sig-green)' }}>
                  {current.approvedBy} approved this on{' '}
                  {new Date(current.approvedAt!).toLocaleString()}. It can go out.
                </div>
              ) : (
                <div className="text-[13px]" style={{ color: 'var(--sig-red)' }}>
                  {current.approvedBy} held this back. Only the original email can be forwarded.
                </div>
              )}
            </div>

            <p className="text-[12.5px] text-muted leading-relaxed">
              <PosterOrigin engine={engine} />
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
