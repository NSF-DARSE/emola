"""
Inference server for the fine-tuned Qwen 3.5 9B notification classifier.

Serves the trained LoRA adapter (or merged model) as a REST API that the
Next.js app calls via fetch. Drops in behind the same interface as the stub
classifier.

Endpoints:
    POST /classify   — classify a single notification body
    POST /batch      — classify multiple bodies in one call
    GET  /health     — readiness check

Requirements:
    pip install unsloth fastapi uvicorn

Usage:
    python scripts/serve-classifier.py [OPTIONS]

    Options:
      --model-path    Path to the LoRA adapter or merged model
                      (default: models/qwen-classifier/lora-adapter)
      --base-model    Base model ID, needed if loading an adapter
                      (default: unsloth/Qwen3.5-9B)
      --port          Port to serve on (default: 8100)
      --host          Host to bind to (default: 0.0.0.0)
      --max-seq-len   Max sequence length (default: 2048)
      --load-merged   If set, load model-path as a fully merged model (no base needed)
"""

import argparse
import json
import time
import traceback
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ─── CLI args ────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--model-path", default="models/qwen-classifier/lora-adapter")
parser.add_argument("--base-model", default="unsloth/Qwen3.5-9B")
parser.add_argument("--port", type=int, default=8100)
parser.add_argument("--host", default="0.0.0.0")
parser.add_argument("--max-seq-len", type=int, default=2048)
parser.add_argument("--load-merged", action="store_true")
args = parser.parse_args()

# ─── Constants ───────────────────────────────────────────────────────────────

CATEGORIES = [
    "Maintenance", "Security", "Outage", "Infrastructure",
    "Compliance", "Vendor", "Application", "Network",
]
STATUSES = ["scheduled", "active", "updated", "resolved"]

ENGINE_ID = "qwen3.5-9b-lora-v1"

# Load system prompt from the training data (ensures consistency)
ROOT = Path(__file__).resolve().parent.parent
SYSTEM_PROMPT_PATH = ROOT / "data" / "finetune" / "system_prompt.txt"
SYSTEM_PROMPT = SYSTEM_PROMPT_PATH.read_text().strip() if SYSTEM_PROMPT_PATH.exists() else ""

# ─── Load model ──────────────────────────────────────────────────────────────

print(f"Loading model from {args.model_path}...")
model_path = Path(args.model_path)
if not model_path.is_absolute():
    model_path = ROOT / model_path

from unsloth import FastModel
from unsloth.chat_templates import get_chat_template

if args.load_merged:
    model, tokenizer = FastModel.from_pretrained(
        model_name=str(model_path),
        max_seq_length=args.max_seq_len,
        load_in_4bit=True,
    )
else:
    # Load base + adapter
    model, tokenizer = FastModel.from_pretrained(
        model_name=args.base_model,
        max_seq_length=args.max_seq_len,
        load_in_4bit=True,
    )
    # Load the fine-tuned adapter on top
    from peft import PeftModel
    model = PeftModel.from_pretrained(model, str(model_path))
    model = model.merge_and_unload()  # Merge for faster inference

tokenizer = get_chat_template(tokenizer, chat_template="qwen-3")
model.eval()
print("Model loaded and ready.")

# ─── FastAPI app ─────────────────────────────────────────────────────────────

app = FastAPI(title="Emola Classifier", version="1.0.0")


class ClassifyRequest(BaseModel):
    body: str = Field(..., description="The notification email body text")


class ClassifyResponse(BaseModel):
    primary: str
    secondary: list[str] = []
    status: str
    confidence: float
    reasoning: str
    engine: str = ENGINE_ID


class BatchRequest(BaseModel):
    bodies: list[str]


class BatchResponse(BaseModel):
    results: list[ClassifyResponse]
    elapsed_ms: float


def run_inference(body: str) -> ClassifyResponse:
    """Run the model on a single notification body and parse the JSON output."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": body.strip()},
    ]

    input_text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(input_text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,
            temperature=0.1,
            top_p=0.9,
            do_sample=True,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.eos_token_id,
        )

    # Decode only the generated tokens (skip the prompt)
    generated = outputs[0][inputs["input_ids"].shape[1]:]
    response_text = tokenizer.decode(generated, skip_special_tokens=True).strip()

    # Parse the JSON response
    parsed = parse_classification(response_text)
    return parsed


def parse_classification(text: str) -> ClassifyResponse:
    """Parse model output into a ClassifyResponse, with fallback handling."""
    # Try to extract JSON from the response
    json_str = text
    if "{" in text:
        start = text.index("{")
        end = text.rindex("}") + 1
        json_str = text[start:end]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        # Model produced malformed output — return a low-confidence fallback
        return ClassifyResponse(
            primary="Maintenance",
            secondary=[],
            status="scheduled",
            confidence=0.1,
            reasoning=f"Model output could not be parsed: {text[:100]}",
            engine=ENGINE_ID,
        )

    # Validate and sanitize
    primary = data.get("primary", "Maintenance")
    if primary not in CATEGORIES:
        primary = "Maintenance"

    secondary = [s for s in data.get("secondary", []) if s in CATEGORIES and s != primary][:3]

    status = data.get("status", "scheduled")
    if status not in STATUSES:
        status = "scheduled"

    confidence = data.get("confidence", 0.5)
    if not isinstance(confidence, (int, float)):
        confidence = 0.5
    confidence = max(0.05, min(0.97, round(float(confidence), 2)))

    reasoning = str(data.get("reasoning", ""))[:200]

    return ClassifyResponse(
        primary=primary,
        secondary=secondary,
        status=status,
        confidence=confidence,
        reasoning=reasoning,
        engine=ENGINE_ID,
    )


@app.get("/health")
def health():
    return {"status": "ok", "engine": ENGINE_ID, "model": args.base_model}


@app.post("/classify", response_model=ClassifyResponse)
def classify_endpoint(req: ClassifyRequest):
    try:
        return run_inference(req.body)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/batch", response_model=BatchResponse)
def batch_endpoint(req: BatchRequest):
    t0 = time.time()
    results = []
    for body in req.bodies:
        try:
            results.append(run_inference(body))
        except Exception as e:
            results.append(ClassifyResponse(
                primary="Maintenance",
                secondary=[],
                status="scheduled",
                confidence=0.1,
                reasoning=f"Inference error: {str(e)[:80]}",
                engine=ENGINE_ID,
            ))
    elapsed = (time.time() - t0) * 1000
    return BatchResponse(results=results, elapsed_ms=round(elapsed, 1))


# ─── Run ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\nServing on http://{args.host}:{args.port}")
    print(f"  POST /classify  — single notification")
    print(f"  POST /batch     — multiple notifications")
    print(f"  GET  /health    — readiness check\n")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
