"""
Inspect an Excel goldset WITHOUT printing its contents.

Prints structure (sheets, columns, row counts) and COUNTS of sensitive
patterns only. No cell values are echoed, so raw data never lands in a log
or a transcript.

    python scripts/inspect_goldset.py data/model/goldsetdataset.xlsx
"""

import re
import sys
from collections import Counter

import pandas as pd

DETECTORS = {
    "email address": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "IP address": re.compile(
        r"\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b"
    ),
    "host name": re.compile(
        r"\b[a-z]{2,6}-[a-z]{2,8}-(?:prd|prod|dev|tst|test|qa|stg)-\d{1,3}\b", re.I
    ),
    "phone number": re.compile(r"\b\d{3}-\d{3}-\d{4}\b"),
    "URL": re.compile(r"https?://\S+"),
    "person-like name": re.compile(r"\b(?:Mr|Mrs|Ms|Dr)\.?\s+[A-Z][a-z]+"),
}

path = sys.argv[1] if len(sys.argv) > 1 else "data/model/goldsetdataset.xlsx"
sheets = pd.read_excel(path, sheet_name=None, dtype=str)

print(f"file    {path}")
print(f"sheets  {len(sheets)}: {', '.join(sheets)}\n")

for name, df in sheets.items():
    print(f"=== sheet '{name}' — {len(df)} rows x {len(df.columns)} columns ===")
    for col in df.columns:
        series = df[col].dropna().astype(str)
        non_empty = (series.str.strip() != "").sum()
        lengths = series.str.len()
        avg = int(lengths.mean()) if len(lengths) else 0
        distinct = series.nunique()
        # A column with few distinct values is a label; many is free text.
        kind = "label-like" if distinct <= 25 else "free text" if avg > 60 else "identifier-like"
        print(
            f"  {str(col)[:38]:<40} {non_empty:>5} filled  "
            f"{distinct:>5} distinct  avg {avg:>5} chars   {kind}"
        )

    # Show the value SET only for label-like columns — those are categories,
    # not sensitive content, and we need them to map onto the taxonomy.
    print("\n  label-like column values:")
    for col in df.columns:
        series = df[col].dropna().astype(str)
        if series.nunique() <= 25 and series.nunique() > 0:
            counts = Counter(series)
            shown = ", ".join(f"{v!r}×{c}" for v, c in counts.most_common(25))
            print(f"    {col}: {shown}")

    print("\n  sensitive patterns found (counts only, no values):")
    blob = "\n".join(
        df[c].dropna().astype(str).str.cat(sep="\n") for c in df.columns
    )
    for label, rx in DETECTORS.items():
        hits = rx.findall(blob)
        print(f"    {label:<18} {len(hits):>5} mentions   {len(set(hits)):>4} distinct")
    print()
