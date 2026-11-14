// Applied after extracting the existing MOA preview archive.
const fs = require('node:fs');
const f = 'moa-web/src/screens/Home.jsx';
const c = 'moa-web/src/screens/Home.css';
let home = fs.readFileSync(f,'utf8');
const start = home.indexOf('      <section className="moa-brand-continuation"');
const end = home.indexOf('      <section className="moa-brand-more"',start);
if(start<0||end<start) throw Error('Continuation section not found');
home=home.slice(0,start)+home.slice(end);
const grid=home.indexOf('className="moa-brand-shortcuts"');
const close=home.indexOf('\n        </div>',grid);
if(grid<0||close<grid)throw Error('Shortcut grid not found');
const extra=[
"          <button type=\"button\" onClick={() => navigate('/invest')}><span>가상 투자</span><strong>주식 투자<br/>연습하기</strong><Arrow size={17}/></button>",
"          <button type=\"button\" onClick={() => navigate('/savings')}><span>가상 예·적금</span><strong>예금·적금<br/>시작하기</strong><Arrow size={17}/></button>"
].join('\n');
home=home.slice(0,close)+'\n'+extra+home.slice(close);
fs.writeFileSync(f,home);
fs.appendFileSync(c,'\n/* Four MOA money tools */\n.moa-brand-shortcuts button:nth-child(3){background:#f8faff;border-color:#e4eaf6!important}\n.moa-brand-shortcuts button:nth-child(4){background:#eff6fc;border-color:#e0ebf6!important}\n');
console.log('Four finance shortcuts ready.');
