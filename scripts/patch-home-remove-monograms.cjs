// MOA frontend is extracted from releases/*.zip before building.
// Remove only the decorative M and Y monograms shown in the user screenshots.
const fs = require('node:fs');
const path = require('node:path');

const filename = path.resolve(__dirname, '../moa-web/src/screens/Home.jsx');
let source = fs.readFileSync(filename, 'utf8');
const removals = [
  {
    name: 'M account initial',
    markup: [
      '<div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-teal-400 flex items-center justify-center text-white text-[11px] font-black shadow-[0_2px_6px_rgba(37,99,235,0.25)]">',
      'M',
      '</div>',
      '',
    ].join('\n'),
  },
  {
    name: 'Y briefing initial',
    markup: [
      '<div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-[12px] shrink-0 shadow-[0_2px_6px_rgba(37,99,235,0.3)]">',
      'Y',
      '</div>',
      '',
    ].join('\n'),
  },
];

for (const item of removals) {
  const occurrences = source.split(item.markup).length - 1;
  if (occurrences !== 1) throw new Error(item.name + ': expected exactly one decorative badge, found ' + occurrences);
  source = source.replace(item.markup, '');
}
if (!source.includes('생활비 통장') || !source.includes('모아 모닝 브리핑')) {
  throw new Error('Original finance titles unexpectedly missing');
}
fs.writeFileSync(filename, source);
console.log('Removed the two decorative home monogram circles, retained original headings.');
