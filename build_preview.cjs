/* Vite 네이티브 패키지를 설치하지 못하는 환경에서도 소스와 동일한 React 컴포넌트를
 * 브라우저에서 열어볼 수 있게 만드는 오프라인 미리보기 번들러입니다. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root=process.cwd();
const ids=[];
for (const dir of ['src','shared']) {
 const walk=(folder)=>{for(const item of fs.readdirSync(folder,{withFileTypes:true})){
  if(item.name.startsWith('.'))continue;
  const name=path.join(folder,item.name);
  if(item.isDirectory())walk(name);
  else if(/\.tsx?$/.test(item.name) && !item.name.endsWith('.d.ts') && !item.name.endsWith('worker.ts'))ids.push(path.relative(root,name).split(path.sep).join('/'));
 }};walk(path.join(root,dir));
}
const moduleScripts=ids.map(id=>{
 let content=fs.readFileSync(path.join(root,id),'utf8');
 content=content.replace(/import\.meta/g,'({env:{PROD:false},url:location.href})');
 // 자바스크립트 모듈이 아닌 브라우저 환경에서도 동작하도록 고전적 JSX로 변환
 const out=ts.transpileModule(content,{fileName:id, compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 return `${JSON.stringify(id)}: function(module,exports,require){const React=window.React;\n${out}\n}`;
});
let css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-refresh.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-v3.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-fintech.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-v5.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-v6.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-v7.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-v8.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/ux-v9.css'),'utf8');
let code=`(function(){const modules={${moduleScripts.join(',\n')}};const cache={};function resolve(from,req){if(req.endsWith('.css'))return {};if(req==='react')return window.React;if(req==='react-dom/client')return window.ReactDOM;const base=from.slice(0,from.lastIndexOf('/')+1);const steps=(base+req).split('/');const stack=[];for(const part of steps){if(!part||part==='.')continue;if(part==='..')stack.pop();else stack.push(part);}const normalized=stack.join('/');for(const id of [normalized,normalized+'.tsx',normalized+'.ts',normalized+'.js',normalized+'/index.ts'])if(modules[id])return load(id);throw new Error('Unresolved import: '+req+' in '+from);}function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,(p)=>resolve(id,p));return m.exports;}load('src/main.tsx');})();`;
// standalone HTML에는 기존 아트워크도 데이터 URL로 묶음
const assets=['latte','logo','worlds','travel'];
const imageData=Object.fromEntries(assets.map(name=>[name, 'data:image/png;base64,'+fs.readFileSync(path.join(root,'public/illustrations',name+'.png')).toString('base64')]));
for(const [name,value] of Object.entries(imageData)) code=code.replaceAll('/illustrations/'+name+'.png',value);
const demoState=fs.readFileSync(path.join(root,'preview-demo-state.json'),'utf8');
const react=fs.readFileSync(path.join(root,'public/vendor/react.production.min.js'),'utf8');
const reactdom=fs.readFileSync(path.join(root,'public/vendor/react-dom.production.min.js'),'utf8');
const html=`<!doctype html><html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>평행통장 · UI 개선 미리보기</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script>(function(){
/* 이 파일만 열었을 때 서버 SSE는 실행하지 않습니다. 임베드 미리보기에서 저장 공간이 막힌 경우 메모리로 대체합니다. */
window.EventSource=undefined;
try{window.localStorage.getItem('__pb_preview_check__');}catch(err){
 var cache={}; Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem:function(k){return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:null;},
 setItem:function(k,v){cache[String(k)]=String(v);},
 removeItem:function(k){delete cache[String(k)];},
 clear:function(){cache={};},key:function(i){return Object.keys(cache)[i]||null;},
 get length(){return Object.keys(cache).length;}
 }});
}})();</script><script>${react.replaceAll('</script','<\\/script')}</script><script>${reactdom.replaceAll('</script','<\\/script')}</script><script>try{if(!localStorage.getItem('pb.state.v3'))localStorage.setItem('pb.state.v3',${JSON.stringify(demoState)});}catch(e){console.warn('프리뷰 예시 데이터 준비 실패',e);}</script><script>${code.replaceAll('</script','<\\/script')}</script></body></html>`;
fs.writeFileSync(path.join(root,'평행통장_기능_클릭_미리보기.html'),html);
// The onboarding preview always starts on slide 1, even when local storage already exists.
// Completing slides takes the user to their saved/demo home without erasing anything.
const onboardingHtml=html.replace('<div id="root"></div>', '<div id="root"></div><script>window.__PB_FORCE_INTRO=true;</script>');
fs.writeFileSync(path.join(root,'평행통장_온보딩_클릭_미리보기.html'),onboardingHtml);
console.log('Created preview:',(html.length/1024/1024).toFixed(1)+'MB','modules:',ids.length);
