"""
Anonymise the Excel goldset locally.

Extends the regex detectors with the two things the generic text tool cannot
catch on its own:

  * PERSON  - real staff names. General name detection is unreliable, but here
              the Sender column gives us a bounded, known list, so we replace
              those exact strings everywhere (including sign-offs inside the
              body text). Reliable because it is a closed set, not a guess.
  * URL     - links can carry tenant ids, tokens and internal host names in the
              path, so they are tokenised whole.

Writes:
  data/model/goldset.anon.json     safe copy, this is what gets used
  data/model/goldset.mapping.json  token -> real value, KEEP LOCAL

    python scripts/anonymize_goldset.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "data/model/goldsetdataset.xlsx")
OUT = Path("data/model/goldset.anon.json")
MAP = Path("data/model/goldset.mapping.json")

DETECTORS = [
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("URL", re.compile(r"https?://\S+")),
    (
        "IP",
        re.compile(
            r"\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}"
            r"(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b"
        ),
    ),
    ("HOST", re.compile(r"\b[a-z]{2,6}-[a-z]{2,8}-(?:prd|prod|dev|tst|test|qa|stg)-\d{1,3}\b", re.I)),
    ("PHONE", re.compile(r"\b\d{3}-\d{3}-\d{4}\b")),
]

sheets = pd.read_excel(SRC, sheet_name=None, dtype=str)

# ---- collect the closed set of staff names from the Sender columns ---------
names = set()
for df in sheets.values():
    col = next((c for c in df.columns if c.strip().lower() == "sender"), None)
    if col is None:
        continue
    for v in df[col].dropna().astype(str):
        v = v.strip()
        # Ignore junk cells like '   ' or 't'
        if len(v) > 3 and " " in v:
            names.add(v)

# Longest first so "Ebony Edwards" is replaced before a bare "Ebony" could be.
name_list = sorted(names, key=len, reverse=True)
NAME_RX = (
    re.compile("|".join(re.escape(n) for n in name_list), re.I) if name_list else None
)

values: dict[str, str] = {}
seen: dict[str, str] = {}
counters: dict[str, int] = {}


def token_for(kind: str, match: str) -> str:
    key = f"{kind}:{match.lower()}"
    if key in seen:
        return seen[key]
    counters[kind] = counters.get(kind, 0) + 1
    tok = f"[{kind}_{counters[kind]}]"
    seen[key] = tok
    values[tok] = match
    return tok


def scrub(text: str) -> str:
    if not isinstance(text, str):
        return text
    out = text
    # Names first: an address like j.minners@... should lose the name too, and
    # the EMAIL pass below will tokenise whatever remains of it.
    if NAME_RX:
        out = NAME_RX.sub(lambda m: token_for("PERSON", m.group(0)), out)
    for kind, rx in DETECTORS:
        out = rx.sub(lambda m, k=kind: token_for(k, m.group(0)), out)
    return out


records = []
seen_bodies: set[str] = set()
skipped_empty = 0
skipped_dupe = 0

for sheet, df in sheets.items():
    cols = {c.strip().lower(): c for c in df.columns}
    c_date, c_info, c_send = cols.get("date"), cols.get("info"), cols.get("sender")

    for i, row in df.iterrows():
        body = str(row.get(c_info, "") or "").strip()
        if not body or body.lower() == "nan":
            skipped_empty += 1
            continue

        key = re.sub(r"\s+", " ", body).lower()
        if key in seen_bodies:
            skipped_dupe += 1
            continue
        seen_bodies.add(key)

        # Dates arrive as Excel datetimes, plain strings, or blanks. Coerce to
        # YYYY-MM-DD and leave genuinely missing ones empty rather than
        # letting the string "nan" through as if it were a date.
        raw_date = str(row.get(c_date, "") or "").strip()
        parsed = pd.to_datetime(raw_date, errors="coerce")
        received = "" if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")

        records.append(
            {
                "id": f"GS-{len(records) + 1:04d}",
                "sheet": sheet,
                "received_at": received,
                "sender": scrub(str(row.get(c_send, "") or "").strip()),
                "body": scrub(body),
            }
        )

# ---- seatbelt: nothing sensitive may survive into the safe copy -----------
blob = json.dumps(records)
problems = []
if NAME_RX and NAME_RX.search(blob):
    problems.append("a staff name")
for kind, rx in DETECTORS:
    if rx.search(blob):
        problems.append(kind)
if problems:
    print(f"ABORTED - these survived: {', '.join(problems)}. Nothing written.")
    sys.exit(2)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(records, indent=2), encoding="utf8")
MAP.write_text(json.dumps(values, indent=2), encoding="utf8")

print(f"source        {SRC}")
print(f"rows kept     {len(records)}")
print(f"  skipped     {skipped_empty} empty, {skipped_dupe} duplicate")
print("\nreplaced (counts only):")
for kind in ["PERSON", "EMAIL", "URL", "IP", "HOST", "PHONE"]:
    n = counters.get(kind, 0)
    if n:
        print(f"  {kind:<8} {n:>4} distinct values")

dates = sorted(r["received_at"] for r in records if r["received_at"])
undated = sum(1 for r in records if not r["received_at"])
if dates:
    print(f"\ndate range    {dates[0]}  ->  {dates[-1]}   ({undated} undated)")

by_year: dict[str, int] = {}
for d in dates:
    by_year[d[:4]] = by_year.get(d[:4], 0) + 1
print("by year       " + ", ".join(f"{y}: {n}" for y, n in sorted(by_year.items())))
print(f"\nSAFE          {OUT}")
print(f"KEEP LOCAL    {MAP}")
