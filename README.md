# Abnormal Event Notification Pipeline — prototype

Prototype for the State of Delaware Department of Finance. Ingests abnormal-event
notification emails (maintenance, outages, security), classifies and routes them,
and drafts employee- and leadership-facing communications behind a human approval
gate.

The UI is an ops console: an icon rail, a dense event table, and a detail panel
that slides in on the right so you never lose your place in the list. Selecting
an event gives you two buttons — **Generate infographic** and **Generate
summary**. Pipeline detail (routing reasons, engine read, redaction scan) is
collapsed at the bottom of the panel, out of the way until you want it.

### Design rules

Light and dark, defaulting to system preference. Two rules make the theme work
and both are enforced by `npm run audit:ui`:

1. **No hardcoded colours outside `globals.css`.** Every colour resolves to a CSS
   custom property, so nothing gets stranded in one theme.
2. **No emoji.** Icons are inline SVG (`src/components/Icon.tsx`) — emoji render
   differently per platform and read as decoration.

Colour is **signal only**. The chrome is greyscale; the only hues in the app are
severity (left bar on each row) and review state (dot on the right). Category is
a colourless uppercase mono label, so a red bar in a grey table is unmissable.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # time-normalisation tests
```

The SQLite store is created and seeded from `data/events.json` on first request.
Delete `data/pipeline.db` to reset.

## What's real and what's a placeholder

**Real:** routing logic, the blind-first review flow, the precedent store, time
normalisation (including cross-midnight windows), the regex redaction scan, both
artifact templates, the approval gate, and the evaluation harness.

**Placeholder:** classification, field extraction, and precedent similarity run on
deterministic rules so the pipeline demos end to end with nothing to host. They
sit behind stable function signatures — see [docs/MODEL-NOTES.md](docs/MODEL-NOTES.md)
for the seams and the open questions.

## Layout

```
data/events.json           30 real notices + 4 clearly-labelled synthetic ones
data/precedents.seed.json  Seeded rulings on the ambiguous cases
src/lib/time.ts            Time normalisation      (tests in tests/time.test.ts)
src/lib/redaction.ts       IP / hostname / unknown-term scan
src/lib/classifier.ts      PLACEHOLDER classify() + extract()
src/lib/routing.ts         Stage 3 routing + the approval guard
src/lib/precedents.ts      PLACEHOLDER similarity
src/lib/artifacts.ts       Infographic + exec summary payloads
src/lib/metrics.ts         Holdout agreement + override rate
src/lib/mail.ts            Sender / subject / snippet derivation for the list view
src/app/page.tsx           Mailbox
src/app/mail/[id]/         Reading view + the two generate buttons
src/app/review/            Blind-first review queue
src/app/api/               Decision + artifact endpoints
scripts/inspect.cjs        Dev helper: dump pipeline state from the DB
```

## Rules that hold regardless of which model goes in

1. Auto-send forwards the **original, unmodified** email. Nothing generated is
   ever auto-sent.
2. Review is **blind-first** — the API withholds the model's assessment,
   redaction flags and precedents until the reviewer's own decision is stored.
3. Only **human** decisions enter the precedent table.
4. A written reason is **required** before a decision is accepted.
5. Regenerating an artifact **resets** it to draft.

## Data caveat

The real sample has no Security or Compliance notices. The four `SYN-*` records
were written to exercise those paths and the redaction scan; they are labelled
synthetic in the UI and excluded from every accuracy number.
