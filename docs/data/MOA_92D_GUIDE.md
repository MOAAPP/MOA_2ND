# MOA 공통 가상 데이터 — 92일 (2026-09-11 ~ 2026-12-11)

DB 없이 프론트와 Python/FastAPI 팀이 **같은 합성 데이터를 사용**할 수 있도록 정리한 최종 버전입니다.

## 남기는 파일 (총 9개)

| 목적 | 파일 |
|---|---|
| **공통 JSON 원본 (10명, 92일)** | `public/data/moa-92days.json` |
| **Python용 거래 데이터** | `public/data/moa-92days-transactions.csv` |
| **Python용 일별 데이터** | `public/data/moa-92days-daily.csv` |
| 가상 사용자 프로필 | `public/data/moa-92days-profiles.csv` |
| 가상 선택 기록 | `public/data/moa-92days-choices.csv` |
| 가상 투자 체결 | `public/data/moa-92days-investments.csv` |
| 프론트 예시 1명(S01) | `src/data/moa-demo-s01.json` |
| **재생성 스크립트** | `scripts/data/build-moa-dataset.mjs` |
| 팀원 설명서 | `docs/data/MOA_92D_GUIDE.md` |

재생성은 프로젝트 최상위에서 `node scripts/data/build-moa-dataset.mjs` **한 번** 실행합니다. API, DB, 인증 정보 또는 실제 사용자 금융정보가 필요하지 않습니다. 고정 난수 시드로 항상 동일한 결과를 생성합니다.

배포된 웹의 `/data/moa-92days.json` 경로로 모든 10명의 데이터를 받을 수 있습니다. 앱 예시 체험은 S01의 **2026-11-04까지의 가상 과거 기록만** 사용하며, 미래 시나리오는 실제 가계부 내역으로 노출하지 않습니다.

## 데이터 구성

- 1차 46일: **9월 11일~10월 26일**
- 2차 46일: **10월 27일~12월 11일**
- 동일 사용자 ID: **S01~S10**
- 날짜별 분석 단위: **user_id × date, 총 920행**
- `daily`의 train: 9월 11일~10월 20일 (40일)
- validation: 10월 21일~10월 27일 (7일)
- test: 10월 28일~11월 4일 (8일)
- future_scenario: 11월 5일~12월 11일 (37일)

## AI 개발에서 반드시 지킬 것

1. 전체 데이터가 **합성 데이터**입니다. 과거 구간이라고 해도 실제 은행 기록이 아닙니다. 실사용자 정확도로 주장하지 않습니다.
2. `future_scenario=true`인 날은 관측되지 않은 가상 미래입니다. `model_label=null`, 거래의 `logged=false`이며 학습·테스트 정답에서 제외합니다.
3. `model_label=null`인 누락 지출일도 0원으로 보정하지 않습니다. `true_variable_spend`는 생성기만 아는 잠재 정답이므로 **AI 입력 feature에 사용 금지**입니다.
4. `kind=card_payment`는 이전 신용카드 소비의 **결제계좌 출금** 이벤트입니다. 신용 구매 시점과 청구 시점을 이중 차감하지 마세요.
5. `kind=transfer_self`는 잔액 부족을 메운 비상 이체입니다. 부족 위험 판단은 `pre_rescue_balance`를 함께 확인해야 합니다.
6. `choices`는 가상 구매·보류·대체 선택으로, 실거래 목록에 자동으로 중복 합산하지 않습니다.
7. `investments`는 가상 주식·ETF 매수·매도입니다. 주식 평가액은 총자산에는 포함해도 **매도 체결 전까지 소비 가능한 현금이 아닙니다**.
8. 시간순 분리(train → validation → test)와 기준시점 이전 거래만 사용해 정보 누수를 막습니다.

## 시나리오

S01 일반 대학생, S02 소득 지연, S03 주말 지출 집중, S04 기록 누락, S05 고정비 부담, S06 신용카드 비중 높음, S07 시험기간 소비 급증, S08 절약형, S09 불규칙 소득, S10 월말 잔액 부족.

데이터를 수정할 때는 **통합 생성 스크립트 하나만 변경**하고 재생성하세요. 1차·2차 중복 파일을 다시 만들지 않아도 됩니다.
