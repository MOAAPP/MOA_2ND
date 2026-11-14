// The deployed moa-web app is stored as a source ZIP in releases/.
// Apply precise onboarding copy changes after extracting it during Vercel build.
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../moa-web/src/pages/Onboarding.tsx');
let content = fs.readFileSync(source, 'utf8');
const changes = [
  ['생활비 통장을<br />알려주세요', '주거래은행을<br />알려주세요'],
  ['>쓰는 은행</p>', '>주거래은행</p>'],
];
for (const [from, to] of changes) {
  const occurrences = content.split(from).length - 1;
  if (occurrences === 1) {
    content = content.replace(from, to);
  } else if (!content.includes(to)) {
    throw new Error('Expected onboarding copy not found exactly once: ' + from);
  }
}
fs.writeFileSync(source, content);
if (!content.includes('주거래은행을<br />알려주세요') || !content.includes('>주거래은행</p>')) {
  throw new Error('Primary-bank onboarding copy verification failed');
}
console.log('Verified: step 4 heading and bank selector now say 주거래은행');
