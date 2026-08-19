'use client';

import { useEffect } from 'react';

import Icon from '@/components/Icon';

/**
 * What a reader sees when a page throws.
 *
 * The default is a blank frame that says an error occurred, which tells nobody
 * anything — including whoever has to fix it. This shows the message and the
 * digest, because "server error" is not a bug report and the digest is what
 * ties a screenshot to a line in the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also to the browser console, so it survives a screenshot of the page.
    console.error('Page failed:', error);
  }, [error]);

  return (
    <div className="flex-1 grid place-items-center p-8">
      <div className="max-w-[52ch] flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span style={{ color: 'var(--sig-red)' }}>
            <Icon name="alert" size={18} />
          </span>
          <h1 className="text-[17px] font-semibold">This page did not load</h1>
        </div>

        <p className="text-[13.5px] text-muted leading-relaxed">
          Something failed on the server while building this page. The rest of the app is
          unaffected — the other sections should still work.
        </p>

        {/* The actual message. Shown rather than hidden: this is an internal
            tool, and the person looking at it is the person who can fix it. */}
        <div className="card px-4 py-3 flex flex-col gap-2">
          <div className="label">What went wrong</div>
          <code className="text-[12.5px] font-mono text-fg break-words whitespace-pre-wrap">
            {error.message || 'No message was attached to the error.'}
          </code>
          {error.digest && (
            <div className="text-[11.5px] text-faint font-mono">
              digest {error.digest} — find this in the server log
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <a href="/" className="btn">
            Back to notices
          </a>
        </div>
      </div>
    </div>
  );
}
