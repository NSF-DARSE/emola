# Poster approaches, compared

Served by the running app at http://localhost:3000/review/<filename>

| File | What it is |
|---|---|
| `1-fully-generated-by-model.png` | Stability asked to produce the WHOLE poster. Read the text. |
| `7-nano-banana.png` | Gemini Nano Banana Pro, same job. Read the text. |
| `3-current-rendered-poster.png` | What the app produces today: rendered text, generated icons. |
| `4-icon-library.png` | The 17 generated icons on one sheet. |

## The finding

**#1 is unusable.** The headline reads roughly "Subilect: Maiteennce
misintencros 4 systems". Labels say "C STP" and "CD / CD C/D". Timeline numbers
are invented. There is a QR code leading nowhere and a logo of no organisation.
Diffusion models draw shapes that look like letters; they do not spell.

**#7 changes that.** Nano Banana Pro reproduced every time and every system name
exactly: 12:00 PM to 1:00 PM, 4:30 to 5:00, 8:00 PM to 5:00 AM, all matching the
source notice. Different architecture, and legible text is what it is good at.

**#3 is what ships today** and needs no image model at run time: text is
rendered from the notice JSON, so it cannot be wrong.

## If picking this up again

Nano Banana Pro is worth pursuing for full poster generation. Two things to
carry forward:

- Describe field ROLES, never write them as labels. A prompt containing
  "Headline:" printed the word "Headline:" onto the poster.
- Anonymise before sending regardless of which model. A better model is not a
  reason to relax that.
