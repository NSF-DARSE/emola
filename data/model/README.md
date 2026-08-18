# Datasets

## Files you use

| File | Rows | Purpose |
|---|---|---|
| `train.json` | 458 | **Training set.** Synthetic notices, balanced across all 8 categories. |
| `test.json` | 226 | **Test set.** Real DOF notices. Never train on these. |

## How the labels were made

Both sets are labelled by the **same three-model panel** — Claude Opus 4.6,
Llama 4 Maverick, Nova Pro — voting independently. Using one labelling function
for both sets is deliberate: training on "what we asked the generator for" while
testing on "what the panel says" would measure the gap between two definitions
of truth rather than the classifier.

`train.json` keeps `requested` and `onTarget` so you can audit where a generator
drifted from its brief (78.8% stayed on target; Vendor and Network are weakest).

`test.json` carries `acceptableCategories`. Some notices are genuinely
dual-natured — a VPN failure is defensibly Outage *or* Network — so scoring
should accept any label in that set rather than marking a reasonable answer
wrong.

## Numbers that matter

- **Baseline: 88.9%.** Always guessing "Maintenance" scores that on the test
  set. Overall accuracy is therefore meaningless; report **per-category
  precision and recall**.
- The test set has **only 2 Security and 1 Application** notices. Nothing
  reliable can be concluded about those categories from real data.
- **Infrastructure, Compliance, Vendor and Network never appear as primary in
  the real corpus.** They can be trained but not validated against real mail.
- Synthetic notices are deliberately **length-neutral**: a length-only
  classifier scores 15.4% against a 12.5% chance baseline (it was 21.9% before
  the fix), so the model cannot use character count as a shortcut.

## Not done yet

No human labels exist. Until a person labels a random sample and we compute
Cohen's kappa, every number here is models agreeing with models.

## Provenance

`goldsetdataset.xlsx` (raw, gitignored) -> anonymised locally -> independently
audited with stricter patterns than the redactor used -> `goldset.anon.json`.
Names, emails, URLs and phone numbers are tokenised; the mapping stays local.
