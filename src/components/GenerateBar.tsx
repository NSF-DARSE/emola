'use client';

import { useState } from 'react';

import Icon from '@/components/Icon';
import Infographic from '@/components/Infographic';
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
          <div className="flex items-center gap-2 mb-2">
            <span className="label">{AUDIENCE[activeKind]}</span>
            <span className="text-faint text-[11px]">·</span>
            <span className="text-[11px] text-faint">AI-drafted</span>
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
                {current.approvalState}
              </Badge>
            </span>
          </div>

          <Infographic data={payload as InfographicPayload} />

          <div className="card mt-2.5 px-3.5 py-3">
            {current.approvalState === 'draft' ? (
              <div className="space-y-2.5">
                <div className="text-[12px] text-muted">
                  Nothing here can be sent until a named person approves it.
                </div>
                <div className="flex items-center gap-2">
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
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn shrink-0"
                    disabled={busy !== null || !approver.trim()}
                    onClick={() => decide(activeKind, 'rejected')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : current.approvalState === 'approved' ? (
              <div className="text-[12px]" style={{ color: 'var(--sig-green)' }}>
                Approved by {current.approvedBy} on{' '}
                {new Date(current.approvedAt!).toLocaleString()} — cleared for distribution.
              </div>
            ) : (
              <div className="text-[12px]" style={{ color: 'var(--sig-red)' }}>
                Rejected by {current.approvedBy}. Only the original email can be forwarded.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
