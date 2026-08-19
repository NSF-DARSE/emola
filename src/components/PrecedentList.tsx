import Link from 'next/link';

import { Badge, CategoryLabel, Empty, Note, Panel, StatusBadge } from '@/components/ui';
import { listPrecedents } from '@/lib/db';

/**
 * Past human rulings.
 *
 * Lives inside Reports rather than on its own route: it is something a
 * reviewer consults, not somewhere they work, and a whole navigation entry for
 * one read-only table was more prominence than that deserves.
 */
export default function PrecedentList() {
  const rows = listPrecedents();
  const seeded = rows.filter((r) => r.seeded).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Panel
        title="Precedents"
        description="Rulings by named reviewers, surfaced as reference context when a similar case comes up again. Repeat cases get faster because this table grows — not because the engine is trusted more."
      >
        <Note tone="blue" icon="shield">
          <strong>Human decisions only.</strong> The engine&apos;s guess, confidence and reasoning
          are deliberately not stored here — otherwise the system would end up learning from itself.
        </Note>

        <div className="mt-4 font-mono text-[11px] text-faint">
          {rows.length} rulings · {seeded} seeded · {rows.length - seeded} from this session
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="card px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <CategoryLabel value={p.humanPrimary} />
                <StatusBadge value={p.humanStatus} />
                <Badge signal={p.decision === 'approve' ? 'green' : 'red'}>{p.decision}</Badge>
                {p.seeded && <span className="label opacity-60">SEEDED</span>}
                {p.notificationId && (
                  <Link
                    href={`/?selected=${p.notificationId}`}
                    className="font-mono text-[11px] text-muted hover:text-fg underline underline-offset-2"
                  >
                    {p.notificationId}
                  </Link>
                )}
                <span className="ml-auto text-[11px] text-faint">{p.reviewer}</span>
              </div>
              <div className="mt-2 text-[11.5px] text-faint italic line-clamp-2">
                “{p.phrase}”
              </div>
              <div className="mt-1.5 text-[12.5px] text-fg">{p.reason}</div>
            </div>
          ))}
          {rows.length === 0 && <Empty>No precedents yet.</Empty>}
        </div>
      </Panel>
    </div>
  );
}
