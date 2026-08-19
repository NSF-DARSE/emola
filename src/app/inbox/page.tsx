import Link from 'next/link';

import Tabs from '@/components/Tabs';
import Odometer from '@/components/Odometer';
import { Dot, Empty, Note } from '@/components/ui';
import { listNotifications } from '@/lib/db';
import { inboxStats, listInbox } from '@/lib/inbox';
import { shortDate } from '@/lib/mail';

export const dynamic = 'force-dynamic';

type Filter = 'all' | 'abnormal' | 'routine' | 'disagree';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'abnormal', label: 'Abnormal' },
  { key: 'routine', label: 'Routine' },
  { key: 'disagree', label: 'Filter disagrees' },
];

function href(p: { filter?: string; tag?: string; selected?: string }): string {
  const q = new URLSearchParams();
  if (p.filter && p.filter !== 'all') q.set('filter', p.filter);
  if (p.tag) q.set('tag', p.tag);
  if (p.selected) q.set('selected', p.selected);
  const s = q.toString();
  return s ? `/inbox?${s}` : '/inbox';
}

export default function InboxPage({
  searchParams,
}: {
  searchParams: { filter?: string; tag?: string; selected?: string };
}) {
  const all = listInbox();
  const stats = inboxStats();
  const filter = (['abnormal', 'routine', 'disagree'] as const).find((f) => f === searchParams.filter) ?? 'all';
  const tag = searchParams.tag;

  let rows = all;
  if (filter === 'abnormal') rows = rows.filter((r) => r.taggedAbnormal);
  if (filter === 'routine') rows = rows.filter((r) => !r.taggedAbnormal);
  if (filter === 'disagree') rows = rows.filter((r) => r.disagrees);
  if (tag) rows = rows.filter((r) => r.mailboxTag === tag);

  const selected = searchParams.selected
    ? (all.find((r) => r.id === searchParams.selected) ?? null)
    : null;

  const counts: Record<Filter, number> = {
    all: all.length,
    abnormal: stats.abnormal,
    routine: stats.routine,
    disagree: all.filter((r) => r.disagrees).length,
  };

  const perWeek = stats.span ? (stats.abnormal / (stats.span.days / 7)).toFixed(1) : '—';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Tabs counts={{ inbox: all.length, abnormal: listNotifications().length }} />
      <div className="flex-1 flex min-h-0 flex-col">

      {/* The headline: what stage 1 is actually up against. */}
      <div className="shrink-0 border-b border-border px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Summary value={String(stats.total)} label="emails arrived" sub={
          stats.span ? `${stats.span.from} to ${stats.span.to}` : 'dates unavailable'
        } />
        <Summary value={String(stats.abnormal)} label="were abnormal events" sub={`about ${perWeek} a week`} />
        <Summary
          value={`${stats.found}/${stats.abnormal}`}
          label="found by the subject filter"
          sub={stats.falseAlarms === 0 ? 'no false alarms' : `${stats.falseAlarms} false alarms`}
          signal={stats.missed === 0 && stats.falseAlarms === 0 ? 'green' : 'amber'}
        />
        <p className="text-[13px] text-muted max-w-[38ch] leading-relaxed">
          Abnormal events are {((stats.abnormal / stats.total) * 100).toFixed(1)}% of this mailbox.
          Everything else is handled by another process and is never relayed.
        </p>
      </div>

      {/* filters */}
      <div className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 sm:px-6 overflow-x-auto">
        <div className="seg shrink-0">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ filter: f.key, tag })}
              className={`seg-item ${filter === f.key ? 'seg-item-active' : ''}`}
            >
              {f.label}
              <span className="ml-2 text-[12px] opacity-60">{counts[f.key]}</span>
            </Link>
          ))}
        </div>

        <span className="w-px h-4 bg-border shrink-0" />

        <div className="flex items-center gap-1 shrink-0">
          {stats.tags.slice(0, 8).map((t) => {
            const active = tag === t.tag;
            return (
              <Link
                key={t.tag}
                href={href({ filter, tag: active ? undefined : t.tag })}
                className={`px-2.5 py-1 rounded-md text-[13px] whitespace-nowrap transition-colors ${
                  active ? 'bg-selected text-fg font-medium' : 'text-muted hover:bg-hover hover:text-fg'
                }`}
                title={`${t.n} emails tagged ${t.tag}`}
              >
                {titleCase(t.tag)}
                <span className="ml-1.5 text-[12px] opacity-55 tabular-nums">{t.n}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.map((r, i) => (
          <Link
            key={r.id}
            href={href({ filter, tag, selected: selected?.id === r.id ? undefined : r.id })}
            className={`trow anim-rise ${r.taggedAbnormal ? 'trow-flagged' : ''} ${
              selected?.id === r.id ? 'trow-selected' : ''
            }`}
            style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
          >
            <span
              className="trow-bar"
              style={{ background: r.taggedAbnormal ? 'var(--sig-amber)' : 'transparent' }}
            />
            <span className="flex-1 min-w-0 flex items-baseline gap-2.5">
              <span
                className={`text-[14px] truncate ${
                  r.taggedAbnormal ? 'font-semibold text-fg' : 'font-normal text-muted'
                }`}
              >
                {r.subject}
              </span>
            </span>

            {r.disagrees && (
              <span className="badge shrink-0" title="The subject filter and the mailbox tag disagree">
                Disagrees
              </span>
            )}

            <span className="hidden md:flex shrink-0 w-[168px] items-center gap-2">
              <Dot signal={r.triage.abnormal ? 'amber' : 'green'} />
              <span className="text-[12.5px] text-faint truncate" title={r.triage.reason}>
                {RULE_LABEL[r.triage.rule]}
              </span>
            </span>

            <span className="hidden sm:block shrink-0 text-[12.5px] text-faint w-[126px] truncate">
              {titleCase(r.mailboxTag)}
            </span>
            <span className="hidden sm:block shrink-0 text-[13px] text-faint w-[74px] text-right">
              {r.receivedAt ? shortDate(r.receivedAt) : '—'}
            </span>
          </Link>
        ))}
        {rows.length === 0 && <Empty>Nothing matches those filters.</Empty>}
      </div>

      {selected && (
        <aside className="shrink-0 border-t border-border bg-surface px-4 sm:px-6 py-5 flex flex-col gap-4 anim-rise">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <div className="label">Subject</div>
              <div className="text-[14.5px] text-fg font-medium break-words">{selected.subject}</div>
            </div>
            <Link href={href({ filter, tag })} className="btn shrink-0">
              Close
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Detail label="From" value={selected.sender || '—'} />
            <Detail label="Received" value={selected.receivedAt ? selected.receivedAt.replace('T', ' ') : 'not recorded'} />
            <Detail label="Mailbox tag" value={titleCase(selected.mailboxTag)} />
            <Detail
              label="Stage 1 verdict"
              value={selected.taggedAbnormal ? 'Abnormal event' : 'Routine'}
            />
          </div>

          {/* The point of this panel: the rule is explainable, so show the
              reasoning rather than only the verdict. */}
          <div className="flex flex-col gap-1">
            <div className="label">Why</div>
            <div className="text-[13.5px] text-muted leading-relaxed">{selected.triage.reason}</div>
          </div>

          {selected.disagrees && (
            <Note tone="amber" icon="warning">
              <div>
                <strong>The filter and the mailbox tag disagree here.</strong> Rows like this one
                are where the rule needs a second look.
              </div>
            </Note>
          )}

          <p className="text-[12.5px] text-faint">
            The mailbox export carries subject lines only — there is no message body to show. Full
            text exists for the notices under Abnormal events.
          </p>
        </aside>
      )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="label">{label}</div>
      <div className="text-[13.5px] text-fg truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

const RULE_LABEL: Record<string, string> = {
  notification: 'DTI notification',
  outage_announcement: 'Announces an outage',
  incident_ticket: 'Incident ticket',
  no_match: 'Routine',
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

function Summary({
  value,
  label,
  sub,
  signal,
}: {
  value: string;
  label: string;
  sub: string;
  signal?: 'green' | 'amber';
}) {
  return (
    <div className="shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-semibold tabular-nums tracking-[-0.02em]">
          {/^\d+$/.test(value) ? <Odometer value={Number(value)} /> : value}
        </span>
        {signal && <Dot signal={signal} />}
      </div>
      <div className="text-[13px] text-fg mt-0.5">{label}</div>
      <div className="text-[12px] text-faint">{sub}</div>
    </div>
  );
}
