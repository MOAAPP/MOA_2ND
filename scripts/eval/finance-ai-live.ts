/**
 * Synthetic-only live benchmark for the deployed Node AI /api/ai/coach route.
 * Usage: MOA_AI_BENCH_URL=https://staging.example npx tsx scripts/eval/finance-ai-live.ts
 * Runs at most 8 serial requests to avoid quota spikes. Never uses personal financial data.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { AI_SCHEMAS } from '../../shared/aiSchemas';
import { numbersGrounded } from '../../shared/aiPrompts';
import { politeOutput } from '../../server/lib/ai';

const base = (process.env.MOA_AI_BENCH_URL || '').replace(/\/+$/, '');
if (!base || !/^https:\/\//.test(base)) {
  throw new Error('Set MOA_AI_BENCH_URL to an HTTPS staging host (no trailing slash).');
}
const inputs = [
  { item: '노트', category: '생활', price: 5000, frequency: 'once', usableNow: 180000, usableAfter: 175000, afterBills: 220000, yearGap: 5000, categorySpentThisMonth: 20000, categoryCount30: 1 },
  { item: '운동화', category: '패션', price: 90000, frequency: 'once', usableNow: 100000, usableAfter: 10000, afterBills: 120000, yearGap: 90000, categorySpentThisMonth: 60000, categoryCount30: 2 },
  { item: '전자기기', category: '쇼핑', price: 150000, frequency: 'once', usableNow: 100000, usableAfter: -50000, afterBills: 20000, yearGap: 150000, categorySpentThisMonth: 20000, categoryCount30: 1 },
  { item: '가방', category: '패션', price: 120000, frequency: 'once', usableNow: 50000, usableAfter: -70000, afterBills: -20000, yearGap: 120000, categorySpentThisMonth: 140000, categoryCount30: 4 },
  { item: '커피', category: '카페', price: 4500, frequency: 'daily', usableNow: 100000, usableAfter: 95500, afterBills: 180000, yearGap: 1642500, categorySpentThisMonth: 80000, categoryCount30: 18 },
  { item: '책', category: '문화·여가', price: 22000, frequency: 'once', usableNow: 60000, usableAfter: 38000, afterBills: 110000, yearGap: 22000, categorySpentThisMonth: 30000, categoryCount30: 2 },
  { item: '소액 구독', category: '구독', price: 8000, frequency: 'weekly', usableNow: 45000, usableAfter: 37000, afterBills: 75000, yearGap: 416000, categorySpentThisMonth: 33000, categoryCount30: 4 },
  { item: '생활용품', category: '생활', price: 27000, frequency: 'once', usableNow: 50000, usableAfter: 23000, afterBills: 42000, yearGap: 27000, categorySpentThisMonth: 11000, categoryCount30: 1 },
];
type Result = { case: number; ms: number; http: number; schema: boolean; polite: boolean; grounded: boolean; actionable: boolean; reason: string | null };
const results: Result[] = [];
for (const [i, input] of inputs.entries()) {
  const t0 = performance.now();
  let http = 0, data: unknown, reason: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(base + '/api/ai/coach', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }), signal: controller.signal,
      });
      http = response.status;
      const body = await response.json() as { data?: unknown; error?: { code?: string } };
      data = body?.data;
      if (!response.ok) reason = body?.error?.code ?? 'http_error';
    } finally { clearTimeout(timer); }
  } catch { reason = 'network_or_timeout'; }
  const valid = AI_SCHEMAS.coach.output.safeParse(data);
  const schema = http === 200 && valid.success;
  const polite = schema && politeOutput('coach', valid.data);
  const grounded = schema && numbersGrounded('coach', input, valid.data);
  const actionable = schema && Boolean(
    (valid.data as { tip?: string | null }).tip?.trim() ||
    /(확인|비교|검토|살펴|조정|보류)/.test((valid.data as { message: string }).message),
  );
  results.push({ case: i + 1, ms: Math.round(performance.now() - t0),
    http, schema, polite, grounded, actionable, reason });
}
const sorted = results.map(x => x.ms).sort((a, b) => a - b);
const rate = (key: 'schema' | 'polite' | 'grounded' | 'actionable') =>
  Math.round(results.filter(x => x[key]).length / results.length * 100);
const report = {
  scope: '8 synthetic inputs, 1 request per case, Node /api/ai/coach', target: base,
  createdAt: new Date().toISOString(), sampleCount: results.length,
  p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
  successRatePercent: rate('schema'), politeRatePercent: rate('polite'),
  groundedRatePercent: rate('grounded'), actionableHeuristicRatePercent: rate('actionable'), results,
  limitations: 'Live model quality and financial safety still require human-reviewed scenario evaluations. A heuristic is not a validity proof.',
};
await mkdir('reports', { recursive: true });
await writeFile('reports/finance-ai-live.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (rate('schema') < 100 || rate('polite') < 100 || rate('grounded') < 100) process.exitCode = 1;
