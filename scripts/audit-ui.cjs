// Verifies the two hard constraints of the redesign:
//   1. no emoji anywhere in src/
//   2. no hardcoded hex colours outside the token definitions in globals.css
const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'src');
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2B50}\u{2705}\u{26A0}]/u;
const HEX = /#[0-9a-fA-F]{3,8}\b/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// → and ← are legitimate typography in schedule ranges and back links.
const ALLOWED_ARROWS = /[→←↓↑]/u;

let emojiHits = 0;
let hexHits = 0;

for (const file of walk(ROOT)) {
  const rel = path.relative(process.cwd(), file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, i) => {
    const stripped = line.replace(new RegExp(ALLOWED_ARROWS, 'gu'), '');
    if (EMOJI.test(stripped)) {
      emojiHits++;
      console.log(`EMOJI  ${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
    }
    // globals.css is where the tokens are defined; everywhere else must use them.
    if (!rel.endsWith('globals.css') && HEX.test(line)) {
      hexHits++;
      console.log(`HEX    ${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
    }
  });
}

console.log(`\nemoji found: ${emojiHits}`);
console.log(`hardcoded hex outside globals.css: ${hexHits}`);
process.exit(emojiHits === 0 && hexHits === 0 ? 0 : 1);
