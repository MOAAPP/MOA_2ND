/** 합성 사용자 10명 부족 탐지 결과표: npx tsx scripts/synthetic-eval.ts */
import { generate, PERSONAS } from '../src/core/synthetic';
import { evaluateDetection, summarize } from '../src/core/syntheticEval';

const rows = PERSONAS.map((p) => {
  const u = generate(p);
  const r = evaluateDetection(u);
  return { ...r, type: p.type, tests: p.tests, labels: u.labels.length };
});
console.log('ID   유형            결제일  부족  탐지  놓침  불필요(높음)  불필요(주의)  평균사전탐지');
for (const r of rows) {
  const lead = r.leadDays.length ? (r.leadDays.reduce((s, v) => s + v, 0) / r.leadDays.length).toFixed(1) : '-';
  console.log(`${r.user}  ${r.type.padEnd(10)}  ${String(r.labels).padStart(5)}  ${String(r.shortEvents).padStart(4)}  ${String(r.detected).padStart(4)}  ${String(r.missed.length).padStart(4)}  ${String(r.falseHigh.length).padStart(11)}  ${String(r.falseCaution.length).padStart(11)}  ${lead.padStart(10)}`);
  for (const m of r.missed) console.log(`      놓침: ${m.date} ${m.label} (실제 최저 ${m.low.toLocaleString()}원)`);
}
console.log('\n합계', summarize(rows));
console.log('※ 합성 데이터 결과입니다. 실제 사용자 성능이 아니며, 사용자 테스트 인원에 넣지 않습니다.');
