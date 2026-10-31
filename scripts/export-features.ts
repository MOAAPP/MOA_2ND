/**
 * 합성 사용자 특징량 CSV 내보내기: npx tsx scripts/export-features.ts > features_synthetic.csv
 * 합성 데이터는 실데이터와 따로 보고한다 (합성으로 학습·합성으로 평가하면 시뮬레이터 규칙을 다시 맞힌 것에 불과).
 */
import { addDays } from '../shared/dates';
import { splitUser } from '../src/core/evaluate';
import { buildFeatures, toCsv } from '../src/core/features';
import { labeledDays } from '../src/core/forecast';
import { generate, PERSONAS } from '../src/core/synthetic';

const rows = PERSONAS.flatMap((p) => {
  const u = generate(p);
  const labels = labeledDays(u.recorded, u.dayStatus);
  const split = splitUser(u.start, u.end)!;
  return buildFeatures(p.id, labels, u.recorded, u.setup.incomes, split.train.to, addDays(split.warmup.to, 1));
});
process.stdout.write(toCsv(rows) + '\n');
