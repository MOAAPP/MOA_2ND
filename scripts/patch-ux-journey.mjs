/**
 * Optional UX REVIEW on the deployment ZIP, not repository root src/.
 * PRESENTATION-ONLY: text, DOM order, a dynamic explanatory card and a new CSS layer.
 * Do not modify API routes, fetch(), stores, calculations, state, event handlers,
 * the original ZIP, or another feature owner's integration.
 *
 * --postbuild installs the stylesheet AFTER Vite's generated stylesheet, so
 * the original CSS remains byte-identical and branch rollback is trivial.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shipped = resolve(root, 'moa-web');
const cssFile = 'ux-journey-20261117.css';

function replaceExactlyOnce(value, from, to, label) {
  if (value.includes(to)) return value;
  const first = value.indexOf(from);
  if (first < 0 || value.indexOf(from, first + from.length) >= 0) {
    throw new Error('[ux review] Expected exactly one source anchor: ' + label);
  }
  return value.slice(0, first) + to + value.slice(first + from.length);
}
function patchFile(path, fn) {
  const file = resolve(shipped, path);
  const current = readFileSync(file, 'utf8');
  const next = fn(current);
  if (next !== current) writeFileSync(file, next, 'utf8');
  console.log('[ux review] ' + path + ': ' + (next === current ? 'unchanged' : 'layout/copy only'));
}
function updateHome(source) {
  if (source.includes('ux-home-lead')) return source;
  let s = replaceExactlyOnce(
    source,
    "<h1>{s.profile.name || '모아'}님, 오늘의 모아예요</h1>",
    "<h1>{s.profile.name || '모아'}님, 오늘의 모아예요</h1>\n        <p className=\"ux-home-lead\">지금 쓸 수 있는 돈을 확인하고, 소비 전 다른 미래를 비교해 보세요.</p>",
    'home welcome');
  s = replaceExactlyOnce(s, "'기록하면 평행세계가 생겨요'",
    "'지금 이 소비, 사도 괜찮을까?'", 'home primary choice headline');
  s = replaceExactlyOnce(s,
    '<em>같은 돈을 썼을 때와 모았을 때를 비교해요</em>',
    '<em>구매한 나와 보류한 나의 결제일까지 비교해요</em>',
    'home choice description');

  // Rearrange whole JSX siblings only. Their onClick callbacks, hooks, and
  // nested components are all untouched. New reading/tab order matches visual order.
  const anchors = [
    '{/* 1. AI 브리핑 — 한 문장 + 한 가지 행동 */}',
    '{/* 2. 결제일 안전 — 숫자 하나 */}',
    '{/* 3. 오늘의 학습 — 한 번 누르면 시작 */}',
    '{/* 4. 같은 돈, 다른 미래 */}',
    '{/* 5. AI에게 묻기 */}',
  ];
  const ix = anchors.map(a => s.indexOf(a));
  if (ix.some((n,i) => n < 0 || (i > 0 && n <= ix[i-1]))) {
    throw new Error('[ux review] Homepage block sequence changed: abort');
  }
  const end = s.indexOf('    </main>', ix[4]);
  if (end < 0) throw new Error('[ux review] Home main close not found');
  const parts = ix.map((pos,i) => s.slice(pos, i === 4 ? end : ix[i+1]));
  // Money context > signature comparison > AI explanation > goals > supporting learning.
  const order = [1,3,0,4,2];
  return s.slice(0,ix[0]) + order.map(i=>parts[i]).join('') + s.slice(end);
}
function updateWorld(source) {
  if (source.includes('ux-decision-summary')) return source;
  let s = replaceExactlyOnce(
    source,
    '        <section className="bg-white rounded-[24px] p-4 shadow-card space-y-3" aria-label="비교할 소비 선택">',
    `        <div className="ux-compare-steps" aria-label="소비 비교 진행 순서">
          <span><b>01</b>고민 입력</span><i aria-hidden="true" />
          <span><b>02</b>미래 비교</span><i aria-hidden="true" />
          <span><b>03</b>대안 찾기</span>
        </div>
        <section className="bg-white rounded-[24px] p-4 shadow-card space-y-3" aria-label="비교할 소비 선택">`,
    'comparison progression');
  const anchor = '          <section aria-label="구매 여부에 따른 두 세계" className="grid grid-cols-2 gap-2.5">';
  const card = `          <section className="ux-decision-summary" aria-live="polite" aria-label="소비 선택 결과 요약">
            <div className="ux-decision-kicker"><span className="ux-pulse-dot" aria-hidden="true" /> MY FINANCIAL CHOICE</div>
            <h2>{projection.boughtRisk
              ? '지금 구매하면 최소 잔액 조건을 다시 확인해야 해요'
              : '구매한 세계와 보류한 세계, 이렇게 달라져요'}</h2>
            <p>{period === 7 ? '7일' : period === 30 ? '1개월' : '3개월'} 동안 입력된 금융 일정으로 비교했어요. 보류한 세계의 예상 결제계좌 잔액 차이는 {won(projection.delta)}예요.</p>
            <div className="ux-decision-metrics">
              <div><small>지금 구매한 세계</small><strong className={projection.boughtRisk ? 'ux-warn' : 'ux-safe'}>
                {projection.boughtRisk ? \`\\u26a0 \${short(projection.boughtRisk)} 잔액 주의\` : '✓ 등록 일정상 부족 없음'}
              </strong></div>
              <div><small>구매 보류한 세계</small><strong className={projection.keptRisk ? 'ux-warn' : 'ux-safe'}>
                {projection.keptRisk ? \`\\u26a0 \${short(projection.keptRisk)} 잔액 주의\` : '✓ 등록 일정상 부족 없음'}
              </strong></div>
            </div>
            <p className="ux-decision-note">가상 비교 결과이며, 등록되지 않은 지출과 수입 변동은 포함하지 않을 수 있어요.</p>
          </section>

` + anchor;
  s=replaceExactlyOnce(s,anchor,card,'world decision summary');
  return s;
}

if (process.argv.includes('--postbuild')) {
  const index = resolve(shipped,'dist/index.html');
  const html = readFileSync(index,'utf8');
  const link = `<link rel="stylesheet" href="/${cssFile}" />`;
  if (!html.includes(link)) {
    const next = replaceExactlyOnce(html, '</head>', '    ' + link + '\n  </head>', 'Vite output stylesheet');
    writeFileSync(index,next,'utf8');
  }
  console.log('[ux review] CSS linked after Vite bundle, UI preview only');
} else {
  // Apply after ALL existing integration patches to the actual deployed source.
  patchFile('src/screens/Home.jsx',updateHome);
  patchFile('src/pages/WorldChoice.tsx',updateWorld);
  mkdirSync(resolve(shipped,'public'),{recursive:true});
  copyFileSync(resolve(root,'design',cssFile),resolve(shipped,'public',cssFile));
  console.log('[ux review] Existing backend / API / feature sources not modified');
}
