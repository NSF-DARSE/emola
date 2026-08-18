"""
Pick the model HONESTLY: cross-validate within the training data only, then
evaluate the single winner on the real test set exactly once.

Choosing a winner by its test score means the test score is no longer an
independent estimate - you have partly fitted the test set by selection.
"""
import json, warnings
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC, SVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, recall_score, f1_score
from sklearn.preprocessing import normalize
warnings.filterwarnings('ignore')

def load(n):
    rows = json.loads(Path(f'data/model/{n}.json').read_text(encoding='utf8'))
    vecs = json.loads(Path(f'data/model/{n}.vectors.json').read_text(encoding='utf8'))
    rows = [r for r in rows if r['id'] in vecs]
    X = normalize(np.array([vecs[r['id']] for r in rows], dtype=np.float32))
    return rows, X, np.array([r['category'] for r in rows])

tr, Xtr, ytr = load('train')
te, Xte, yte = load('test')

CANDIDATES = {
    'LogisticRegression': LogisticRegression(max_iter=3000, class_weight='balanced'),
    'Linear SVM':         LinearSVC(class_weight='balanced', max_iter=5000),
    'RBF SVM':            SVC(class_weight='balanced', probability=True),
    'Random Forest':      RandomForestClassifier(n_estimators=400, class_weight='balanced', random_state=0),
    'kNN':                KNeighborsClassifier(n_neighbors=5),
    'MLP 256':            MLPClassifier(hidden_layer_sizes=(256,), max_iter=1200, random_state=0),
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
print('5-fold cross-validation, TRAINING DATA ONLY (macro F1 over all 8 categories)')
print('-' * 58)
scores = {}
for name, m in CANDIDATES.items():
    s = cross_val_score(m, Xtr, ytr, cv=cv, scoring='f1_macro')
    scores[name] = s.mean()
    print(f'  {name:<20} {s.mean():.3f}  +/- {s.std():.3f}')

winner = max(scores, key=scores.get)
print('-' * 58)
print(f'WINNER (chosen without ever seeing the test set): {winner}')

model = CANDIDATES[winner].fit(Xtr, ytr)
pred = model.predict(Xte)
present = sorted(set(yte) | set(pred))

print(f'\n=== {winner} on the 226 real notices - evaluated ONCE ===')
print(classification_report(yte, pred, labels=present, zero_division=0))
print(f'accuracy                {(pred==yte).mean():.3f}')
print(f'baseline (all Maintenance) {max(np.mean(yte==c) for c in set(yte)):.3f}')
print(f'Outage recall           {recall_score(yte,pred,labels=["Outage"],average="micro",zero_division=0):.2f}')

lenient = sum(1 for p, r in zip(pred, te) if p in (r.get('acceptableCategories') or [r['category']]))
print(f'accepting any defensible label: {lenient/len(te):.3f}')

import pickle
Path('data/model').mkdir(exist_ok=True)
with open('data/model/classifier.pkl','wb') as f:
    pickle.dump({'model': model, 'name': winner, 'classes': list(model.classes_)}, f)
print(f'\nsaved -> data/model/classifier.pkl')
