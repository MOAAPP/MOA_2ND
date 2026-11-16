/**
 * Connect the existing 3D explorer's "진단" action to FastAPI's six independent
 * cashflow paths. Keep EVERY JSX/HTML screen template and CSS file unchanged.
 * Change only the pre-existing diagnostic box's runtime TEXT in demo mode.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const integration = readFileSync(resolve(root, 'integration/worldSixSafety.ts'), 'utf8');
if (!integration.includes("from './demoFinanceMap.ts'")) {
  throw new Error('[six worlds] Original mapper import changed');
}
writeFileSync(resolve(root, 'moa-web/src/lib/worldSixSafety.ts'),
  integration.replace("from './demoFinanceMap.ts'", "from './demoFinanceMap'"));

const path = resolve(root, 'moa-web/src/lib/bridge.js');
let src = readFileSync(path, 'utf8');
function replaceOne(before, after) {
  if (src.includes(after)) return;
  const index = src.indexOf(before);
  if (index < 0 || src.indexOf(before, index + before.length) >= 0) {
    throw new Error('[six worlds] Expected a single bridge source anchor: ' + before.slice(0, 75));
  }
  src = src.slice(0, index) + after + src.slice(index + before.length);
}

replaceOne(
  "  skippedTotal, APP_TODAY, TX_LABEL, fmtShares, setTargetWeights,",
  "  skippedTotal, APP_TODAY, MODE, TX_LABEL, fmtShares, setTargetWeights,",
);
replaceOne(
  "import { LESSONS, stockLessonId } from './learning';",
  "import { LESSONS, stockLessonId } from './learning';\nimport { getSixWorldSafety, SIX_WORLD_IDS } from './worldSixSafety';",
);
replaceOne(
  "  const opt = { ...DEFAULT_WORLD_OPTS, ...getState().simSettings };",
  "  const opt = { ...DEFAULT_WORLD_OPTS, ...getState().simSettings };\n  let worldSafetyRequest = 0;\n  let activeSafetyAbort = null;\n  let originalSafetyButton = null;",
);
replaceOne(
`    refreshCalculations() {
      const amt = get.amount(), y = get.years();`,
`    refreshCalculations() {
      // A previous backend diagnosis is not valid after the amount,
      // chosen route, long-term horizon or assumptions have changed.
      if (MODE === 'demo') {
        ++worldSafetyRequest;
        if (activeSafetyAbort) activeSafetyAbort.abort();
        activeSafetyAbort = null;
        const oldBox = document.getElementById('ai-insight-box');
        if (oldBox) oldBox.classList.add('hidden');
        const oldButton = document.getElementById('ai-trigger-btn');
        if (oldButton) {
          oldButton.disabled = false;
          if (originalSafetyButton) oldButton.innerHTML = originalSafetyButton;
        }
      }
      const amt = get.amount(), y = get.years();`,
);
const injected = `    triggerAiCoaching() {
      if (MODE === 'demo') {
        const btn = document.getElementById('ai-trigger-btn');
        const box = document.getElementById('ai-insight-box');
        if (!btn || !box) return;
        if (!originalSafetyButton) originalSafetyButton = btn.innerHTML;
        const current = getState();
        box.classList.remove('hidden');
        if (!current.demoFinanceReady || !['S01', 'S08'].includes(current.demoUserId)) {
          box.textContent = '백엔드의 가상 금융 데이터를 불러온 후 90일 결제 안정성을 검증할 수 있어요.';
          return;
        }
        const selected = get.selected(), amount = Math.round(get.amount());
        const input = {
          user: current.demoUserId, currentBalance: current.finance.balance,
          amount, minimumBalance: current.finance.minBalance,
          delayMonths: opt.delayMonths, mix: [...opt.mix], saveRate: opt.saveRate,
        };
        const requestId = ++worldSafetyRequest;
        if (activeSafetyAbort) activeSafetyAbort.abort();
        const controller = new AbortController();
        activeSafetyAbort = controller;
        const timer = window.setTimeout(() => controller.abort(), 25000);
        btn.disabled = true;
        btn.textContent = '백엔드 90일 금융 안전성 검사 중…';
        box.textContent = 'MOA 금융 엔진이 월급·필수 결제·예측 변동 지출을 반영해 여섯 경로를 계산하고 있어요.';
        const labels = {
          protected: '가정상 유지', shortfall: '자금 부족 위험',
          needs_confirmation: '확인 필요', invalid: '계산 불가',
          out_of_horizon: '90일 이후·미검증',
        };
        void getSixWorldSafety(input, controller.signal).then((report) => {
          if (requestId !== worldSafetyRequest || !c.root.isConnected) return;
          const latest = getState();
          if (latest.demoUserId !== input.user ||
              latest.finance.balance !== input.currentBalance ||
              !latest.demoFinanceReady ||
              get.selected() !== selected || Math.round(get.amount()) !== amount ||
              opt.delayMonths !== input.delayMonths || opt.saveRate !== input.saveRate ||
              opt.mix.join(',') !== input.mix.join(',')) return;
          const chosenId = SIX_WORLD_IDS[selected - 1];
          const path = report.paths.find((p) => p.id === chosenId);
          if (!path) throw new Error('selected_world_missing');
          const safe = (s) => esc(s);
          const statusText = safe(labels[path.result] || '확인 필요');
          const min = path.minimumBalance === null ? '검증 범위 밖' : fmt(path.minimumBalance) + '원';
          const end = path.endingCash === null ? '검증 범위 밖' : fmt(path.endingCash) + '원';
          const risk = path.firstShortfall
            ? ' · 첫 부족 가능일 ' + safe(path.firstShortfall)
            : path.result === 'protected' ? ' · 필수 결제 가정상 충족' : '';
          const all = report.paths.map((p, i) =>
            (i + 1) + '.' + safe(meta[i + 1].name) + ' ' + safe(labels[p.result])).join(' / ');
          box.innerHTML = [
            '<strong class="text-white">MOA 금융 엔진 · ' + safe(report.user) + ' · 2026-11-04 기준</strong><br/>',
            '<strong class="text-blue-300">' + safe(meta[selected].name) + '</strong>: ',
            '<strong class="text-amber-300">' + statusText + '</strong><br/>',
            '90일 최소 결제계좌 잔액 ' + min + ' · 90일 말 결제계좌 잔액 ' + end + risk + '<br/>',
            '<span class="text-slate-300">6개 선택: ' + all + '</span><br/>',
            '<span class="text-slate-300">※ 위 안전성은 합성 금융 데이터의 90일 시뮬레이션입니다. 화면의 1~10년 자산 금액은 별도 연 수익률 가정이며, 가상 투자 자산을 실제 통장에 합산하지 않습니다.</span>',
          ].join('');
          btn.textContent = '90일 검증 결과';
        }).catch(() => {
          if (requestId !== worldSafetyRequest || !c.root.isConnected) return;
          box.textContent = controller.signal.aborted
            ? '90일 금융 검증 시간이 초과됐어요. 계산 결과를 대신 만들어 표시하지 않았어요.'
            : '백엔드 90일 금융 검증에 연결할 수 없어요. 이전 결과나 프론트 예시를 대신 표시하지 않았어요.';
          btn.textContent = '90일 검증 다시 하기';
        }).finally(() => {
          window.clearTimeout(timer);
          if (requestId === worldSafetyRequest && c.root.isConnected) {
            btn.disabled = false;
            activeSafetyAbort = null;
          }
        });
        return;
      }
      const btn = document.getElementById('ai-trigger-btn');`;
replaceOne(
`    triggerAiCoaching() {
      const btn = document.getElementById('ai-trigger-btn');`,
  injected,
);
writeFileSync(path, src);
console.log('[six worlds] Patched only the existing demo diagnostic behavior in bridge.js');
