# Open model questions — for the follow-up session

Nothing in this document is decided. It's the list of things we deferred, written
down so we don't re-derive them next time.

## Where the seams are

Three functions stand in for model work. Everything else in the app reads their
output, not their internals, so swapping any one of them is a local change.

| Seam | File | Signature today |
|---|---|---|
| Classification (category + status + confidence) | `src/lib/classifier.ts` | `classify(body: string): ModelAssessment` |
| Field extraction | `src/lib/classifier.ts` | `extract(body, receivedAt): ExtractedFields` |
| Precedent similarity | `src/lib/precedents.ts` | `similarity(a, b): number` / `findSimilar(query, precedents, limit)` |

Drafting (infographic + exec summary copy) is a fourth seam, currently
deterministic string assembly in `src/lib/artifacts.ts`. The templates are fixed
by design — whatever drafts the copy fills slots, it does not choose layout.

The `precedents` table already has an `embedding BLOB` column reserved.

## Questions to settle

**Classifier**
- Fine-tuned transformer vs. embeddings + gradient-boosted classifier vs. an
  LLM call per notice. The brief leans toward the simpler option for
  explainability to judges; worth confirming that still holds.
- 30 real notices is small for supervised training and 28 of them are
  Maintenance or Outage. Do we have access to more of the DTI archive, or do we
  treat the labelled set as an eval set only and ship rules + LLM?
- Two axes means two heads or two models. Status looks nearly rule-solvable from
  tense cues; category is the harder one.

**Embeddings**
- Local `all-MiniLM-L6-v2` (no egress, ~90MB, CPU fine at this volume) vs. a
  hosted embedding endpoint. Volume here is tiny — dozens of notices a month —
  so this is a hosting/compliance call, not a performance one.

**Drafting**
- If an LLM drafts the copy: which model, and does the State's data-handling
  posture allow notice text to leave the network at all? That may decide the
  whole architecture more than any accuracy number.

**Hosting**
- On-prem / State cloud vs. a vendor API. The redaction scan exists partly
  because notices carry internal host detail — worth deciding whether that
  content is ever allowed to leave, since it changes what we can use.
- If self-hosted: what's actually available for GPU, and does a CPU-only
  deployment meet the latency bar? At this volume it almost certainly does.

**Evaluation**
- Current holdout is 10 of 30 notices, chosen by hand for spread. Once there's
  more data, move to stratified k-fold.
- Override rate is the metric that matters most in production, and it only
  becomes meaningful once reviewers have worked real volume through the queue.

## Things that should not change when the model does

- Auto-send forwards the original email only.
- Blind-first review: the API withholds model output until a decision is stored.
- Only human rulings enter the precedent table.
- A written reason is required before a decision is accepted.
- Regenerating an artifact resets it to draft.
