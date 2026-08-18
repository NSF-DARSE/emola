"""
Choose the auto-send confidence gate WITHOUT looking at the test set.

Reading the threshold off the 226 real notices would fit the gate to the only
independent data we have, and the number would then mean nothing. So: derive it
from cross-validated predictions on the training data, and only afterwards look
at what it does on the real corpus - once, as a check, not as a search.

    python scripts/pick_threshold.py
"""
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import normalize


def load(n):
    rows = json.loads(Path(f'data/model/{n}.json').read_text(encoding='utf8'))
    vecs = json.loads(Path(f'data/model/{n}.vectors.json').read_text(encoding='utf8'))
    rows = [r for r in rows if r['id'] in vecs]
    X = normalize(np.array([vecs[r['id']] for r in rows], dtype=np.float32))
    return rows, X, np.array([r['category'] for r in rows])


tr, Xtr, ytr = load('train')
clf = LogisticRegression(max_iter=3000, C=1.0, class_weight='balanced')
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)

proba = cross_val_predict(clf, Xtr, ytr, cv=cv, method='predict_proba')
classes = np.unique(ytr)
pred = classes[proba.argmax(axis=1)]
conf = proba.max(axis=1)
correct = pred == ytr

print(f'{len(ytr)} training notices, cross-validated (never predicted by a model')
print('that had seen them)\n')
print('threshold   share above   accuracy above   errors above')
print('-' * 56)
chosen = None
for t in [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]:
    m = conf >= t
    if m.sum() == 0:
        continue
    acc = correct[m].mean()
    errs = int((~correct[m]).sum())
    print(f'   {t:.2f}       {m.mean():6.1%}          {acc:6.1%}          {errs:3d}')
    # The gate exists to keep misrouted notices out of the auto-send lane.
    # 99% is the bar; take the LOWEST threshold that clears it, because a
    # needlessly high gate just buries reviewers in routine mail.
    if acc >= 0.99 and chosen is None:
        chosen = t

print('-' * 56)
print(f'\nLowest threshold reaching 99% accuracy on held-out training data: {chosen}')

# --- now, and only now, look at the real corpus -----------------------------
rows = json.loads(Path('data/model/predictions.json').read_text(encoding='utf8'))
above = [r for r in rows if r['confidence'] >= chosen]
wrong = [r for r in above if r['predicted'] not in r['acceptable']]
outages_missed = [r for r in above if r['truth'] == 'Outage' and r['predicted'] != 'Outage']
print(f'\nApplied once to the 226 real notices:')
print(f'  {len(above)}/{len(rows)} ({len(above)/len(rows):.1%}) clear the confidence gate')
print(f'  {len(wrong)} of those are misclassified')
print(f'  {len(outages_missed)} outages would slip through as something else')
