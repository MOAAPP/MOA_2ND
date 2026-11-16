/**
 * Apply backend-only behavior fixes to the actual deployed moa-web source.
 *
 * Production currently builds releases/MOA_home_dashboard_ai_20261115.zip,
 * NOT the repository's root src/. Keep all JSX/layout/CSS unchanged.
 * Fail loudly when upstream ZIP changes so a stale patch never ships silently.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('moa-web');

function replaceOnce(source, before, after, filename) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index === -1 || source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`[agent integration] Expected exactly one source anchor in ${filename}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function patch(filename, replacements) {
  const path = resolve(root, filename);
  const original = readFileSync(path, 'utf8');
  let updated = original;
  for (const [before, after] of replacements) {
    updated = replaceOnce(updated, before, after, filename);
  }
  if (updated !== original) writeFileSync(path, updated);
  console.log(`[agent integration] ${filename}: ${updated === original ? 'already patched' : 'patched'}`);
}

// Only accept well-formed FastAPI responses. Never treat a 200 HTML/error JSON
// as real financial advice or let it crash the existing results page.
patch('src/lib/api.ts', [
  [
`  agentAnalyze: (user: string, goal: string) => call<AgentAnalyze>('/api/v4/agent/analyze', {
    method: 'POST', timeout: 45000, body: { user_id: user, as_of: DEMO_AS_OF, goal },
  }),`,
`  agentAnalyze: async (user: string, goal: string) => {
    const result = await call<AgentAnalyze>('/api/v4/agent/analyze', {
      method: 'POST', timeout: 45000, body: {
        user_id: user, as_of: DEMO_AS_OF, goal, max_evaluations: 72,
      },
    });
    return result && result.search && Array.isArray(result.search.routes) &&
      Array.isArray(result.tool_execution_log) &&
      Number.isFinite(result.search.evaluated_count) &&
      Number.isFinite(result.search.valid_count) ? result : null;
  },`
  ],
  [
`  agentSearch: (conditions: GoalConditions) => call<AgentSearch>('/api/v4/agent/search', {
    method: 'POST', timeout: 20000, body: { conditions, max_results: 3 },
  }),`,
`  agentSearch: async (conditions: GoalConditions) => {
    const result = await call<AgentSearch>('/api/v4/agent/search', {
      method: 'POST', timeout: 20000, body: { conditions, max_results: 3 },
    });
    return result && Array.isArray(result.routes) &&
      Number.isFinite(result.evaluated_count) &&
      Number.isFinite(result.valid_count) ? result : null;
  },`
  ]
]);

// The previous fallback displayed a canned S01/S08 analysis for ANY user's
// new question when both live APIs failed. Use the app's existing toast instead.
// There are NO JSX, style, markup, positioning, or screen-layout changes.
patch('src/pages/Agent.tsx', [
  [
    "import snapshot from '../data/agent-snapshot.json';",
    "import { useApp } from '../lib/app';",
  ],
  [
    "  const [params] = useSearchParams();\n  const state = useStore((s) => s);",
    "  const [params] = useSearchParams();\n  const { toast } = useApp();\n  const state = useStore((s) => s);",
  ],
  [
`    if (!out) {
      const snap = (snapshot as Record<string, AgentSearch & { _conditions: Record<string, unknown> }>)[user];
      out = { source: 'saved', conditions: snap._conditions, search: snap, log: engineLog(snap._conditions as GoalConditions, snap) };
    }`,
`    if (!out) {
      toast('AI 금융 서버에 연결할 수 없어요. 예시 분석으로 대신 표시하지 않았어요.', 'error');
    }`,
  ],
]);
