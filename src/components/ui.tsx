import type { ReactNode } from 'react';

import Icon, { type IconName } from '@/components/Icon';
import { SIGNAL_VAR, type Signal } from '@/lib/severity';
import type { Category, Status } from '@/lib/taxonomy';

/**
 * The category, spelled out. It stays colourless — colour is reserved for
 * severity and review state — but abbreviations like "MAINT" are jargon, and
 * this is read by people who do not live in the tool.
 */
export function CategoryLabel({ value }: { value: Category }) {
  return <span className="cat">{value}</span>;
}

export function Badge({
  signal = 'neutral',
  children,
}: {
  signal?: Signal;
  children: ReactNode;
}) {
  const cls = signal === 'neutral' ? 'badge' : `badge badge-${signal}`;
  return <span className={cls}>{children}</span>;
}

export function Dot({ signal, size = 7 }: { signal: Signal; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: SIGNAL_VAR[signal] }}
    />
  );
}

const STATUS_SIGNAL: Record<Status, Signal> = {
  scheduled: 'blue',
  active: 'red',
  updated: 'amber',
  resolved: 'green',
};

export function StatusBadge({ value }: { value: Status }) {
  return (
    <Badge signal={STATUS_SIGNAL[value]}>
      <Dot signal={STATUS_SIGNAL[value]} size={6} />
      {value}
    </Badge>
  );
}

export function Note({
  tone = 'default',
  icon,
  children,
}: {
  tone?: 'default' | 'red' | 'amber' | 'blue';
  icon: IconName;
  children: ReactNode;
}) {
  const toneClass = tone === 'default' ? '' : ` note-${tone}`;
  const color =
    tone === 'default' ? 'var(--faint)' : SIGNAL_VAR[tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : 'blue'];
  return (
    <div className={`note${toneClass}`}>
      <span className="shrink-0 mt-px" style={{ color }}>
        <Icon name={icon} size={15} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Standard content page (everything that is not the events console). */
export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 sm:px-8 py-7 max-w-[940px]">
      <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-fg">{title}</h1>
      {description && <p className="mt-1.5 text-[13px] text-muted max-w-[72ch]">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{title}</h2>
      {hint && <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2 items-start text-[12.5px] border-b border-border last:border-0">
      <div className="w-[132px] shrink-0 text-faint">{label}</div>
      <div className="min-w-0 flex-1 text-fg">{children}</div>
    </div>
  );
}

export function Meter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const signal: Signal = value >= 0.8 ? 'green' : value >= 0.55 ? 'amber' : 'red';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-[56px] h-[3px] rounded-full bg-border overflow-hidden inline-block">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: SIGNAL_VAR[signal] }}
        />
      </span>
      <span className="text-[11px] tabular-nums font-mono text-muted">{pct}%</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-[13px] text-faint">{children}</div>;
}
