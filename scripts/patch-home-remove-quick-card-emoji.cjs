// Latest MOA frontend source is unpacked from the release ZIP at build time.
// Remove only decorative test-tube/shopping-bag emoji from the two home quick cards.
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '../moa-web/src/components/MoaWidgets.tsx');
let source = fs.readFileSync(file, 'utf8');
const edits = [
  ['          <span className="text-[18px]">🧪</span>\n', ''],
  ['          <span className="text-[18px]">🛍️</span>\n', ''],
  [
    '<p className="text-[13.5px] font-bold text-slate-900 mt-1">금융 실험실</p>',
    '<p className="text-[13.5px] font-bold text-slate-900">금융 실험실</p>',
  ],
  [
    '<p className="text-[13.5px] font-bold text-slate-900 mt-1">소비 결정 보관함</p>',
    '<p className="text-[13.5px] font-bold text-slate-900">소비 결정 보관함</p>',
  ],
];
for (const [before, after] of edits) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) throw new Error('Expected exactly one quick-card element, got ' + matches + ': ' + before);
  source = source.replace(before, after);
}
if (!source.includes('금융 실험실') || !source.includes('소비 결정 보관함')) {
  throw new Error('Existing labels are missing');
}
fs.writeFileSync(file, source);
console.log('Home quick cards: decorative emoji removed; original labels and routes preserved.');
