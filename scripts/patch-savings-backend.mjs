/**
 * Build-time patch for the ACTUALLY DEPLOYED moa-web ZIP savings page.
 * Preserves all existing JSX element hierarchy, classes, styles and 3D planet.
 * Only changes the existing form values and virtual-join behavior in demo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = readFileSync(resolve(root, 'integration/savingsPlan.ts'), 'utf8');
const specifier = "from './demoFinanceMap.ts'";
if (!source.includes(specifier)) throw new Error('[savings backend] specifier changed');
writeFileSync(resolve(root, 'moa-web/src/lib/savingsPlan.ts'),
  source.replace(specifier, "from './demoFinanceMap'"));

const path = resolve(root, 'moa-web/src/pages/Savings.tsx');
let src = readFileSync(path, 'utf8');
function replaceOnce(before, after) {
  if (src.includes(after)) return;
  const at = src.indexOf(before);
  if (at < 0 || src.indexOf(before, at + before.length) !== -1) {
    throw new Error('[savings backend] Source anchor mismatch: ' + before.slice(0, 68));
  }
  src = src.slice(0, at) + after + src.slice(at + before.length);
}

replaceOnce(
  "import { useMemo, useState } from 'react';",
  "import { useEffect, useMemo, useState } from 'react';",
);
replaceOnce(
  "import { setState, todayDate, useStore, won, type SavingsDeposit, type SavingsProduct } from '../lib/store';",
  "import { MODE, setState, todayDate, useStore, won, type SavingsDeposit, type SavingsProduct } from '../lib/store';\nimport { getSavingsPlan, isSupportedSavingsMonths, type SavingsInput, type MappedSavingsPlan } from '../lib/savingsPlan';",
);
replaceOnce(
`  const savings = useStore((s) => s.savings);
  const [sheet, setSheet] = useState<(typeof SHELF)[number] | null>(null);`,
`  const savings = useStore((s) => s.savings);
  const demoUser = useStore((s) => s.demoUserId ?? 'S01');
  const demoReady = useStore((s) => s.demoFinanceReady === true);
  const demoBalance = useStore((s) => s.finance.balance);
  const demoMinBalance = useStore((s) => s.finance.minBalance);
  const demoGoal = useStore((s) => s.profile.goalAmount ?? 0);
  const [sheet, setSheet] = useState<(typeof SHELF)[number] | null>(null);`,
);
replaceOnce(
`  const preview = sheet ? expectedInterest(sheet.kind, sheet.kind === 'deposit' ? amount : 0, amount, months, sheet.rate) : 0;

  const join = () => {`,
`  const preview = sheet ? expectedInterest(sheet.kind, sheet.kind === 'deposit' ? amount : 0, amount, months, sheet.rate) : 0;
  // API is a read-only HYPOTHETICAL plan. This screen's planet and product
  // history remain local virtual records, never actual cash or bank deposits.
  const [planState, setPlanState] = useState<{
    key: string; status: 'loading' | 'ready' | 'error' | 'unsupported';
    result: MappedSavingsPlan | null;
  } | null>(null);
  const planKey = [
    sheet?.key ?? '', sheet?.rate ?? '', amount, months,
    demoUser, demoReady, demoBalance, demoMinBalance, demoGoal,
  ].join(':');

  useEffect(() => {
    if (MODE !== 'demo' || !sheet) return;
    if (!demoReady || !['S01', 'S08'].includes(demoUser)) {
      setPlanState({ key: planKey, status: 'loading', result: null });
      return;
    }
    if (!isSupportedSavingsMonths(months) || amount < 1000 || amount > 10000000) {
      setPlanState({ key: planKey, status: 'unsupported', result: null });
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 25000);
    const input: SavingsInput = {
      user: demoUser as SavingsInput['user'],
      currentBalance: demoBalance, minimumBalance: demoMinBalance,
      kind: sheet.kind, amount, months,
      ratePercent: sheet.rate,
      goalAmount: Math.max(1, demoGoal || amount * months),
    };
    setPlanState({ key: planKey, status: 'loading', result: null });
    void getSavingsPlan(input, controller.signal)
      .then(result => { if (active) setPlanState({ key: planKey, status: 'ready', result }); })
      .catch(() => { if (active) setPlanState({ key: planKey, status: 'error', result: null }); })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [planKey]);

  const livePlan = MODE === 'demo' && planState?.key === planKey && planState.status === 'ready'
    ? planState.result : null;
  const planStatus = MODE === 'demo' && planState?.key === planKey ? planState.status : 'loading';

  const join = () => {`,
);
replaceOnce(
`    if (!sheet || !Number.isFinite(amount) || amount <= 0 || months < 1) { toast('납입 금액과 기간을 확인해 주세요', 'info'); return; }
    const p: SavingsProduct = {`,
`    if (!sheet || !Number.isFinite(amount) || amount <= 0 || months < 1) { toast('납입 금액과 기간을 확인해 주세요', 'info'); return; }
    if (MODE === 'demo' && !livePlan) {
      toast(!isSupportedSavingsMonths(months)
        ? '24개월은 백엔드 안전성 검증 범위 밖이에요. 3·6·12개월을 선택해 주세요.'
        : planStatus === 'error'
          ? '백엔드에 연결할 수 없어 가입 전 금융 검증을 완료하지 못했어요.'
          : '금융 데이터 검증을 마친 뒤 가상 가입할 수 있어요.', 'info');
      return;
    }
    const startedAt = MODE === 'demo' && livePlan ? livePlan.startDate : iso(TODAY);
    const p: SavingsProduct = {`,
);
replaceOnce(
  "      startedAt: iso(TODAY),\n      history: [{ date: iso(TODAY), amount, kind: 'join' }],",
  "      startedAt,\n      history: [{ date: startedAt, amount, kind: 'join' }],",
);
replaceOnce(
  "    toast(`${sheet.name}에 가입했어요. 행성이 자라고 있어요`, 'public');",
  "    toast(MODE === 'demo' && livePlan && livePlan.validationStatus === 'fails_assumptions'\n      ? `${sheet.name} 가상 가입 · 90일 현금흐름에 자금 부족 위험이 있어요`\n      : `${sheet.name}에 가상 가입했어요. 행성이 자라고 있어요`, 'public');",
);
replaceOnce(
  "<span className=\"text-toss-gray600\">적용 금리</span><b className=\"text-toss-gray900\">연 {sheet.rate}%</b>",
  "<span className=\"text-toss-gray600\">적용 금리</span><b className=\"text-toss-gray900\">연 {sheet.rate}%{MODE === 'demo' && livePlan ? (livePlan.validationStatus === 'satisfies_assumptions' ? ' · 90일 충족' : ' · 90일 위험') : ''}</b>",
);
replaceOnce(
  "<span className=\"text-toss-gray600\">만기 원금</span><b className=\"text-toss-gray900 tabular-nums\">{won(sheet.kind === 'deposit' ? amount : amount * months)}</b>",
  "<span className=\"text-toss-gray600\">만기 원금</span><b className=\"text-toss-gray900 tabular-nums\">{MODE === 'demo' ? (livePlan ? won(livePlan.projectedPrincipal) : planStatus === 'error' ? '연결 실패' : !isSupportedSavingsMonths(months) ? '24개월 미지원' : '계산 중') : won(sheet.kind === 'deposit' ? amount : amount * months)}</b>",
);
replaceOnce(
  "<span className=\"text-toss-gray600\">예상 이자 (세전)</span><b className=\"text-emerald-600 tabular-nums\">+{won(preview)}</b>",
  "<span className=\"text-toss-gray600\">예상 이자 (세전)</span><b className=\"text-emerald-600 tabular-nums\">{MODE === 'demo' ? (livePlan ? (livePlan.interestBeforeTax == null ? '추정 불가' : `+${won(livePlan.interestBeforeTax)}`) : planStatus === 'error' ? '연결 실패' : !isSupportedSavingsMonths(months) ? '24개월 미지원' : '계산 중') : `+${won(preview)}`}</b>",
);
writeFileSync(path, src);
console.log('[savings backend] Patched only virtual savings sheet data handling; no markup/CSS changes');
