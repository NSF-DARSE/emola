"""
The deployed model must produce a CONFIDENCE the routing rule can trust, not
just a label. LinearSVC won on macro F1 but has no probabilities, so compare it
against the calibrated alternatives before committing.

    python scripts/pick_final.py
"""
import json, warnings
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.preprocessing import normalize
warnings.filterwarnings('ignore')

def load(n):
    rows = json.loads(Path(f'data/model/{n}.json').read_text(encoding='utf8'))
    vecs = json.loads(Path(f'data/model/{n}.vectors.json').read_text(encoding='utf8'))
    rows = [r for r in rows if r['id'] in vecs]
    X = normalize(np.array([vecs[r['id']] for r in rows], dtype=np.float32))
    return rows, X, np.array([r['category'] for r in rows])

tr, Xtr, ytr = load('train')

CAND = {
    'LinearSVC (no probabilities)': LinearSVC(class_weight='balanced', max_iter=5000),
    'LinearSVC + calibration':      CalibratedClassifierCV(LinearSVC(class_weight='balanced', max_iter=5000), cv=3),
    'LogisticRegression':           LogisticRegression(max_iter=3000, class_weight='balanced'),
}
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
print('5-fold CV on TRAINING DATA ONLY - macro F1')
print('-'*52)
for name, m in CAND.items():
    s = cross_val_score(m, Xtr, ytr, cv=cv, scoring='f1_macro')
    print(f'  {name:<30} {s.mean():.3f} +/- {s.std():.3f}')
