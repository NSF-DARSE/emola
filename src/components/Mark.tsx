/**
 * The mark, defined once.
 *
 * Pure SVG with no CSS custom properties, because it has to render in two very
 * different places: the DOM, and satori's rasteriser for the PNG poster.
 * Satori has no cascade to read tokens from, so anything themed would silently
 * come out black there. One shape, one file, both surfaces.
 *
 * The form is a lens — the same object the product uses for its empty state —
 * with a specular highlight at upper-left and a shadowed lower edge.
 */

export function Mark({ size = 28, on = 'dark' }: { size?: number; on?: 'light' | 'dark' }) {
  // `on` is the ground the mark sits on, not the mark's own colour. Naming it
  // the other way round produced a dark sphere on a dark header, which
  // disappeared entirely.
  const body = on === 'dark' ? ['#e8eaef', '#9aa0ad'] : ['#9aa0ad', '#3f434c'];
  const id = on === 'dark' ? 'markOnDark' : 'markOnLight';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Emergent"
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={body[0]} />
          <stop offset="100%" stopColor={body[1]} />
        </linearGradient>
        <radialGradient id={`${id}-spec`} cx="0.34" cy="0.28" r="0.42">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-rim`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="82%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.45" />
        </radialGradient>
      </defs>

      <circle cx="32" cy="32" r="30" fill={`url(#${id}-body)`} />
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-spec)`} />
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-rim)`} />
    </svg>
  );
}

export default Mark;
