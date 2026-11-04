# 데이터 사전

## 공통

- 날짜: `YYYY-MM-DD`, 시간대 `Asia/Seoul`, 단위 `KRW` (정수)
- `user_id`: 합성 프로필 U01~U10
- `synthetic=true`: 실제 개인 정보·은행 거래 아님
- `split=train|validation|future_scenario`: 기준 날짜에 의한 구분

## observed_transactions.csv / future_scenario_transactions.csv

| 필드 | 의미 |
| --- | --- |
| id | 합성 거래 고유 ID |
| user_id | 합성 사용자 ID |
| date | 결제·입금·청구 날짜 |
| occurred_at | KST 현지 시각을 반영한 epoch milliseconds |
| kind | `income`, `fixed`, `spend`, `card_payment` |
| name | 인공 가맹점/항목 이름 |
| category | 카테고리 |
| amount_krw | 양의 금액, 수입·출금 방향은 `kind`로 판단 |
| method | `transfer`, `debit`, `credit`, `cash` |
| essential | 필수 출금 여부 |
| account_effect | 결제계좌 잔고에 영향을 주면 1 |
| observed | 기준일 이전 기록 중 사용자가 남긴 것으로 설정한 합성 기록이면 1 |
| scheduled | 정기 일정에 따라 발생했으면 1 |
| split | 학습/검증/미래 시나리오 |
| synthetic | 합성 여부 |

## daily_truth.csv

| 필드 | 의미 |
| --- | --- |
| user_id, date, split | 합성 사용자/날짜/분할 |
| actual_spending_krw | 시뮬레이터가 알고 있는 하루의 실제 변동 지출 합계 (**평가 정답**) |
| observed_spending_krw | 누락 제외, 관측된 변동 지출 합계. 미관측 날짜는 **빈 칸** |
| has_observation | 그날 기록된 변동 소비가 있으면 1, 아니면 0. 완전 기록 확인을 의미하지 않음 |
| true_open_balance_krw | 해당 날짜의 시뮬레이션 시작 결제계좌 잔액 (**정답**) |
| true_close_balance_krw | 해당 날짜의 시뮬레이션 종료 결제계좌 잔액 (**정답**) |
| shortfall_on_essential | 필수결제 이후 결제계좌가 0 미만인 순간이 있었으면 1 |
| synthetic | 합성 여부 |

## profiles.json

`initial_balance_2026_09_11`, `balance_as_of` (11/03 종료 시점), `schedule` (월급/고정결제), `simulated_income_delay_days` 등 테스트 설정을 제공합니다. 날짜별 정답 잔액은 `daily_truth.csv`에 있습니다.

**중요:** 관측되지 않은 날짜는 0원 지출이라고 결론 내리지 않습니다. 비교/학습 지표에는 관측 커버리지도 함께 보고해야 합니다.
