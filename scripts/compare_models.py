"""
Would a fancier model actually help? Race them on the real test set.

Also plots a learning curve: if performance is still climbing as we add
training data, the bottleneck is DATA and a bigger model will not fix it.
"""
import json, warnings
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC, SVC
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import f1_score, recall_score
from sklearn.preprocessing import normalize
warnings.filterwarnings('ignore')

def load(name):
    rows = json.loads(Path(f'data/model/{name}.json').read_text(encoding='utf8'))
    vecs = json.loads(Path(f'data/model/{name}.vectors.json').read_text(encoding='utf8'))
    rows = [r for r in rows if r['id'] in vecs]
    X = normalize(np.array([vecs[r['id']] for r in rows], dtype=np.float32))
    y = np.array([r['category'] for r in rows])
    return rows, X, y

_, Xtr, ytr = load('train')
_, Xte, yte = load('test')

MODELS = {
    'LogisticRegression (current)': LogisticRegression(max_iter=3000, class_weight='balanced'),
    'Linear SVM':                   LinearSVC(class_weight='balanced', max_iter=5000),
    'RBF SVM':                      SVC(class_weight='balanced', probability=True),
    'Random Forest':                RandomForestClassifier(n_estimators=400, class_weight='balanced', random_state=0),
    'Gradient Boosting':            HistGradientBoostingClassifier(random_state=0),
    'k-Nearest Neighbours':         KNeighborsClassifier(n_neighbors=5),
    'Neural net (MLP 256)':         MLPClassifier(hidden_layer_sizes=(256,), max_iter=1200, random_state=0),
    'Neural net (MLP 512,256)':     MLPClassifier(hidden_layer_sizes=(512,256), max_iter=1200, random_state=0),
}

# Only categories with real examples can be scored.
present = sorted(set(yte))
print(f'{"model":<30}{"accuracy":>10}{"macroF1*":>10}{"Outage recall":>15}')
print('-' * 65)
rows_out = []
for name, m in MODELS.items():
    m.fit(Xtr, ytr)
    p = m.predict(Xte)
    acc = (p == yte).mean()
    f1 = f1_score(yte, p, labels=present, average='macro', zero_division=0)
    orec = recall_score(yte, p, labels=['Outage'], average='micro', zero_division=0)
    rows_out.append((name, acc, f1, orec))
    print(f'{name:<30}{acc:>10.3f}{f1:>10.3f}{orec:>15.2f}')

print('-' * 65)
print('* macro F1 over the 4 categories that actually occur in real data')
maj = max((list(yte).count(c), c) for c in present)
print(f'baseline (always "{maj[1]}"): {maj[0]/len(yte):.3f} accuracy, Outage recall 0.00')

best = max(rows_out, key=lambda r: (r[3], r[1]))
print(f'\nbest on Outage recall: {best[0]}')

# --- learning curve: is more data still helping? -------------------------
print('\n=== does MORE TRAINING DATA still help? ===')
rng = np.random.default_rng(0)
idx = rng.permutation(len(ytr))
for frac in [0.25, 0.5, 0.75, 1.0]:
    sub = idx[:int(len(idx) * frac)]
    m = LogisticRegression(max_iter=3000, class_weight='balanced').fit(Xtr[sub], ytr[sub])
    p = m.predict(Xte)
    print(f'  {int(frac*100):>3}% of training data ({len(sub):>3} rows): '
          f'accuracy {(p==yte).mean():.3f}   Outage recall {recall_score(yte,p,labels=["Outage"],average="micro",zero_division=0):.2f}')
