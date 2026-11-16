/**
 * Build-time bridge for the ZIP that production Vercel deploys.
 * DATA ONLY: copy adapter, hook it to the existing store and persona buttons.
 * Do not modify JSX structure, classes, CSS, assets, or screen layout.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
for (const name of ['demoFinanceMap.ts', 'demoFinance.ts']) {
  copyFileSync(resolve(root, 'integration', name), resolve(root, 'moa-web/src/lib', name));
}

function patch(filename, replacements) {
  const path = resolve(root, 'moa-web', filename);
  let text = readFileSync(path, 'utf8');
  for (const [before, after] of replacements) {
    if (text.includes(after)) continue;
    const at = text.indexOf(before);
    if (at < 0 || text.indexOf(before, at + before.length) >= 0) {
      throw new Error('[demo backend] Expected one code anchor: ' + filename + ' (' + before.slice(0, 55) + ')');
    }
    text = text.slice(0, at) + after + text.slice(at + before.length);
  }
  writeFileSync(path, text);
  console.log('[demo backend] Patched ' + filename);
}

patch('src/lib/store.ts', [
  [
    '// Small persistent app state (works without a backend; swap for API calls later).',
    "import { DEMO_AS_OF } from './demoFinanceMap';\n// Small persistent app state (works without a backend; swap for API calls later).",
  ],
  [
    'type State = {\n  onboarded: boolean;',
    "type State = {\n  demoUserId?: 'S01' | 'S08'; demoFinanceReady?: boolean;\n  onboarded: boolean;",
  ],
  [
    "export const APP_TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();",
    "export const APP_TODAY = MODE === 'demo' ? DEMO_AS_OF : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();",
  ],
  [
    "const DEMO: State = { ...DEFAULT, onboarded: true, learnAlert: { ...DEFAULT.learnAlert, discord: true, discordConsent: true } };",
    "const DEMO: State = { ...DEFAULT, onboarded: true, demoUserId: 'S01', demoFinanceReady: false,\n  profile: { ...DEFAULT.profile, name: 'S01', monthlyBudget: 0 },\n  finance: { balance: 0, minBalance: 0, salary: 0 },\n  txs: [], bills: [], savings: [], budgets: Object.fromEntries(Object.keys(DEFAULT_BUDGETS).map(k => [k, 0])),\n  learnAlert: { ...DEFAULT.learnAlert, discord: true, discordConsent: true } };",
  ],
]);

patch('src/lib/api.ts', [
  [
    "export const DEMO_AS_OF = '2026-11-04';",
    "import { DEMO_AS_OF } from './demoFinanceMap';\nexport { DEMO_AS_OF };",
  ],
]);

patch('src/lib/app.tsx', [
  [
    'createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode',
    'createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode',
  ],
  [
    "type AppApi = {",
    "import { MODE } from './store';\nimport { syncDemoFinance } from './demoFinance';\n\ntype AppApi = {",
  ],
  [
    '  }), [show, scrollerRef, frameRef]);\n\n  return (',
    "  }), [show, scrollerRef, frameRef]);\n\n  useEffect(() => {\n    if (MODE !== 'demo') return;\n    void syncDemoFinance().then(ok => {\n      if (!ok) show('가상 금융 서버 연결 실패 · 분석용 데이터를 불러오지 못했어요.', 'error');\n    });\n  }, [show]);\n\n  return (",
  ],
]);

patch('src/pages/Agent.tsx', [
  [
    "import { useStore, won } from '../lib/store';",
    "import { MODE, getState, useStore, won } from '../lib/store';\nimport { syncDemoFinance } from '../lib/demoFinance';\nimport type { DemoUserId } from '../lib/demoFinanceMap';",
  ],
  [
    "  const [user, setUser] = useState('S08');",
    "  const [personalDemoUser, setPersonalDemoUser] = useState<DemoUserId>('S08');\n  const syncedDemoUser = useStore(s => s.demoUserId ?? 'S01');\n  const user = MODE === 'demo' ? syncedDemoUser : personalDemoUser;",
  ],
  [
    "  const auto = useRef(false);",
    "  const auto = useRef(false);\n  const runSequence = useRef(0);",
  ],
  [
    "    if (g.length < 3 || busy) return;\n    setGoal(g); setBusy(true); setRes(null); setStep(0);",
    "    if (g.length < 3 || busy) return;\n    if (MODE === 'demo' && !state.demoFinanceReady) {\n      toast('가상 금융 데이터를 불러온 뒤 분석할 수 있어요.', 'error');\n      return;\n    }\n    const runId = ++runSequence.current;\n    setGoal(g); setBusy(true); setRes(null); setStep(0);",
  ],
  [
    "    const ai = await v4.agentAnalyze(user, g);",
    "    const ai = await v4.agentAnalyze(user, g);\n    if (runId !== runSequence.current || (MODE === 'demo' && getState().demoUserId !== user)) return;",
  ],
  [
    "      const sr = await v4.agentSearch(c);",
    "      const sr = await v4.agentSearch(c);\n      if (runId !== runSequence.current || (MODE === 'demo' && getState().demoUserId !== user)) return;",
  ],
  [
    '    setRes(out); setBusy(false);',
    "    if (runId !== runSequence.current || (MODE === 'demo' && getState().demoUserId !== user)) return;\n    setRes(out); setBusy(false);",
  ],
  [
    "onClick={() => { setUser(p.id); setRes(null); }}",
    "onClick={() => {\n              runSequence.current += 1;\n              setBusy(false); setRes(null); setStep(0);\n              if (MODE === 'demo') {\n                void syncDemoFinance(p.id as DemoUserId).then(ok => {\n                  if (!ok) toast('해당 사용자 금융 데이터를 불러오지 못했어요.', 'error');\n                });\n              } else {\n                setPersonalDemoUser(p.id as DemoUserId);\n              }\n            }}",
  ],
]);
