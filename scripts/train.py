"""
Train the classifier and evaluate it honestly.

Logistic regression over Titan embeddings. Chosen over nearest-neighbour
because it produces calibrated probabilities, and the routing rule keys on
confidence - a confidence score that cannot be trusted is worse than none.

    python scripts/train.py
"""
import json
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.preprocessing import normalize

CATS = ['Maintenance','Security','Outage','Infrastructure','Compliance','Vendor','Application','Network']

def load(name):
    rows = json.loads(Path(f'data/model/{name}.json').read_text(encoding='utf8'))
    vecs = json.loads(Path(f'data/model/{name}.vectors.json').read_text(encoding='utf8'))
    rows = [r for r in rows if r['id'] in vecs]
    X = np.array([vecs[r['id']] for r in rows], dtype=np.float32)
    # L2-normalise: without it the vector's magnitude (which tracks length)
    # carries signal, and we spent real effort keeping length out of the label.
    X = normalize(X)
    return rows, X

train_rows, Xtr = load('train')
test_rows,  Xte = load('test')
ytr = np.array([r['category'] for r in train_rows])
yte = np.array([r['category'] for r in test_rows])

# Unanimous panel rows are cleaner signal than 2-of-3 rows.
w = np.array([1.0 if r['agreement'] == 'unanimous' else 0.6 for r in train_rows])

print(f'train {Xtr.shape[0]} x {Xtr.shape[1]}   test {Xte.shape[0]}')
print('train distribution:', dict(Counter(ytr).most_common()))
print('test  distribution:', dict(Counter(yte).most_common()))

clf = LogisticRegression(
    max_iter=3000,
    C=1.0,
    class_weight='balanced',   # do not let Maintenance dominate
)
clf.fit(Xtr, ytr, sample_weight=w)

pred = clf.predict(Xte)
proba = clf.predict_proba(Xte)

present = [c for c in CATS if c in set(yte) | set(pred)]

print('\n' + '='*62)
print('PER-CATEGORY on the 226 REAL notices')
print('='*62)
print(classification_report(yte, pred, labels=present, zero_division=0))

print('MACRO F1 (all categories weighted equally):', f'{f1_score(yte, pred, average="macro", zero_division=0):.3f}')
print('accuracy                                 :', f'{(pred == yte).mean():.3f}')
maj = Counter(yte).most_common(1)[0]
print(f'majority-class baseline                  : {maj[1]/len(yte):.3f}  (always "{maj[0]}")')

# A defensible-either-way answer should not be scored as wrong.
lenient = sum(1 for p, r in zip(pred, test_rows)
              if p in (r.get('acceptableCategories') or [r['category']]))
print(f'\naccepting any label the panel considered defensible: {lenient/len(test_rows):.3f}')

print('\nCONFUSION (rows = truth, cols = predicted)')
cm = confusion_matrix(yte, pred, labels=present)
print(' ' * 16 + ''.join(c[:7].rjust(8) for c in present))
for c, row in zip(present, cm):
    print(c[:15].ljust(16) + ''.join(str(v).rjust(8) for v in row))

# Confidence is what the routing rule keys on, so check it is meaningful.
conf = proba.max(axis=1)
correct = pred == yte
print('\nCALIBRATION')
for lo, hi in [(0,.5),(.5,.7),(.7,.9),(.9,1.01)]:
    m = (conf >= lo) & (conf < hi)
    if m.sum():
        print(f'  confidence {lo:.1f}-{hi:.1f}: {m.sum():3d} notices, {correct[m].mean():.0%} correct')

Path('data/model/predictions.json').write_text(json.dumps([
    {'id': r['id'], 'truth': r['category'], 'predicted': p, 'confidence': float(c),
     'acceptable': r.get('acceptableCategories') or [r['category']]}
    for r, p, c in zip(test_rows, pred, conf)], indent=2), encoding='utf8')
print('\npredictions -> data/model/predictions.json')
