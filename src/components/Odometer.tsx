'use client';

import { useEffect, useState } from 'react';

/**
 * A number whose digits roll like an odometer.
 *
 * Each digit is a vertical strip of 0-9 that slides to show the right one, so
 * a changing count reads as counting rather than as a value being replaced.
 * That matters while dragging a selection across the calendar: the figure is
 * updating continuously, and a number that simply swaps looks like a glitch
 * where a rolling one looks like a total climbing.
 *
 * Digits are laid out in a fixed-width strip so the surrounding text does not
 * shuffle sideways as the count crosses ten or a hundred.
 */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function Odometer({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  // Render nothing animated on the first paint: rolling up from zero on load
  // draws the eye to a number that has not actually changed.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const digits = Math.max(0, Math.round(value)).toString().split('');

  return (
    <span
      className={`odometer ${className}`}
      // Screen readers get the plain number; the strips are decorative.
      aria-label={String(value)}
      role="text"
    >
      {digits.map((d, i) => (
        <span key={`${digits.length}-${i}`} className="odometer-slot" aria-hidden="true">
          <span
            className="odometer-strip"
            style={{
              transform: `translateY(-${Number(d) * 10}%)`,
              transition: ready ? undefined : 'none',
            }}
          >
            {DIGITS.map((n) => (
              <span key={n} className="odometer-digit">
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
