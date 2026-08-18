"""
Stage 1 triage dataset: is this email even an abnormal event?

Built from the Outlook export, which carries REAL human category tags - the
first genuine ground truth in this project. Subject lines only; there are no
bodies in this export.

Anonymises sender addresses and any embedded ticket/person detail before
anything is written out.

    python scripts/build_triage.py
"""
import json
import re
from pathlib import Path

import pandas as pd

SRC = Path('data/model/Additional Data Hackathon 2026.xlsx')
df = pd.read_excel(SRC, dtype=str).fillna('')

values, seen, counters = {}, {}, {}

def token(kind, match):
    key = f'{kind}:{match.lower()}'
    if key in seen:
        return seen[key]
    counters[kind] = counters.get(kind, 0) + 1
    tok = f'[{kind}_{counters[kind]}]'
    seen[key] = tok
    values[tok] = match
    return tok


# The Received column arrives in three shapes in the same export: ISO
# datetimes, Outlook's abbreviated "Fri 8/1" (no year), and raw Excel serial
# numbers. Guessing with a single parser produced year-0001 dates, so each
# shape is handled explicitly and anything unrecognised is left blank rather
# than turned into a plausible lie.
EXCEL_EPOCH = pd.Timestamp('1899-12-30')
CORPUS_YEAR = 2026


def parse_received(raw: str) -> str:
    raw = str(raw).strip()
    if not raw:
        return ''

    # Excel serial number.
    if re.fullmatch(r'\d{5}(\.\d+)?', raw):
        return (EXCEL_EPOCH + pd.Timedelta(days=float(raw))).strftime('%Y-%m-%dT%H:%M:%S')

    # "Fri 8/1" or "Fri 8/1 9:14 AM" - weekday prefix, no year.
    m = re.match(r'^[A-Za-z]{3}\s+(\d{1,2})/(\d{1,2})(?:\s+(.*))?$', raw)
    if m:
        month, day, rest = int(m.group(1)), int(m.group(2)), (m.group(3) or '').strip()
        stamp = pd.to_datetime(f'{CORPUS_YEAR}-{month:02d}-{day:02d} {rest}'.strip(),
                               errors='coerce')
        return '' if pd.isna(stamp) else stamp.strftime('%Y-%m-%dT%H:%M:%S')

    # A bare time with no date. Outlook shows these for "today", but we have no
    # idea which day that was, and pandas silently stamps them with the day the
    # script happens to run. Leave blank rather than invent one.
    if re.fullmatch(r'\d{1,2}:\d{2}(:\d{2})?(\s*[APap][Mm])?', raw):
        return ''

    stamp = pd.to_datetime(raw, errors='coerce')
    return '' if pd.isna(stamp) else stamp.strftime('%Y-%m-%dT%H:%M:%S')


EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
# Sender display names are people; the From column is a closed set.
senders = {s.strip() for s in df['From'] if s.strip() and ' ' in s.strip() and '@' not in s}
NAME = re.compile('|'.join(re.escape(s) for s in senders), re.I) if senders else None

def scrub(text: str) -> str:
    out = str(text)
    if NAME:
        out = NAME.sub(lambda m: token('PERSON', m.group(0)), out)
    out = EMAIL.sub(lambda m: token('EMAIL', m.group(0)), out)
    return out

rows = []
for i, r in df.iterrows():
    subject = str(r['Subject']).strip()
    cat = str(r['Categories']).strip().upper()
    if not subject or not cat:
        continue
    received = parse_received(r.get('Received', ''))
    rows.append({
        'id': f'TR-{len(rows)+1:04d}',
        'subject': scrub(subject),
        'sender': scrub(str(r['From']).strip()),
        'received_at': received,
        'category': cat,
        # The only question stage 1 has to answer.
        'is_abnormal_event': cat == 'ABNORMAL EVENT',
    })

# Seatbelt.
blob = json.dumps(rows)
assert not EMAIL.search(blob), 'an email address survived'
if NAME:
    assert not NAME.search(blob), 'a sender name survived'

Path('data/model/triage.json').write_text(json.dumps(rows, indent=2), encoding='utf8')
Path('data/model/triage.mapping.json').write_text(json.dumps(values, indent=2), encoding='utf8')

from collections import Counter
print(f'{len(rows)} rows -> data/model/triage.json')
print(f'anonymised: {counters}')
print('\ncategories:')
for k, v in Counter(r['category'] for r in rows).most_common():
    print(f'  {k:<24} {v}')
dated = sorted(r['received_at'] for r in rows if r['received_at'])
print()
print(f'dated {len(dated)}/{len(rows)}   {dated[0][:10]} -> {dated[-1][:10]}')

ae = sum(r['is_abnormal_event'] for r in rows)
print(f'\nabnormal events: {ae} / {len(rows)}  ({ae/len(rows)*100:.1f}%)')
print(f'baseline for "always say NOT abnormal": {(1-ae/len(rows))*100:.1f}%')
