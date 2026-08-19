# Classifier fine-tuning & deployment guide

How to fine-tune the Qwen 3.5 9B classifier, run inference, and wire it into
the Next.js app in place of the stub classifier. For the *why* behind these
choices, see [MODEL-NOTES.md](MODEL-NOTES.md).

## Overview

```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│  1. Prepare data  │ --> │  2. Fine-tune          │ --> │  3. Serve + connect  │
│  labelled JSON     │     │  Colab / Vertex GPU    │     │  FastAPI + Next.js   │
│  → train/eval JSONL │     │  → LoRA adapter        │     │                      │
└──────────────────┘     └───────────────────────┘     └──────────────────────┘
```

| Stage | Where it runs | Key file |
|-------|---------------|----------|
| 1. Data prep | Locally, in this repo | `scripts/prepare-finetune-data.py` |
| 2. Fine-tuning | Colab / GCP Vertex (GPU) | `notebooks/finetune-qwen-gcp.ipynb` |
| 3. Inference server | Any machine with a GPU | `scripts/serve-classifier.py` |
| 4. Frontend integration | Next.js app | `src/lib/classifier-model.ts` |

## 1. Prepare training data

Converts the multi-model-labelled JSON (`data/model/labels.json` +
`data/model/synthetic.labelled.json`) into chat-format JSONL:

```bash
python scripts/prepare-finetune-data.py
```

Produces `data/finetune/train.jsonl`, `eval.jsonl`, and `system_prompt.txt`.
Re-run this whenever the labelled data changes (e.g. after re-labelling more
of the gold set).

## 2. Fine-tune on a GPU

The training itself needs a GPU, which this dev environment doesn't have — run
it on Colab or a GCP Vertex AI Workbench instance with an L4/T4 GPU.

**What to upload:** just the three files from `data/finetune/`
(`train.jsonl`, `eval.jsonl`, `system_prompt.txt`). Everything else — base
model weights, Unsloth, dependencies — is fetched by the notebook itself.

```
notebooks/finetune-qwen-gcp.ipynb
```

Open it in Colab or Vertex Workbench, upload the three files into a `data/`
folder next to the notebook, and run all cells. Training takes roughly
15–25 minutes on an L4 (24 GB) or 30–45 minutes on a T4 (16 GB).

**Output:** a LoRA adapter folder (~100–200 MB) containing
`adapter_config.json`, `adapter_model.safetensors`, and tokenizer files.
Download this folder — it's small enough to move around easily, unlike the
full merged model (~18 GB).

> You do **not** need to download or produce a merged model. The adapter is
> combined with the base model automatically at serving time (see below).

## 3. Serve the model

Copy the LoRA adapter folder onto a machine with a GPU (can be the same
machine running the Next.js app, or a separate inference box). Then:

```bash
pip install unsloth fastapi uvicorn

python scripts/serve-classifier.py \
  --model-path path/to/lora-adapter \
  --base-model unsloth/Qwen3.5-9B \
  --port 8100
```

On first run this downloads the base Qwen 3.5 9B model (~18 GB, one-time),
loads your adapter on top, and merges them in memory
(`PeftModel.merge_and_unload()`). No merged checkpoint file is ever needed.

Endpoints exposed:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/classify` | POST `{ "body": "<email text>" }` | Classify one notification |
| `/batch` | POST `{ "bodies": ["...", "..."] }` | Classify several at once |
| `/health` | GET | Readiness check |

Verify it's up:

```bash
curl http://localhost:8100/health
curl -X POST http://localhost:8100/classify \
  -H "Content-Type: application/json" \
  -d '{"body": "DTI will be performing maintenance on the ERP Production Linux servers this Sunday from 0700 to 0900."}'
```

## 4. Connect to the Next.js frontend

The app's classification seam is `classify(body): ModelAssessment` in
`src/lib/classifier.ts` — a deterministic keyword-rule stub. The trained model
is wired in through a parallel module, `src/lib/classifier-model.ts`, which
calls the inference server over HTTP and falls back to the stub if the server
is unreachable.

### Point the app at your server

Set the server URL in `.env` (or `.env.local`):

```bash
CLASSIFIER_URL=http://localhost:8100
```

If unset, it defaults to `http://localhost:8100`.

### Swap the call site

`src/lib/db.ts` currently calls the stub synchronously during DB seeding:

```ts
import { classify, extract } from './classifier';
// ...
const model = classify(e.body);
```

To use the trained model, switch to the async version from
`classifier-model.ts`:

```ts
import { classifyWithModel, extract } from './classifier-model';
// ...
const model = await classifyWithModel(e.body);
```

Since `classifyWithModel` is async, the surrounding seed function (and its
caller) need to be `async` too — `db.ts`'s seed path currently runs inside a
synchronous `better-sqlite3` transaction, so introducing an async classifier
call there means either:

- Classifying all notices in a batch **before** the transaction starts (via
  `classifyBatch(bodies)`), then passing the results into the transaction, or
- Switching that one write path to run outside a `transaction()` wrapper.

The batch approach is usually simpler and faster (one HTTP round trip for all
notices instead of one per notice):

```ts
import { classifyBatch } from './classifier-model';

const bodies = events.map((e) => e.body);
const models = await classifyBatch(bodies);   // one call for everything
// then zip `models[i]` with `events[i]` inside the existing transaction
```

### Runtime behavior

- If `CLASSIFIER_URL` is unreachable or returns an error, `classifyWithModel`
  and `classifyBatch` **fall back to the stub classifier** automatically and
  log a warning — the app keeps working, just with lower-quality
  classification.
- The returned `engine` field tells you which path served the result:
  `qwen3.5-9b-lora-v1` for the real model, or `stub-rules-v0(fallback)` when
  it fell back. This is visible anywhere `ModelAssessment.engine` is
  surfaced in the UI.
- Use `isModelServerHealthy()` if you want to check server status before
  triggering a bulk classification run (e.g. show a banner in an admin view).

## 5. Evaluate

Once the server is running, check accuracy against the held-out eval set:

```bash
python scripts/eval-classifier.py --server-url http://localhost:8100
```

Reports category accuracy, status accuracy, per-category precision/recall,
and a confusion matrix.

## Retraining later

As reviewers correct the model's classifications in the app, those decisions
land in the precedent table. Periodically:

1. Fold newly-confirmed human decisions into `data/model/labels.json` (or a
   new labelled batch).
2. Re-run `scripts/prepare-finetune-data.py`.
3. Re-run the fine-tuning notebook with the refreshed `train.jsonl`.
4. Swap the adapter on the serving machine and restart
   `serve-classifier.py`.

No changes to `classifier-model.ts` or the Next.js app are needed — the
interface stays the same across model versions.
