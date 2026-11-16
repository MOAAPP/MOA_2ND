/**
 * Investment integration in the real shipped ZIP.
 *
 * NO JSX, CSS, template, button layout, or chart changes. The existing
 * mock-defense wallet still executes locally. Only demo FILLED orders are
 * replayed to FastAPI to assess 90-day payment-account risk and what-if P&L.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const service = readFileSync(resolve(root, 'integration/portfolioSimulation.ts'), 'utf8');
const sourceImport = "from './demoFinanceMap.ts'";
if (!service.includes(sourceImport)) throw new Error('[portfolio] source import changed');
writeFileSync(resolve(root, 'moa-web/src/lib/portfolioSimulation.ts'),
  service.replace(sourceImport, "from './demoFinanceMap'"));

const path = resolve(root, 'moa-web/src/lib/bridge.js');
let source = readFileSync(path, 'utf8');
function patchOnce(before, after) {
  if (source.includes(after)) return;
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) {
    throw new Error('[portfolio] expected exactly one bridge anchor: ' + before.slice(0, 67));
  }
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

if (!source.includes("import { filledOrderKey, getPortfolioValidation, commitPortfolioValidation, readPortfolioValidation } from './portfolioSimulation';")) patchOnce(
  "import { LESSONS, stockLessonId } from './learning';",
  "import { LESSONS, stockLessonId } from './learning';\nimport { filledOrderKey, getPortfolioValidation, commitPortfolioValidation, readPortfolioValidation } from './portfolioSimulation';",
);

patchOnce(
  `export function investBridge(c) {
  const { document, app, orig, get, set } = c;
  const cards = () => [...document.querySelectorAll('.stock-card')];`,
  `export function investBridge(c) {
  const { document, app, orig, get, set } = c;
  let lastCheckedKey = '';
  let activePortfolioRequest = null;

  /** Reconcile *hypothetical* filled orders, never the mock defense wallet. */
  function validateDemoTrades() {
    if (MODE !== 'demo') return;
    const snapshot = getState();
    if (!snapshot.demoFinanceReady ||
        !['S01', 'S08'].includes(snapshot.demoUserId)) return;
    if (!snapshot.invest.orders.some(o => o.status === 'filled')) return;
    const input = {
      user: snapshot.demoUserId,
      balance: snapshot.finance.balance,
      minBalance: snapshot.finance.minBalance,
      orders: snapshot.invest.orders,
    };
    const key = filledOrderKey(input);
    if (key === lastCheckedKey) return;
    lastCheckedKey = key;
    activePortfolioRequest?.abort();
    const controller = new AbortController();
    activePortfolioRequest = controller;
    const timer = globalThis.setTimeout(() => controller.abort(), 25000);
    void getPortfolioValidation(input, controller.signal).then((result) => {
      const latest = getState();
      if (controller.signal.aborted || latest.demoUserId !== input.user ||
          latest.finance.balance !== input.balance ||
          filledOrderKey({
            user: latest.demoUserId, balance: latest.finance.balance,
            minBalance: latest.finance.minBalance,
            orders: latest.invest.orders,
          }) !== key) return;
      commitPortfolioValidation(input, result);
      const status = result.status === 'satisfies_assumptions'
        ? '결제계좌 유지 가정 충족' : '결제계좌 자금 부족 가능';
      const money = fmt(result.minimumPaymentBalance);
      // Existing toast and completion subtitle only: no DOM or style changes.
      if (c.root?.isConnected) {
        orig.showToast('MOA 90일 백엔드 검증: ' + status + ' · 최소 잔액 ' + money + '원');
        const subtitle = document.getElementById('complete-subtitle');
        if (subtitle) subtitle.textContent =
          '모의 체결 · 백엔드 90일 ' + (result.status === 'satisfies_assumptions' ? '유지 가정 충족' : '자금 부족 위험');
      }
    }).catch((error) => {
      if (!c.root?.isConnected || lastCheckedKey !== key) return;
      const code = String(error instanceof Error ? error.message : '');
      const warning = code === 'portfolio_sell_without_simulated_purchase'
        ? '기존 프론트 예시 보유분은 실제 매수 기록이 아니므로 백엔드 매도를 검증하지 않았어요.'
        : code === 'portfolio_unsupported_virtual_order'
          ? '현재 모의 거래는 백엔드의 정수 주식 수량 검증 범위를 벗어났어요.'
          : controller.signal.aborted
            ? '백엔드 투자 검증 시간이 초과됐어요. 계산 결과를 임의로 만들지 않았어요.'
            : '백엔드 투자 검증에 연결할 수 없어 모의 체결과 금융 검증을 분리했어요.';
      orig.showToast(warning);
    }).finally(() => {
      globalThis.clearTimeout(timer);
      if (activePortfolioRequest === controller) activePortfolioRequest = null;
    });
  }
  const cards = () => [...document.querySelectorAll('.stock-card')];`,
);

patchOnce(
  `    renderOrders();
  }

  // 주문창이 열려 있으면 현재가·호가도 함께 갱신`,
  `    renderOrders();
    if (MODE === 'demo') validateDemoTrades();
  }

  // 주문창이 열려 있으면 현재가·호가도 함께 갱신`,
);

patchOnce(
  "        orig.showToast(`지정가 ${fmt(r.order.limitPrice)}원 주문을 접수했어요. 조건이 맞으면 체결돼요.`);\n        return;",
  "        orig.showToast(`지정가 ${fmt(r.order.limitPrice)}원 주문 접수 · 백엔드 현금흐름 검증은 체결 후에 진행돼요.`);\n        return;",
);

patchOnce(
  `    const profit = total - cost;
    t(document.getElementById('hero-total-amount'), fmt(total));`,
  `    const profit = total - cost;
    if (MODE === 'demo') {
      const state = getState();
      const validation = state.demoFinanceReady && ['S01', 'S08'].includes(state.demoUserId)
        ? readPortfolioValidation({
          user: state.demoUserId,
          balance: state.finance.balance,
          minBalance: state.finance.minBalance,
          orders: state.invest.orders,
        })
        : null;
      const heading = [...document.querySelectorAll('h3')]
        .find(el => el.textContent.trim() === '보유 종목');
      const note = heading?.parentElement?.querySelector('span');
      if (note) {
        note.textContent = validation
          ? '모의 시세 · 백엔드 90일 ' +
            (validation.status === 'satisfies_assumptions' ? '유지 가정 충족' : '결제계좌 위험')
          : '모의 시세 · 백엔드 미검증';
      }
    }
    t(document.getElementById('hero-total-amount'), fmt(total));`,
);
writeFileSync(path, source);
console.log('[portfolio] Added FastAPI 90-day trade validation to existing mock wallet behavior (no CSS/JSX)');
