/**
 * Inline SVG icon set. No icon dependency, no emoji anywhere in the UI —
 * emoji render differently per platform and read as decoration in a console
 * whose whole point is that visual noise means something.
 *
 * All icons inherit currentColor and default to a 16px box.
 */

export type IconName =
  | 'events'
  | 'queue'
  | 'precedents'
  | 'metrics'
  | 'workflow'
  | 'sun'
  | 'moon'
  | 'alert'
  | 'warning'
  | 'info'
  | 'check'
  | 'eyeOff'
  | 'flask'
  | 'thread'
  | 'chevronRight'
  | 'chevronDown'
  | 'close'
  | 'arrowLeft'
  | 'sparkle'
  | 'shield';

const PATHS: Record<IconName, React.ReactNode> = {
  events: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M2.5 7.5h15M7 7.5v9" />
    </>
  ),
  queue: (
    <>
      <path d="M3 5.5h14M3 10h14M3 14.5h9" />
    </>
  ),
  precedents: (
    <>
      <path d="M4 3.5h9a2 2 0 0 1 2 2v11a1.5 1.5 0 0 0-1.5-1.5H4z" />
      <path d="M4 3.5A1.5 1.5 0 0 0 2.5 5v11A1.5 1.5 0 0 1 4 14.5" />
    </>
  ),
  metrics: (
    <>
      <path d="M3 16.5V9M8 16.5V4M13 16.5v-5M17.5 16.5H2.5" />
    </>
  ),
  workflow: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5v4.5l3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M16 4l-1.4 1.4M5.4 14.6 4 16M16 16l-1.4-1.4M5.4 5.4 4 4" />
    </>
  ),
  moon: <path d="M16.5 11.6A7 7 0 0 1 8.4 3.5a7 7 0 1 0 8.1 8.1z" />,
  alert: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.5M10 13.5v.01" />
    </>
  ),
  warning: (
    <>
      <path d="M10 3 2.5 16.5h15L10 3z" />
      <path d="M10 8v3.5M10 14v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9.5V14M10 6.5v.01" />
    </>
  ),
  check: <path d="m4 10.5 4 4 8-9" />,
  eyeOff: (
    <>
      <path d="M8.2 5.2A7.6 7.6 0 0 1 10 5c4.5 0 7.5 5 7.5 5a13 13 0 0 1-2.2 2.8M5.6 6.4A13 13 0 0 0 2.5 10s3 5 7.5 5c1 0 2-.2 2.8-.6" />
      <path d="M2.5 2.5l15 15" />
    </>
  ),
  flask: (
    <>
      <path d="M8 2.5v5L3.5 15a1.5 1.5 0 0 0 1.3 2.5h10.4A1.5 1.5 0 0 0 16.5 15L12 7.5v-5" />
      <path d="M7 2.5h6M6 12h8" />
    </>
  ),
  thread: (
    <>
      <circle cx="5.5" cy="5" r="2" />
      <circle cx="5.5" cy="15" r="2" />
      <path d="M5.5 7v6M7.5 15h5a2 2 0 0 0 2-2V7" />
      <path d="M12 4.5 14.5 7 17 4.5" />
    </>
  ),
  chevronRight: <path d="m7.5 4 6 6-6 6" />,
  chevronDown: <path d="m4 7.5 6 6 6-6" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  arrowLeft: <path d="M16 10H4m0 0 5-5m-5 5 5 5" />,
  sparkle: (
    <>
      <path d="M10 2.5 11.8 8 17.5 10 11.8 12 10 17.5 8.2 12 2.5 10 8.2 8z" />
    </>
  ),
  shield: (
    <>
      <path d="M10 2.5 3.5 5v5c0 4 2.8 6.7 6.5 7.5 3.7-.8 6.5-3.5 6.5-7.5V5z" />
    </>
  ),
};

export default function Icon({
  name,
  size = 16,
  className = '',
  strokeWidth = 1.5,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
