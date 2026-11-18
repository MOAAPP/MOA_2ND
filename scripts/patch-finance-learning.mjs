// Apply only financial-learning additions after the team's existing ZIP patches.
// Source snapshots stay in releases/; existing layouts and finance adapters remain.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const root = process.cwd();
const patches = JSON.parse(readFileSync(resolve(root, 'integration/finance-learning/patches.json'), 'utf8'));
for (const [file, changes] of Object.entries(patches)) {
  const target = resolve(root, 'moa-web/src', file);
  let text = readFileSync(target, 'utf8').replaceAll('\r\n', '\n');
  for (const { before, after } of changes) {
    if (text.includes(after)) continue;
    if (!before || text.split(before).length !== 2) throw new Error('[financial learning] anchor changed: '+file);
    text = text.replace(before, after);
  }
  writeFileSync(target, text);
}
for (const file of ['components/PersonalizedLearning.tsx','components/PersonalizedLearning.css','lib/persistentLearning.ts','lib/market.ts','pages/CardNews.tsx']) {
  const target=resolve(root,'moa-web/src',file);
  mkdirSync(dirname(target),{recursive:true});
  copyFileSync(resolve(root,'integration/finance-learning',file),target);
}
console.log('[financial learning] personalized quizzes and cardnews connected');
