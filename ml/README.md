# 변동 지출 ML 비교

앱은 기본으로 요일별 평균 기준선을 써요. LightGBM은 여기서 오프라인으로 비교하고, 채택 조건을 넘을 때만 앱의 예측 provider를 바꿔요.

```bash
pip install lightgbm pandas numpy
npx tsx scripts/eval/features.ts --real data/eval/*.json   # ml/data/features.csv (실데이터만, 합성 제외)
python ml/train_lgbm.py                                    # ml/out/predictions.csv, report.json
npx tsx scripts/eval/run.ts --ml ml/out/predictions.csv --real data/eval/*.json   # docs/eval/RESULTS.md
```

- 목표: 하루 변동 지출 합계, Tweedie(1.5), 미리 정한 조합 3개
- 입력: 요일, 공휴일, 다음 입금까지 일수, 마지막 입금 후 일수, 최근 7일 평균, 전날 지출, 관측 일수, 사용자 평균(as_of 이전 정답일 누적 평균 — 시점별로 다시 계산해 미래 정보 누수 방지). 잔액은 쓰지 않음
- 데이터 분리: `--real`을 주면 합성은 기본으로 빠져요. 섞어야 하면 `--with-synthetic`, 학습에 섞을지는 `python ml/train_lgbm.py --train-source real|synthetic|all`. 선택·채택·보고는 실데이터가 있으면 실데이터 행만 써요
- 채택: 선택 구간 7일 누적 MAE가 두 기준선보다 모두 낮고, 사용자별로 엇갈리지 않을 때만 (`report.json`의 `adopt_ml`)
- 보고: 최종 평가 구간만. 합성 데이터 결과는 실데이터와 따로 표기
- `--real` 없이 돌리면 합성 사용자만 들어가요. 합성으로 학습·평가한 결과는 시뮬레이터 규칙을 다시 맞힌 것이라 성능 근거로 쓰지 않아요

## 앱 연결 (채택된 경우만)

`assessRisk(state, now, today, { external })`에 `ExternalForecast { modelVersion, inputDataUntil, daily[] }`를 넣으면 예측 줄을 그 값으로 만들어요.
계산 범위의 날짜가 하나라도 빠지거나, 금액이 음수·비정상이거나, 입력 기록이 7일 넘게 묵었으면 요일별 평균으로 돌아가고 `forecast.meta.fallbackReason`에 이유를 남겨요.
모든 예측 결과에는 `forecast.meta`(source, modelVersion, generatedAt, inputDataUntil)가 붙어요.
Python 모델을 실시간으로 쓰려면 별도 추론 서비스가 필요해요. 순서: 오프라인 평가 통과 → 같은 입력 재현성 확인 → 추론 API 연결 → 실패 시 기준선 복귀.

## 지금 결과 (2026-11-03, 합성 10명)

`report.json`의 `adopt_ml: false` — 선택 구간 7일 누적 MAE가 LightGBM 37,265원, 7일 평균 37,111원, 요일별 평균 41,583원으로 7일 평균을 넘지 못했어요. 그래서 앱은 요일별 평균을 유지해요.
합성으로 학습·평가한 결과라 실제 사용자 성능 근거가 아니에요. 실데이터를 모으면 같은 명령으로 다시 돌려요.
