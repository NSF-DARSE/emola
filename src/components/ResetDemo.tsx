'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Icon from '@/components/Icon';

/**
 * Empties the demo so the pipeline can be watched from the start.
 *
 * Seeded precedents survive: they are reference rulings that predate the demo,
 * and wiping them would make the first review of every run look like the first
 * review that had ever happened.
 */
export default function ResetDemo() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setState('working');
    setError(null);
    const res = await fetch('/api/ingest', { method: 'DELETE' });
    if (!res.ok) {
      // Navigating away from a failed reset shows a full mailbox and looks
      // like the button did nothing, which is the worst of both.
      setError('Could not clear the mailbox. Nothing was changed.');
      setState('idle');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={reset} disabled={state === 'working'} className="btn">
        <Icon name="flask" size={15} />
        {state === 'working' ? 'Clearing…' : 'Clear and run the demo again'}
      </button>
      <span className="text-[12.5px] text-muted">
        Empties the mailbox so ingest can be watched from the start.
      </span>
      {error && (
        <span className="text-[12.5px] w-full" style={{ color: 'var(--sig-red)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
