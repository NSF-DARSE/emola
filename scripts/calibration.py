"""
Is the confidence threshold defensible?

The routing rule holds anything below CONFIDENCE_HIGH for a human. That is only
a meaningful rule if the model's confidence tracks how often it is actually
right. Measured on the 226 real notices.

    python scripts/calibration.py
"""
import json
from pathlib import Path

rows = json.loads(Path('data/model/predictions.json').read_text(encoding='utf8'))

print(f'{len(rows)} real notices\n')
print('confidence band     n   correct   would auto-send')
print('-' * 52)
bands = [(0.0, 0.5), (0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.01)]
for lo, hi in bands:
    band = [r for r in rows if lo <= r['confidence'] < hi]
    if not band:
        continue
    ok = sum(1 for r in band if r['predicted'] in r['acceptable'])
    print(f'  {lo:.1f} - {hi:.1f}     {len(band):4d}    {ok/len(band):6.1%}          '
          f'{"yes" if lo >= 0.8 else "no"}')

print()
for t in [0.60, 0.70, 0.75, 0.80, 0.85, 0.90]:
    above = [r for r in rows if r['confidence'] >= t]
    if not above:
        continue
    wrong = [r for r in above if r['predicted'] not in r['acceptable']]
    missed = [r for r in above if r['truth'] == 'Outage' and r['predicted'] != 'Outage']
    print(f'threshold {t:.2f}: {len(above)/len(rows):5.1%} would auto-send, '
          f'{len(wrong)} misclassified among them, {len(missed)} missed outages')

print('\nAn "misclassified auto-send" here means the CATEGORY was wrong. It does')
print('not mean a wrong email was sent: auto-send forwards the original text,')
print('so the cost is a mis-filed notice, not a false statement to staff.')
