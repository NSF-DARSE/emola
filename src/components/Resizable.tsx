'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A pane you can widen by dragging its edge, the way an editor sidebar works.
 *
 * The width is remembered, because a pane that snaps back to default on the
 * next notice is more annoying than one that never moved.
 *
 * The handle also answers to the arrow keys. A drag-only control cannot be
 * operated without a mouse, and this is a queue somebody may sit in for an
 * hour.
 */

const MIN = 380;
const MAX = 900;
const STEP = 40;

export default function Resizable({
  id,
  defaultWidth = 560,
  children,
}: {
  /** Distinct per pane, so two panes do not share one saved width. */
  id: string;
  defaultWidth?: number;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(`pane:${id}`));
    if (saved >= MIN && saved <= MAX) setWidth(saved);
  }, [id]);

  const store = useCallback(
    (w: number) => {
      try {
        window.localStorage.setItem(`pane:${id}`, String(w));
      } catch {
        /* a blocked localStorage should not break resizing */
      }
    },
    [id],
  );

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      // The pane is on the right, so its width grows as the pointer moves
      // left. Throttled to a frame: setting state on every pointer event
      // makes the drag feel heavy on a long list.
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const next = Math.min(MAX, Math.max(MIN, window.innerWidth - e.clientX));
        setWidth(next);
      });
    }

    function onUp() {
      setDragging(false);
      setWidth((w) => {
        store(w);
        return w;
      });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Without this the browser selects text across the page mid-drag.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [dragging, store]);

  function nudge(delta: number) {
    setWidth((w) => {
      const next = Math.min(MAX, Math.max(MIN, w + delta));
      store(next);
      return next;
    });
  }

  return (
    <div
      // The width travels as a custom property so it only takes effect at lg
      // and up. Below that the panel fills the pane and there is no edge to
      // drag, so a fixed pixel width would just make it too narrow.
      className="w-full lg:w-[var(--pane-w)] shrink-0 relative flex"
      style={{ '--pane-w': `${width}px` } as React.CSSProperties}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={width}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') nudge(STEP);
          if (e.key === 'ArrowRight') nudge(-STEP);
        }}
        onDoubleClick={() => {
          setWidth(defaultWidth);
          store(defaultWidth);
        }}
        className={`resize-handle hidden lg:block ${dragging ? 'resize-handle-active' : ''}`}
        title="Drag to resize, double-click to reset"
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
