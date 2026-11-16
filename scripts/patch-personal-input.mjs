/**
 * 6. USER-mode personal input integration. Applied AFTER demo-only patches.
 * The production ZIP is the only deployed source: do not touch JSX classes,
 * UI structure, components, charts, CSS, or user-entered store state.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const lib = resolve(root, 'moa-web/src/lib/personalFinance.ts');
writeFileSync(lib, readFileSync(resolve(root, 'integration/personalFinance.ts'), 'utf8'));

function patch(path, changes) {
  const target = resolve(root, 'moa-web/src', path);
  let src = readFileSync(target, 'utf8');
  for (const [before, after] of changes) {
    if (src.includes(after)) continue;
    const at = src.indexOf(before);
    if (at < 0 || src.indexOf(before, at + before.length) >= 0) {
      throw Error('[personal input] source anchor changed: ' + path +
        ': ' + before.slice(0, 80));
    }
    src = src.slice(0, at) + after + src.slice(at + before.length);
  }
  writeFileSync(target, src);
  console.log('[personal input] patched ' + path + ' behavior only');
}
patch('pages/WorldChoice.tsx', [
  [
    "import type { DemoUserId } from '../lib/demoFinanceMap';",
    "import type { DemoUserId } from '../lib/demoFinanceMap';\nimport { buildPersonalSnapshot, comparePersonal, type PersonalProjection } from '../lib/personalFinance';",
  ],
  [
    `  const liveProjection = backend?.key === backendKey ? backend.result : null;
  const projection = MODE === 'demo' ? (liveProjection || localProjection) : localProjection;`,
    `  const liveProjection = backend?.key === backendKey ? backend.result : null;
  // USER mode: explicitly consent before sending ONLY numerical facts/schedules.
  // Local (browser) calculation remains available when declined or offline,
  // and is never misrepresented as a Python/AI result.
  const personalSnapshot = useMemo(() => {
    if (MODE === 'demo') return null;
    try { return buildPersonalSnapshot(s, APP_TODAY); } catch { return null; }
  }, [s]);
  const personalKey = personalSnapshot
    ? JSON.stringify([personalSnapshot, amount, period, supportedPayment]) : '';
  const [personalData, setPersonalData] = useState<{
    key: string; value: PersonalProjection;
  } | null>(null);
  const [personalStatus, setPersonalStatus] = useState<'idle' | 'loading' | 'error' | 'declined' | 'unsupported'>('idle');
  useEffect(() => {
    if (MODE === 'demo' || !valid || !personalSnapshot || !supportedPayment) {
      setPersonalData(null);
      if (MODE !== 'demo' && !supportedPayment) setPersonalStatus('unsupported');
      return;
    }
    const key = 'moa.personalUploadConsent.v1';
    let allowed: string | null = null;
    try { allowed = window.sessionStorage.getItem(key); } catch { /* private mode */ }
    if (!allowed) {
      allowed = window.confirm(
        '내 금융 정보 중 잔액·월급·결제일·예정 거래 금액만 서버에 보내 계산할까요?\\n' +
        '이름·상점명·계좌번호·과거 가계부는 보내지 않으며 서버는 입력값을 저장하지 않습니다.\\n' +
        '취소하면 이 화면의 앱 내부 계산만 사용합니다.'
      ) ? 'yes' : 'no';
      try { window.sessionStorage.setItem(key, allowed); } catch { /* private mode */ }
    }
    if (allowed !== 'yes') {
      setPersonalData(null); setPersonalStatus('declined');
      return;
    }
    const controller = new AbortController();
    let live = true;
    const timer = window.setTimeout(() => controller.abort(), 20000);
    setPersonalData(null); setPersonalStatus('loading');
    void comparePersonal(personalSnapshot, amount, period, controller.signal)
      .then(value => {
        if (live && !controller.signal.aborted) {
          setPersonalData({ key: personalKey, value }); setPersonalStatus('idle');
        }
      }).catch(() => {
        if (live) { setPersonalData(null); setPersonalStatus('error'); }
      }).finally(() => window.clearTimeout(timer));
    return () => { live = false; controller.abort(); window.clearTimeout(timer); };
  }, [personalKey]);
  const personalProjection = personalData?.key === personalKey ? personalData.value : null;
  const projection = MODE === 'demo'
    ? (liveProjection || localProjection)
    : (personalProjection || localProjection);`,
  ],
  [
    `    : projection.actual === 'bought' ? '기록된 구매와 구매하지 않은 경우를 현재 잔액 기준으로 비교했어요.'
    : selected ? '현재 구매하지 않은 상태를 기준으로, 오늘 샀다면 어땠을지 계산했어요.'
    : '실제 거래가 아닌 예시 금액으로 두 가지 선택을 연습해요.';`,
    `    : personalProjection ? '직접 입력한 금융 데이터 기준 · Python 서버 계산 · 규칙 기반 가정(ML 아님)'
    : personalStatus === 'declined' ? '서버 전송을 선택하지 않았어요. 현재 앱 내부 계산 결과예요.'
    : personalStatus === 'error' ? '서버에 연결하지 못했어요. 현재 앱 내부 계산 결과예요.'
    : personalStatus === 'unsupported' ? '신용카드·현금은 출금일 확인이 필요해요. 현재 앱 내부 계산이에요.'
    : personalStatus === 'loading' ? '백엔드 계산 중이에요. 아래 숫자는 앱 내부 계산이며 서버 결과가 아니에요.'
    : '입력한 잔액·월급·필수결제에 따른 앱 내부 계산이에요.';`,
  ],
  [
    `{MODE === 'demo' ? '백엔드의 급여·필수 결제·예측 변동지출을 동일하게 적용한 가상 비교예요. 미구매 금액은 투자 수익이 아니라 남아 있는 현금이에요.' : '등록된 급여·필수결제·거래 일정을 동일하게 적용한 비교예요. 미래 변동지출은 제외했어요. 미구매 금액은 수익이 아니라 남아 있는 소비 예산이에요.'}`,
    `{MODE === 'demo' ? '백엔드의 급여·필수 결제·예측 변동지출을 동일하게 적용한 가상 비교예요. 미구매 금액은 투자 수익이 아니라 남아 있는 현금이에요.' : personalProjection ? '입력한 잔액·월급·고정 결제·예정 거래를 Python 엔진으로 계산했어요. 월 예산은 아직 지출 예측에 넣지 않았고, 등록되지 않은 지출은 미포함이에요.' : '앱 내부 계산 결과예요. 실제 미래 결제 보장이 아니며 등록되지 않은 지출은 미포함이에요.'}`,
  ],
]);

patch('pages/Agent.tsx', [
  [
    "import type { DemoUserId } from '../lib/demoFinanceMap';",
    "import type { DemoUserId } from '../lib/demoFinanceMap';\nimport { APP_TODAY } from '../lib/store';\nimport { buildPersonalSnapshot, parsePersonalGoal, analyzePersonalGoal, type PersonalPath } from '../lib/personalFinance';",
  ],
  [
    `    const ai = await v4.agentAnalyze(user, g);`,
    `    if (MODE !== 'demo') {
      const parsed = parsePersonalGoal(g);
      if (!parsed) {
        toast('목표 금액을 숫자로 적어 주세요. 예: 20만 원짜리 책을 사고 싶어요.', 'info');
        setBusy(false);
        return;
      }
      let personal;
      try { personal = buildPersonalSnapshot(getState(), APP_TODAY); }
      catch {
        toast('입력한 잔액·급여·결제 일정의 숫자를 확인해 주세요.', 'error');
        setBusy(false); return;
      }
      const controller = new AbortController();
      const started = Date.now();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      try {
        // User-provided goal prose stays LOCAL; backend sees amount and intent only.
        const result = await analyzePersonalGoal(personal, parsed, controller.signal);
        if (runId !== runSequence.current) return;
        const label = {
          purchase_now: '지금 구매', no_purchase: '구매하지 않기',
          purchase_delay: '구매 30일 연기', virtual_savings: '가상 저축',
          virtual_investment: '가상 투자', mixed: '혼합 배분',
        };
        const routes: AgentRoute[] = result.routes.map((p: PersonalPath, i: number) => ({
          id: 'personal-' + p.scenario_id,
          label: label[p.scenario_id], kind: p.scenario_id,
          purchase_date: p.scenario_id === 'purchase_now' ? p.daily_cashflow[0]?.date
            : p.scenario_id === 'purchase_delay' ? p.daily_cashflow[29]?.date : null,
          payment_method: 'debit',
          purchase_amount: p.scenario_id.startsWith('purchase') ? parsed.amount : 0,
          savings_amount: p.scenario_id === 'virtual_savings' ? parsed.amount : 0,
          investment_amount: p.scenario_id === 'virtual_investment' ? parsed.amount : 0,
          purchase_delay_days: p.scenario_id === 'purchase_delay' ? 30 : 0,
          minimum_balance: p.minimum_balance,
          ending_balance: p.ending_balance,
          savings_goal_impact: 0, investment_profit_loss: 0,
          investment_risk: '가정치 · 수익 예측 없음',
          hard_constraints_met: true,
          checks: {
            essential_bills: p.essential_payments_covered,
            minimum_balance: p.minimum_balance_met,
          },
        }));
        const search: AgentSearch = {
          user_id: 'personal', as_of: result.as_of,
          forecast_source: '입력한 정기 결제 기반 규칙 계산 · ML 미사용',
          status: routes.length ? 'ok' : 'no_valid_route',
          routes, evaluated_count: result.evaluated_count,
          valid_count: result.valid_count,
          rejection_counts: result.rejection_counts,
          conflict_explanations: [],
          confirmations_required: result.confirmations_required,
          elapsed_ms: Date.now() - started,
          algorithm: 'stateless_user_entered_cashflow_rules',
        };
        const conditions = {
          purchase_amount: parsed.kind === 'purchase' ? parsed.amount : undefined,
          required_savings_amount: parsed.kind === 'savings' ? parsed.amount : undefined,
          investment_allowed: parsed.kind === 'investment',
          maximum_investment_amount: parsed.kind === 'investment' ? parsed.amount : 0,
          protect_essential_bills: true,
          allowed_payment_methods: ['debit'],
          user_id: 'personal', as_of: personal.as_of,
        };
        out = {
          source: 'engine', conditions, search,
          log: [
            { tool: 'extract_conditions', status: 'ok',
              arguments: { amount: parsed.amount } },
            { tool: 'get_financial_state', status: 'ok',
              arguments: { available_cash: personal.balance } },
            { tool: 'simulate_cashflow', status: 'ok',
              arguments: { model: '개인 입력 기반 규칙 엔진 · ML 아님' } },
            { tool: 'validate_constraints', status: 'ok',
              arguments: { valid: result.valid_count } },
          ],
        };
      } catch {
        if (runId === runSequence.current) {
          toast('개인 금융 분석 서버에 연결하지 못했어요. 시연용 S01 결과로 대신 표시하지 않았어요.', 'error');
        }
      } finally { window.clearTimeout(timeout); }
      if (runId === runSequence.current) {
        setRes(out); setBusy(false);
      }
      return;
    }
    const ai = await v4.agentAnalyze(user, g);`,
  ],
  [
    '<PageHeader title="AI 경로 탐색" />',
    '<PageHeader title={MODE === \'demo\' ? \'AI 경로 탐색\' : \'내 금융 경로 탐색\'} />',
  ],
  [
    'size={14} />AI 에이전트</span>',
    "size={14} />{MODE === 'demo' ? 'AI 에이전트' : '금융 계산 엔진'}</span>",
  ],
  [
    '<h1>목표를 말하면, 필수 결제를 지키는 경로만 찾아드려요</h1>',
    "<h1>{MODE === 'demo' ? '목표를 말하면, 필수 결제를 지키는 경로만 찾아드려요' : '내가 입력한 잔액으로 가능한 경로를 검증해요'}</h1>",
  ],
  [
    '<p>AI는 조건을 읽고 도구를 실행해요. 금액 계산과 결제 검증은 모아 계산 엔진이 해요.</p>',
    "<p>{MODE === 'demo' ? 'AI는 조건을 읽고 도구를 실행해요. 금액 계산과 결제 검증은 모아 계산 엔진이 해요.' : '금액·목표 종류만 분석 서버에 보내고 Python 규칙 엔진으로 계산해요. AI·ML 예측은 사용하지 않았어요.'}</p>",
  ],
  [
    '<button key={p.id} type="button" role="radio" aria-checked={user === p.id} className={user === p.id ? \'on\' : \'\'} onClick={() => {',
    '<button key={p.id} type="button" role="radio" disabled={MODE !== \'demo\'} aria-checked={user === p.id} className={user === p.id ? \'on\' : \'\'} onClick={() => {',
  ],
  [
    '<b>{p.label}</b><small>{p.sub}</small>',
    "<b>{MODE === 'demo' ? p.label : p.id === 'S08' ? '내 입력 데이터' : '시연 사용자 전용'}</b><small>{MODE === 'demo' ? p.sub : p.id === 'S08' ? '내 잔액·급여·결제 일정' : '데모 모드에서만 전환'}</small>",
  ],
  [
    '<p className="ag-foot">가상 사용자의 금융 데이터({Number(DEMO_AS_OF.slice(5, 7))}월 {Number(DEMO_AS_OF.slice(8))}일 기준)로 계산했어요. 수익률이 높다는 이유만으로 안전한 경로로 고르지 않아요.</p>',
    "<p className=\"ag-foot\">{MODE === 'demo' ? <>가상 사용자의 금융 데이터({Number(DEMO_AS_OF.slice(5, 7))}월 {Number(DEMO_AS_OF.slice(8))}일 기준)로 계산했어요. 수익률이 높다는 이유만으로 안전한 경로로 고르지 않아요.</> : <>내가 직접 입력한 금융 정보 기준의 규칙 기반 30일 가상 검증이에요. 서버는 입력값을 저장하지 않아요. 이 결과는 LLM·ML 분석이나 미래 투자 수익 예측이 아니에요.</>}</p>",
  ],
]);

patch('lib/bridge.js', [
  [
    "import { filledOrderKey, getPortfolioValidation, commitPortfolioValidation, readPortfolioValidation } from './portfolioSimulation';",
    "import { filledOrderKey, getPortfolioValidation, commitPortfolioValidation, readPortfolioValidation } from './portfolioSimulation';\\nimport { buildPersonalSnapshot, validatePersonalSixWorlds } from './personalFinance';",
  ],
  [
    "      if (MODE === 'demo') {\\n        ++worldSafetyRequest;\\n        if (activeSafetyAbort) activeSafetyAbort.abort();",
    "      if (MODE === 'demo' || MODE === 'user') {\\n        ++worldSafetyRequest;\\n        if (activeSafetyAbort) activeSafetyAbort.abort();",
  ],
  [
    "    triggerAiCoaching() {\\n      if (MODE === 'demo') {",
    `    triggerAiCoaching() {
      if (MODE !== 'demo') {
        const btn = document.getElementById('ai-trigger-btn');
        const box = document.getElementById('ai-insight-box');
        const target = document.getElementById('ai-insight-text');
        if (!btn || !box || !target) return;
        box.classList.remove('hidden');
        if (!originalSafetyButton) originalSafetyButton = btn.innerHTML;
        const consentKey = 'moa.personalUploadConsent.v1';
        let consent = null;
        try { consent = window.sessionStorage.getItem(consentKey); } catch { /* private mode */ }
        if (!consent) {
          consent = window.confirm(
            '입력한 잔액·월급·결제일·예정 거래 금액만 서버에 보내 90일 가상 검증을 할까요?\\n' +
            '이름·가맹점·계좌번호는 보내지 않고, 서버는 입력값을 저장하지 않습니다.'
          ) ? 'yes' : 'no';
          try { window.sessionStorage.setItem(consentKey, consent); } catch { /* private mode */ }
        }
        if (consent !== 'yes') {
          target.textContent = '서버 전송을 선택하지 않았어요. 90일 금융 검증은 실행하지 않았어요.';
          return;
        }
        let snapshot;
        try { snapshot = buildPersonalSnapshot(getState(), APP_TODAY); }
        catch {
          target.textContent = '직접 입력한 잔액·월급·결제 정보를 확인해 주세요.';
          return;
        }
        const requestId = ++worldSafetyRequest;
        const amount = Math.round(get.amount());
        const selected = get.selected();
        const delay = opt.delayMonths;
        activeSafetyAbort?.abort();
        const controller = new AbortController();
        activeSafetyAbort = controller;
        const timer = globalThis.setTimeout(() => controller.abort(), 25000);
        const label = btn.querySelector('span:last-child');
        btn.disabled = true;
        if (label) label.textContent = '내 입력값으로 90일 검증 중…';
        target.textContent = '내 잔액·월급·결제 일정으로 Python 금융 엔진이 여섯 경로를 계산하고 있어요.';
        const financeKey = JSON.stringify([snapshot, amount, selected, delay]);
        void validatePersonalSixWorlds(snapshot, amount, delay, controller.signal)
          .then(report => {
            if (requestId !== worldSafetyRequest || !c.root?.isConnected) return;
            let current;
            try { current = buildPersonalSnapshot(getState(), APP_TODAY); }
            catch { return; }
            if (JSON.stringify([current, Math.round(get.amount()), get.selected(), opt.delayMonths]) !== financeKey)
              return;
            const chosen = report.paths[selected - 1];
            if (!chosen) throw Error('personal_selected_world_missing');
            const states = { protected: '가정상 유지', shortfall: '자금 부족 위험',
              out_of_horizon: '90일 이후 · 미검증' };
            const all = report.paths.map((p, i) =>
              String(i + 1) + '.' + meta[i+1].name + ' ' + states[p.result]).join(' / ');
            target.textContent =
              '내 금융 입력값 · ' + report.asOf + ' 기준 · Python 규칙 계산 (ML 예측 아님)\\n' +
              meta[selected].name + ': ' + states[chosen.result] + ' · 90일 최소 잔액 ' +
              (chosen.minimumBalance === null ? '검증 범위 밖' : fmt(chosen.minimumBalance) + '원') +
              ' · 90일 말 잔액 ' +
              (chosen.endingCash === null ? '검증 범위 밖' : fmt(chosen.endingCash) + '원') +
              (chosen.firstShortfall ? ' · 처음 미달 가능일 ' + chosen.firstShortfall : '') +
              '\\n6개 경로: ' + all +
              '\\n※ 실제 결제 보장이 아닙니다. 1~10년 3D 수익 금액은 별도 가정이며 통장 현금에 포함하지 않습니다.';
            if (label) label.textContent = '90일 검증 결과';
          }).catch(() => {
            if (requestId !== worldSafetyRequest || !c.root?.isConnected) return;
            target.textContent = '백엔드 금융 검증에 실패했어요. 프론트의 장기 자산 가정을 검증 결과로 대신 사용하지 않았어요.';
            if (label) label.textContent = '검증 다시 하기';
          }).finally(() => {
            globalThis.clearTimeout(timer);
            if (requestId === worldSafetyRequest && c.root?.isConnected) {
              btn.disabled = false;
              activeSafetyAbort = null;
            }
          });
        return;
      }
      if (MODE === 'demo') {`,
  ],
]);
