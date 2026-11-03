# 변동 지출 ML 비교

앱은 기본으로 요일별 평균 기준선을 써요. LightGBM은 여기서 오프라인으로 비교하고, 채택 조건을 넘을 때만 앱의 예측 provider를 바꿔요.

```bash
pip install lightgbm pandas numpy
npx tsx scripts/eval/features.ts --real data/eval/*.json   # ml/data/features.csv
python ml/train_lgbm.py                                    # ml/out/predictions.csv, report.json
npx tsx scripts/eval/run.ts --ml ml/out/predictions.csv --real data/eval/*.json   # docs/eval/RESULTS.md
```

- 목표: 하루 변동 지출 합계, Tweedie(1.5), 미리 정한 조합 3개
- 입력: 요일, 공휴일, 다음 입금까지 일수, 마지막 입금 후 일수, 최근 7일 평균, 전날 지출, 관측 일수, 사용자 평균(학습 구간만). 잔액은 쓰지 않음
- 채택: 선택 구간 7일 누적 MAE가 두 기준선보다 모두 낮고, 사용자별로 엇갈리지 않을 때만 (`report.json`의 `adopt_ml`)
- 보고: 최종 평가 구간만. 합성 데이터 결과는 실데이터와 따로 표기
- `--real` 없이 돌리면 합성 사용자만 들어가요. 합성으로 학습·평가한 결과는 시뮬레이터 규칙을 다시 맞힌 것이라 성능 근거로 쓰지 않아요
