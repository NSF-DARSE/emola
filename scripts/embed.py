"""
Embed train and test notices with Amazon Titan.

An embedding turns each notice into 1024 numbers positioned so that similar
meanings land near each other. The classifier then draws boundaries in that
space. Vectors are cached to disk so re-running costs nothing.

    python scripts/embed.py
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

env = {}
for line in Path('.env').read_text(encoding='utf8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()

KEY = env['AWS_BEARER_TOKEN_BEDROCK']
REGION = env.get('AWS_REGION', 'us-west-2')
MODEL = 'amazon.titan-embed-text-v2:0'
URL = f'https://bedrock-runtime.{REGION}.amazonaws.com/model/{MODEL}/invoke'


def embed(text: str, attempt: int = 1):
    payload = json.dumps({'inputText': text[:8000]}).encode()
    req = urllib.request.Request(
        URL, data=payload,
        headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())['embedding']
    except Exception as e:
        if 'expired' in str(e).lower():
            print('\nSTOPPING: Bedrock key expired. Put a fresh one in .env.')
            sys.exit(1)
        if attempt < 4:
            time.sleep(0.5 * 2 ** attempt)
            return embed(text, attempt + 1)
        raise


for name in ['train', 'test']:
    rows = json.loads(Path(f'data/model/{name}.json').read_text(encoding='utf8'))
    out = Path(f'data/model/{name}.vectors.json')
    cache = json.loads(out.read_text(encoding='utf8')) if out.exists() else {}

    todo = [r for r in rows if r['id'] not in cache]
    print(f'{name}: {len(rows)} rows, {len(todo)} to embed')

    for i, r in enumerate(todo, 1):
        cache[r['id']] = embed(r['body'])
        if i % 50 == 0 or i == len(todo):
            out.write_text(json.dumps(cache), encoding='utf8')
            print(f'  {i}/{len(todo)}')

    out.write_text(json.dumps(cache), encoding='utf8')
    dims = len(next(iter(cache.values()))) if cache else 0
    print(f'  saved {len(cache)} vectors, {dims} dimensions each\n')
