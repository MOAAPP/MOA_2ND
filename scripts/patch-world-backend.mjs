/**
 * Patch the shipped WorldChoice TSX at build time. Retain every existing
 * DOM element, CSS class, chart component and screen layout exactly.
 * Only the numbers, their source notice and demo fetch state change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
// Node's strip-types test runner needs .ts; the ZIP's strict tsc expects an
// extensionless local import. Adapt only the specifier when copying.
const service = readFileSync(resolve(root, 'integration/worldComparison.ts'), 'utf8');
const sourceSpecifier = "from './demoFinanceMap.ts'";
if (!service.includes(sourceSpecifier)) throw new Error('[world backend] mapper import changed');
writeFileSync(resolve(root, 'moa-web/src/lib/worldComparison.ts'),
  service.replace(sourceSpecifier, "from './demoFinanceMap'"));
const path = resolve(root, 'moa-web/src/pages/WorldChoice.tsx');
let src = readFileSync(path, 'utf8');
function replace(before, after) {
  if (src.includes(after)) return;
  const index = src.indexOf(before);
  if (index < 0 || src.indexOf(before, index + before.length) >= 0) {
    throw new Error('[world backend] WorldChoice source anchor changed: ' + before.slice(0, 72));
  }
  src = src.slice(0, index) + after + src.slice(index + before.length);
}

replace(
  "import { APP_TODAY, useStore, won, WISH_LABEL } from '../lib/store';",
  "import { APP_TODAY, MODE, useStore, won, WISH_LABEL } from '../lib/store';\nimport { getWorldProjection, type WorldProjection } from '../lib/worldComparison';\nimport type { DemoUserId } from '../lib/demoFinanceMap';",
);
replace(
`  const projection = useMemo(() => comparePurchaseChoice(s, { name: finalName, amount, wish: selected, transaction: selectedTx }, period), [s, finalName, amount, selected, selectedTx, period]);
  const valid = amount >= 1000 && amount <= 100000000;`,
`  // Regular user mode still uses the browser's editable local transactions.
  // Demo uses only canonical FastAPI cashflow; no stale client numbers are shown.
  const localProjection = useMemo(() => comparePurchaseChoice(s, { name: finalName, amount, wish: selected, transaction: selectedTx }, period), [s, finalName, amount, selected, selectedTx, period]);
  const valid = amount >= 1000 && amount <= 100000000;
  const demoUserId = (s.demoUserId || 'S01') as DemoUserId;
  const inputPayment = selected?.payment || selectedTx?.payment || '체크카드 (즉시 출금)';
  const supportedPayment = !/신용카드|credit|현금/i.test(inputPayment);
  const paymentMethod = /계좌이체|transfer/i.test(inputPayment) ? 'transfer' as const : 'debit' as const;
  const [backend, setBackend] = useState<{ key: string; result: WorldProjection } | null>(null);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'loading' | 'error' | 'unsupported'>('idle');
  const backendKey = [demoUserId, s.finance.balance, s.demoFinanceReady, amount, period, paymentMethod, supportedPayment].join(':');
  useEffect(() => {
    if (MODE !== 'demo' || !s.demoFinanceReady || !valid) return;
    if (!supportedPayment) {
      setBackend(null); setBackendStatus('unsupported');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    setBackend(null); setBackendStatus('loading');
    void getWorldProjection(demoUserId, amount, period, s.finance.balance,
      controller.signal, paymentMethod).then(result => {
      if (!controller.signal.aborted) {
        setBackend({ key: backendKey, result });
        setBackendStatus('idle');
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setBackend(null);
        setBackendStatus('error');
      }
    }).finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort(); window.clearTimeout(timer);
    };
  }, [backendKey]);
  const liveProjection = backend?.key === backendKey ? backend.result : null;
  const projection = MODE === 'demo' ? (liveProjection || localProjection) : localProjection;`,
);
replace(
`  const notice = projection.actual === 'bought' ? '기록된 구매와 구매하지 않은 경우를 현재 잔액 기준으로 비교했어요.'
    : selected ? '현재 구매하지 않은 상태를 기준으로, 오늘 샀다면 어땠을지 계산했어요.'
    : '실제 거래가 아닌 예시 금액으로 두 가지 선택을 연습해요.';`,
`  const notice = MODE === 'demo'
    ? !s.demoFinanceReady ? '백엔드 금융 데이터를 불러온 뒤 비교할 수 있어요.'
      : !supportedPayment ? '신용카드·현금 결제는 결제 시점을 확인해야 해요. 체크카드·이체를 선택해 주세요.'
      : liveProjection ? \`MOA 백엔드 · \${demoUserId} · 2026년 11월 4일 기준 · \${period}일 실제 금융 엔진 계산(가상 데이터)\`
      : backendStatus === 'error' ? '백엔드 분석에 연결할 수 없어 결과를 표시하지 않았어요.'
      : '백엔드에서 구매·미구매 현금흐름을 계산하고 있어요.'
    : projection.actual === 'bought' ? '기록된 구매와 구매하지 않은 경우를 현재 잔액 기준으로 비교했어요.'
    : selected ? '현재 구매하지 않은 상태를 기준으로, 오늘 샀다면 어땠을지 계산했어요.'
    : '실제 거래가 아닌 예시 금액으로 두 가지 선택을 연습해요.';`,
);
replace(
`        {valid && <>`,
`        {valid && (MODE !== 'demo' || !!liveProjection) && <>`,
);
replace(
  '등록된 급여·필수결제·거래 일정을 동일하게 적용한 비교예요. 미래 변동지출은 제외했어요. 미구매 금액은 수익이 아니라 남아 있는 소비 예산이에요.',
  "{MODE === 'demo' ? '백엔드의 급여·필수 결제·예측 변동지출을 동일하게 적용한 가상 비교예요. 미구매 금액은 투자 수익이 아니라 남아 있는 현금이에요.' : '등록된 급여·필수결제·거래 일정을 동일하게 적용한 비교예요. 미래 변동지출은 제외했어요. 미구매 금액은 수익이 아니라 남아 있는 소비 예산이에요.'}",
);
writeFileSync(path, src);
console.log('[world backend] Patched WorldChoice behavior, preserved CSS/layout');
