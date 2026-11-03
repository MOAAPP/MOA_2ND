# 모아(MOA) 공통 합성 데이터셋 — 2026.09.11 ~ 12.11

> **실제 사용자·은행·주식 데이터가 아닌 100% 합성(synthetic) 데이터입니다.** 개인정보/계좌번호/실제 주문 없음.
> DB 없이 로컬 파일을 읽어 프론트엔드 시연, Python/FastAPI 개발, 모델 학습·테스트를 일관되게 수행하기 위한 공유 기준입니다.

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 기준 기간 | **2026-09-11 ~ 2026-12-11**, 양 끝 포함 **92일** |
| 사용자 | **S01~S10** 가상 대학생 10명 |
| 시간대·통화 | **Asia/Seoul (KST)**, KRW(원) |
| 생성 방식 | 고정 시드 `20260911` + 표준 Python 3 라이브러리, 매 실행 동일한 결과 |
| 기준일 | **2026-11-04** |
| 미래 구간 | **11/05~12/11**은 미래 **시뮬레이션**입니다. 실제 관측·실제 검증 결과가 아닙니다 |
| 저장소 | 없음 — CSV/JSON 정적 파일 |
| 프론트 시연 사용자 | **S01**, `src/data/moa92.json`을 정적으로 번들링 |
| 팀 공유 | 이 폴더의 `MOA_common_92days_team.zip` 또는 CSV/JSON 개별 파일 |

## 2. 파일 구성

| 파일 | 기본 단위(grain) | 용도 |
|---|---|---|
| `transactions.csv` | 1건의 합성 금융 거래 | 식비·카페·교통·월급·월세·신용카드 사용/대금 출금 |
| `daily.csv` | 1명 × 1일(10×92=920행) | 거래 합계, 결제계좌 잔액, 관측 여부, 부족 시나리오 |
| `choices.csv` | 1건의 가상 소비 선택 | 구매/보류/대안, 실제 지불액과 선택 간 금액 차이 |
| `investments.csv` | 1건의 가상 ETF 매매 | 매수·매도·수량·합성 단가, 포지션 재현 |
| `ml_features.csv` | 1명 × 예측 대상일 | **이전 14일 데이터만** 사용한 모델 특징 + 시뮬레이션 정답 |
| `profiles.json` | 1명 | 서로 다른 소비 유형·월급·고정비 특성 |
| `schedules.json` | 1명 | 예정 월급/월세/통신비/관리비와 의도적 입금 지연 |
| `frontend-demo.json` | S01의 전체 92일 데이터 | 프론트가 사용하는 공통 예시 자료 사본 |
| `manifest.json` | 데이터셋 1개 | 버전·시드·기간·파일별 행 수·주의 사항 |
| `MOA_common_92days_team.zip` | 위 파일 묶음 | 팀원 공유용 |
| `src/data/moa92.json` | S01의 전체 92일 데이터 | 프론트 번들 전용(위 사본과 동일) |

### 거래(`transactions.csv`) 주요 필드

- `id` 거래별 고유 ID. `user_id`는 합성 사용자(S01~S10) 식별자
- `date` (YYYY-MM-DD), `at_kst` (+09:00이 포함된 시각)
- `kind`: `spend`, `income`, `fixed_bill`, `card_payment`
- `amount_krw`: 항상 양수. `bank_delta_krw`: 결제계좌 잔액 증감(**음수는 출금**)
- `method`: `debit`, `credit`, `transfer`, `cash`
- `recorded=0`: 실제로는 발생하도록 생성했지만 앱에는 **기록되지 않았다고 가정한 거래**
- `essential=1`: 고정·필수 거래
- `stage`: `historical_synthetic` 또는 `future_scenario`

### 일별(`daily.csv`) 주요 필드

- `actual_variable_spend_krw`: 합성 시뮬레이터의 실제 발생 **정답(ground truth)**. 현실 사용자의 실제 지출이 아님
- `recorded_variable_spend_krw`: 앱에 기록된 지출만 집계
- `recorded_day`: 그날 적힌 지출이 하나라도 있는지 (0일 때는 **미기록/진짜 무지출을 구별할 수 없음**)
- `income_krw`, `fixed_paid_krw`, `card_paid_krw`: 계좌 출입금 합계
- `bank_delta_krw`, `bank_balance_end_krw`: 월급·고정비·체크카드 등 계좌 흐름을 반영
- `deficit_flag=1`: 해당 가상 사용자에게 자금 부족이 발생한 **시뮬레이션**. 음수 잔액은 실제 은행의 마이너스통장/대출이 아니라 **충족되지 못한 자금 수요**를 뜻함

