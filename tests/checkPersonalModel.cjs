/* Standalone QA runner (no Vite/Rollup needed); run: node tests/checkPersonalModel.cjs */
const ts=require('typescript');const fs=require('fs');const vm=require('vm');const path=require('path');const root=path.resolve(__dirname,'..');
function load(rel,req){const abs=path.join(root,rel);const out=ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;const m={exports:{}};vm.runInNewContext('(function(module,exports,require){'+out+'})',{Date,Math,Map,Number,Array,Object,JSON,console}) (m,m.exports,req);return m.exports;}
const dates=load('shared/dates.ts',()=>null);
const model=load('src/lib/ml/personalModel.ts', (id)=>{if(id.endsWith('shared/dates'))return dates;throw Error(id)});
const today='2026-10-20';
const assert=(v,msg)=>{if(!v)throw Error(msg)};
const daily=[];
for(let i=64;i>=0;i--){const date=dates.addDays(today,-i);const wd=dates.weekdayOf(date);daily.push({date,category: wd===0||wd===6?'여가':'식비',from:'csv',amount:(wd===6?24000:wd===0?19000:6000)+Math.round((65-i)*15)});}
const req={from:dates.addDays(today,1),to:dates.addDays(today,14),today,dailySpend:8000,history:daily};
const r=model.analyzePersonalSpending(req);
console.log('trained',r.status,`MAE ${r.modelMae}, baseline MAE ${r.baselineMae}`,`improvement ${r.improvementPct}%`);
assert(r.status==='active','weekday pattern should pass holdout');
assert(r.forecast.days.length===14,'forecast horizon should be 14 dates');
assert(r.forecast.days.every(d=>d.p10>=0&&d.p10<=d.p50&&d.p50<=d.p90),'invalid quantiles');
const small=model.analyzePersonalSpending({...req,history:daily.slice(-8)});
assert(small.status==='insufficient'&&small.forecast===null,'small sample must fallback');
const flat=model.analyzePersonalSpending({...req,history:daily.map(d=>({...d,amount:12000}))});
assert(flat.status!=='active','constant series must not claim improvement');
console.log('PASS: temporal holdout, quantile ordering, insufficient-data fallback, no false improvement');
