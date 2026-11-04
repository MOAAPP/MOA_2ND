# MOA 공통 합성 데이터 — 전체 92일 (1차 + 2차)

- **1차:** 2026-09-11 ~ 10-26 (46일), **2차:** 2026-10-27 ~ 12-11 (46일), **합계:** 92일 × 사용자 10명 = 920일별 행.
- **팀원 통합 원본:** `public/data/moa-92days.json` 또는 `src/data/moa-92days.json` (가상 사용자 S01~S10).
- **2차만:** `public/data/moa-half2.json`. CSV는 `public/data/moa-92days-{profiles,transactions,daily,choices,investments}.csv` 또는 `moa-half2-*.csv`로 제공.
- 생성 방식: `node scripts/data/build-half1.mjs` → `node scripts/data/build-half2.mjs`. DB/API/개인정보 필요 없음. seed 고정, 재현 가능.
- 프론트 체험은 경량 `src/data/moa-demo-s01.json` 사용. 2026-11-04까지의 합성 과거 거래만 포함. 모든 10명 공통 데이터는 `/data/moa-92days.json` 경로에서 읽을 수 있음.

## 매우 중요한 구분
- 오늘 기준 **2026-11-04까지도 모두 생성된 합성 과거**이고, 실사용자 관측 데이터가 아님.
- **2026-11-05~12-11은 가정한 미래 시나리오**. `future_scenario=true`, `split=future_scenario`, `logged=false`, `model_label=null`. 프론트 가계부에서 실제 지출처럼 표시하거나 ML 정답으로 사용 금지.
- 전체 일별 데이터 `daily`의 `split`: train 9/11~10/20 (40일), validation 10/21~10/27 (7일), test 10/28~11/4 (8일), future 11/5~12/11 (37일). 시간 누수 금지.
- `true_variable_spend`: 생성기가 아는 잠재 정답. 추론 입력 또는 학습 feature 금지. `observed_variable_spend`는 기록으로 관측한 가상 지출액. `model_label=null`인 날짜는 0원으로 대체 학습 금지.
- `transactions.kind=card_payment`: 신용카드 매입 지출과 달리 계좌에서 출금되는 카드 청구일. 구매 당일 계좌 차감과 결제일 차감을 이중 집계하지 말 것.
- `transactions.kind=transfer_self`: 잔액 부족 시 가상 비상 이체. 위험 분석은 **`pre_rescue_balance`**도 검토해서 부족 상황이 이체로 가려지지 않도록 할 것.
- `choices`: 가상 의사결정, 별도의 실제 소비 거래가 아니라 시나리오 기록. 동일 사용금액 중복 집계 금지.
- `investments`: 가상 주식·ETF 체결 기록. 매수한 돈은 현금에서 제외, 매도 체결된 뒤에만 다시 소비 가능. 시세 기반 평가액은 총자산에만 포함.
- 과거와 미래 모두 합성 데이터만으로 계산한 평가지표는 실제 서비스 정확성이라고 주장하지 말 것.

## 연속성
- 1차 마지막 날 2026-10-26의 `account_balance_eod`에서 2차 10월 27일 잔액을 이어감.
- 사용자 ID(S01~S10), 거래 ID, 날짜별 유니크 키, 주식 보유 수량 연속성을 검증.