## 3. Python AI 팀이 사용할 방법

별도 DB/외부 API/키 설치 없이 사용합니다.

```bash
python3 scripts/data/generate_common_92.py
python3 scripts/data/validate_common_92.py
```

```python
import csv
from pathlib import Path

p = Path("data/moa-2026-fall")
with (p/"ml_features.csv").open(encoding="utf-8-sig", newline="") as f:
    data = list(csv.DictReader(f))

train = [r for r in data if r["split"] == "train"]
valid = [r for r in data if r["split"] == "validation"]
future_sim = [r for r in data if r["split"] == "test_synthetic_future"]
# features = as_of_weekday, days_to_salary, days_to_rent,
#            observed_days_14, mean_recorded_14_krw, last_recorded_spend_krw,
#            prev_day_recorded
# target = target_actual_spend_krw (synthetic outcome)
```

**시간 누출 방지**

- `as_of_date`는 항상 `target_date` 전날입니다. 특징은 그 전까지의 **기록된** 거래에서만 계산합니다.
- `target_actual_spend_krw`, `target_recorded`, `target_stage`는 정답·진단용입니다. **입력 특징으로 사용하면 미래 정보 누출입니다.**
- `train`: 2026-09-25 ~ 10-20, `validation`: 10-21 ~ 11-04, `test_synthetic_future`: 11-05 ~ 12-11. **학습 전 데이터셋 전체를 무작위 셔플해서 분리하지 마세요.**
- `test_synthetic_future`는 합성 데이터로 시뮬레이션을 검사하는 용도이며 **2026년 11월 4일 현재 실제 미래 예측 적중률을 주장할 수 없습니다**.
- 기록이 없는 날을 지출 0원 정답으로 채우지 마세요. 모델 평가 시 실제 기록 여부와 합성 정답의 차이를 분리해 분석하세요.
- 모델은 고정 평균·요일별 평균 등 단순 기준선과 동일한 기간으로 비교하고, 개선이 확인되기 전에는 프론트에서 모델값을 우선 표시하지 마세요.

### FastAPI 연동 기본 계약(예정)

프론트는 기존 `VITE_ML_API_URL` 환경변수가 있을 때 `POST /forecast`, `POST /classify`를 호출할 수 있도록 되어 있습니다. 서버 모델은 **해당 요청의 현재 시각 이전 지출만 사용**해 예측하고 `src/lib/ml/types.ts`의 `SpendingForecast` 모양(`days[].date,p10,p50,p90`, `basis`, `engine` 등)에 맞추면 됩니다. **이번 데이터셋 구성만으로 FastAPI 서버를 자동 배포하는 것은 아닙니다.**

## 4. 프론트엔드에 포함되는 방식

- 온보딩에서 **예시로 둘러보기**를 누르면 `src/data/moa92.json`의 **S01 한 명**을 로드합니다.
- 가계부, 결제계좌 결제일 예측, 평행세계, 가상 ETF 보유·매수/매도 기록은 **같은 원본 데이터**의 서로 다른 표현입니다.
- 앱 방문 시각까지 발생한 데이터만 표시합니다. 예: 2026-11-04 접속 시 11/05~12/11 시뮬레이션 거래는 **실제 과거 소비/매매로 미리 표시되지 않습니다**.
- `demo=true`인 예시 상태에만 적용하며, 직접 입력한 사용자 기록은 덮어쓰지 않습니다.
- 모든 종목 가격은 합성 값입니다. 실제 시세나 투자 권유, 실제 주문으로 오인하면 안 됩니다.

## 5. 상황별 합성 사용자

S01 기본 대학생(프론트 대표), S02 작은 지출 반복, S03 주말 집중, S04 월급 지연, S05 식비 비중 큼, S06 결제일 잔액 부족, S07 불규칙 소비, S08 신용카드 사용 비중 큼, S09 월말 급증, S10 안정적 저축.

**검증 담당**: `scripts/data/validate_common_92.py`로 중복 ID, 92일 범위, 일별/거래별 계좌 합계, 관측 여부, 시간 누출, 가상 매도 수량, 원본 사본 일치 여부 확인.

## 6. 공유·저작권·보안

이 데이터는 모아 팀이 **직접 만든 합성 시나리오**입니다. 원자료는 위 생성 스크립트가 전부이며 외부 금융 데이터·개인정보를 복사하지 않았습니다. 브라우저 번들 안에 데이터가 들어 있으니 실제 주민등록번호, 전화번호, 계좌번호, API 키, 사용자 개인정보는 절대로 이 폴더에 넣지 마세요.
