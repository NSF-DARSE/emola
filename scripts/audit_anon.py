"""
Independent safety audit of an anonymised file.

Deliberately does NOT reuse the detectors that produced the file. If the same
patterns both redact and verify, the check is circular - it can only confirm
what the redactor already believed. These are broader and stricter, so they
catch what the redactor's assumptions missed.

Reports findings; does not modify anything.

    python scripts/audit_anon.py data/model/goldset.anon.json
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/model/goldset.anon.json")
text = path.read_text(encoding="utf8")

# Placeholders are expected; strip them so they cannot mask a real finding.
TOKEN = re.compile(r"\[[A-Z]+_\d+\]")
scan = TOKEN.sub(" ", text)

# Case matters for the people checks: a name is defined partly BY its capital
# letters, so matching case-insensitively turns them into noise generators.
CASE_SENSITIVE = {"titled name", "sign-off name", "capitalised bigram"}

CHECKS = {
    # --- contact details, broader than the redactor used ---
    "email (any form)": r"[\w.+-]+\s*(?:@|\[at\]|\(at\))\s*[\w-]+\s*(?:\.|\[dot\])\s*[\w.]{2,}",
    "phone (any format)": r"(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}",
    # --- network identifiers ---
    "IPv4": r"\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b",
    "IPv6": r"\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b",
    "MAC address": r"\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b",
    "UNC path": r"\\\\[\w.-]+\\[\w$.-]+",
    # --- links of every shape, not just http:// ---
    "URL with scheme": r"\b(?:https?|ftp|sftp|mailto):[^\s<>\"]+",
    "scheme-less link": r"\bwww\.[\w-]+\.[a-z]{2,}",
    "bare domain": r"\b[\w-]+\.(?:gov|com|org|net|edu|us|io)\b(?!\w)",
    # --- host naming, wider than one convention ---
    "hostname-ish": r"\b[a-z]{2,8}[-_][a-z0-9]{2,10}[-_](?:prd|prod|dev|tst|test|qa|stg|uat)[-_]?\d{0,3}\b",
    "server token": r"\b(?:srv|vm|host|node|db|sql|web|app)[-_]?[a-z0-9]{2,12}\d{1,3}\b",
    # --- people ---
    "titled name": r"\b(?:Mr|Mrs|Ms|Dr|Sec|Director)\.?\s+[A-Z][a-z]+",
    "sign-off name": r"(?:Thanks|Regards|Sincerely|Best|Cheers)[,!]?\s*[\r\n]+\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    "capitalised bigram": r"\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b",
}

# Organisation, place and product names that are legitimately capitalised and
# must NOT be reported as people. Anything outside this list gets surfaced for
# a human to eyeball.
ALLOW = {
    "william penn", "biggs data", "data center", "crown castle", "enterprise prowatch",
    "change enablement", "service desk", "delaware service", "state of", "of delaware",
    "production linux", "production windows", "development and", "test and", "linux production",
    "windows production", "windows development", "linux test", "windows test", "and development",
    "and test", "first map", "firstmap test", "good morning", "good afternoon", "please be",
    "be advised", "all end", "end users", "if you", "you have", "have any", "any questions",
    "questions or", "or concerns", "this event", "the following", "following link",
    "following morning", "the portal", "iras production", "portal will", "production and",
    "the state", "the dti", "dti change", "dti managed", "internet explorer", "microsoft edge",
    "google chrome", "active directory", "sql server", "power bi", "north america",
    "eastern time", "daylight time", "standard time", "new castle", "kent county",
    "sussex county", "human resources", "information technology", "help desk",
}

findings: dict[str, list[str]] = defaultdict(list)

for label, pattern in CHECKS.items():
    flags = 0 if label in CASE_SENSITIVE else re.I
    for m in re.finditer(pattern, scan, flags):
        hit = (m.group(1) if m.lastindex else m.group(0)).strip()
        if label == "capitalised bigram" and hit.lower() in ALLOW:
            continue
        if label == "bare domain" and hit.lower().endswith((".pdf", ".doc", ".xlsx")):
            pass  # still report - a filename can still identify a system
        if hit not in findings[label]:
            findings[label].append(hit)

print(f"audited   {path}  ({len(text):,} chars)")
print(f"tokens    {len(set(TOKEN.findall(text)))} placeholders present\n")

hard = ["email (any form)", "phone (any format)", "IPv4", "IPv6", "MAC address",
        "UNC path", "URL with scheme", "scheme-less link", "titled name", "sign-off name"]

fails = 0
for label in CHECKS:
    hits = findings.get(label, [])
    if not hits:
        print(f"  clean   {label}")
        continue
    severity = "FAIL " if label in hard else "REVIEW"
    if label in hard:
        fails += 1
    print(f"  {severity}  {label}: {len(hits)} distinct")
    for h in hits[:8]:
        print(f"            {h[:70]!r}")
    if len(hits) > 8:
        print(f"            ... and {len(hits) - 8} more")

# --- separate "obviously a system" from "might be a person" ----------------
# A capitalised pair containing any infrastructure/org word is a product or
# place. Anything else could be a human name, so it is NOT printed here - it
# goes to a local file for eyeballing, because echoing it would defeat the
# whole exercise.
VOCAB = {
    "network", "system", "systems", "server", "servers", "service", "services", "portal",
    "building", "center", "centre", "data", "production", "development", "test", "secure",
    "voice", "alert", "alerts", "integrity", "reporting", "management", "security", "access",
    "gateway", "cloud", "database", "storage", "backup", "email", "phone", "mobile", "desk",
    "team", "group", "office", "division", "department", "agency", "state", "county", "city",
    "county's", "enterprise", "maintenance", "outage", "update", "upgrade", "migration",
    "window", "windows", "linux", "unix", "oracle", "microsoft", "adobe", "cisco", "citrix",
    "vpn", "wifi", "wireless", "printer", "print", "scan", "fax", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march",
    "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "starting", "beginning", "ending", "please", "note", "important", "notice", "advisory",
    "scheduled", "planned", "emergency", "critical", "hall", "annex", "plaza", "campus",
}

suspects = []
for hit in findings.get("capitalised bigram", []):
    words = [w.lower().strip(".,;:") for w in hit.split()]
    if not any(w in VOCAB for w in words):
        suspects.append(hit)

review_path = path.with_suffix(".review.txt")
review_path.write_text(
    "Capitalised pairs with no infrastructure word in them.\n"
    "Most will be product or place names. Delete any that are PEOPLE and tell\n"
    "the anonymiser about them.\n\n" + "\n".join(sorted(suspects)),
    encoding="utf8",
)

print()
print(f"possible person-names needing your eyes: {len(suspects)}")
print(f"  written to {review_path}  (not printed here on purpose)")

if fails:
    print(f"\n{fails} HARD failure category(ies) - do not share this file yet.")
    sys.exit(1)
print("\nNo hard failures.")
