# 모아 연구 설계 (N14)

> 앱 안의 연구 기능(동의·무작위 배정·로깅·내보내기)이 무엇을 재는지, 어떻게 분석할지 정리한 문서.
> 코드: `src/lib/research/log.ts` (테스트 `tests/research.test.ts`), 화면: 설정 → 연구 참여(`src/screens/Research.tsx`).

## 1. 연구 질문
- **RQ1.** 사기 전에 소비의 미래 비용(이번 달 쓸 수 있는 돈, 다음 결제일 잔고, 1년 뒤 차이)을 보여주면 20대의 참기 선택이 늘어나는가?
- **RQ2.** 미래 비용을 본 사람은 참은 돈을 저축 상품으로 더 많이, 더 오래 옮기는가?
- **RQ3.** 미래 비용 노출이 앱 재방문(습관 형성)에 영향을 주는가?

## 2. 가설
| | 가설 | 주 지표 |
|---|---|---|
| H1 | A조건(미리보기)의 참기 비율이 B조건보다 높다 | holdRate |
| H2 | A조건은 결정 1건당 지킨 돈이 더 크다 | savedMedian |
| H3 | A조건은 예금·적금 중도해지율이 더 낮다 | earlyCloseRate |
| H4 | A조건은 재방문 간격이 더 짧다 | returnGapDaysMedian |

탐색 지표: 고민한 시간(previewDwellMedianMs), 납입 성실도(autopayRate), 레슨 완료 수.

## 3. 실험 설계
- **참가자 간(between-subjects) 2조건**, 무작위 배정 50:50.
  - **A · preview**: 지금 화면 그대로. 결정 화면(`Choose`)에서 1년 갈림길 그래프, 이번 달 쓸 수 있는 돈 변화, 결제일 잔고를 보여준다.
  - **B · control**: 같은 결정 화면에서 미래 비용 숫자를 숨긴다. 품목·가격과 선택지(참기·더 싸게·사기)만 보여주고, 결과 화면의 '1년 뒤' 값도 숨긴다.
- **배정 방법**: 기기마다 만든 무작위 참여 번호(`P-XXXXXX`)를 FNV-1a 해시해 짝/홀로 나눈다. 같은 번호는 늘 같은 조건.
  연구자가 모집 링크를 나눠서 배정하고 싶으면 `?arm=preview` / `?arm=control`을 붙인 링크를 쓴다(링크 값이 우선).
- **조건 확인**: 참여자 화면에는 조건이 보이지 않는다. 연구자는 `?researcher` 를 붙여 열면 연구 참여 화면에서 조건을 볼 수 있다. 내보낸 파일에는 항상 `arm`이 들어 있다.
- **기간**: 2주 현장 연구(권장). 시작 전 체험(예시 데이터) 사용은 `demo=1`로 표시돼 분석에서 뺀다.
- **표본 크기(참고)**: 참기 비율 차이 15%p(40% → 55%), α=.05, 검정력 .8 기준 조건당 약 170건의 결정. 1인 평균 결정 8건이면 조건당 22명 이상. 결정이 사람 안에 묶여 있으므로 아래 혼합모형으로 분석한다.

### 알려진 한계
- 조작은 '사기 전에' 결정 화면(`Choose`)에만 걸려 있다. 홈의 갈림길 실험실(`ParallelLab`), 과거 비교(`Decide`)에서도 미래 비용이 보이므로 B조건 참여자가 그 화면을 쓰면 오염된다. 연구 기간에는 참여자에게 홈 → '사기 전에 두 세계 비교하기'만 쓰도록 안내하거나, 이 화면들 방문을 따로 기록해 공변량으로 넣는다(후속 작업).
- 가상 돈이다. 실제 지출 행동과의 차이(가설적 편향)는 사후 설문으로 보완한다.
- 자기 선택 표본(앱을 깔고 동의한 사람)이라 일반화에 한계가 있다.

## 4. 이벤트 스키마 (`moa-research/1`)
모든 이벤트 공통 필드: `pid`, `arm`, `session`(몇 번째 접속), `seq`(1부터 연속), `at`(epoch ms, 내보낼 때 ISO), `demo`.

| type | 언제 | 필드 |
|---|---|---|
| `joined` / `left` | 동의 / 철회 | — |
| `session_start` | 앱을 열 때 1번 | — |
| `decision_preview` | 결정 화면에서 금액 입력 후 다음으로 | `price`, `freq`, `usableBefore`, `yearGap`(B조건은 0) |
| `decision_made` | 참기·더 싸게·사기 확정 | `choice`(hold·alt·buy), `price`, `paid`, `saved`, `freq`, `category`, `dwellMs`(미리보기부터 확정까지), `moved`(참은 돈을 모아 통장으로 옮겼는지) |
| `bank_join` | 예금·적금 가입 | `kind`, `productId`, `amount`, `months`, `fromSaved` |
| `bank_close_early` | 중도해지 | `kind`, `productId`, `heldDays`, `termMonths` |
| `bank_mature` | 만기 수령 | `kind`, `productId` |
| `autopay` | 날짜가 바뀌며 자동이체 처리 | `paid`, `missed`(건수) |
| `lesson_done` | 레슨 완료 | `lessonId` |

**저장하지 않는 것**: 이름·연락처, 품목 이름·메모 같은 자유 입력, 사진, 위치. 품목은 규칙 분류 카테고리로만 남긴다.
기기당 최대 5,000건(넘으면 오래된 것부터 지움).

## 5. 지표 정의 (`metrics()`)
- `holdRate` = (`choice`가 hold 또는 alt인 `decision_made`) / 전체 `decision_made`
- `pureHoldRate` = hold만 / 전체
- `savedTotal`, `savedMedian` = `saved` 합계, 참은 결정의 중앙값
- `returnGapDaysMedian` = 접속한 날(KST)들 사이 간격의 중앙값
- `earlyCloseRate` = `bank_close_early` / `bank_join`
- `autopayRate` = 자동이체 성공 / (성공 + 미납)
- `previewDwellMedianMs` = 결정 고민 시간 중앙값

## 6. 분석 계획
1. 참여자가 보낸 JSON/CSV를 합친다(`pid`가 키). `demo=1`, `type=left` 이후 이벤트는 뺀다.
2. **H1**: 결정 단위 로지스틱 혼합모형 `hold ~ arm + log(price) + freq + (1 | pid)`.
3. **H2**: `saved`가 0이 많은 분포라 hurdle 모형 또는 참은 결정만 대상으로 `log(saved) ~ arm + (1 | pid)`.
4. **H3**: 가입 단위 생존분석(중도해지까지 `heldDays`, 만기는 중도절단), 조건 비교 log-rank / Cox.
5. **H4**: 참여자 단위 Mann–Whitney U (`returnGapDaysMedian`).
6. 다중비교는 주 가설 4개에 Holm 보정.

## 7. 절차와 윤리
- 앱 안 동의 화면: 모으는 것 / 모으지 않는 것 / 무작위 화면 차이 / 언제든 철회 / 만 19세 이상 확인.
- 기록은 이 기기에만 쌓이고 서버로 자동 전송하지 않는다. 참여자가 연구 기간 끝에 파일을 내려받아 직접 제출한다(제출처는 모집 공고에 안내).
- 철회 시 "기록 지우기"를 고르면 기기에서 바로 삭제. 이미 제출한 파일은 참여 번호로 삭제를 요청받는다.
- 실제 모집 전 소속 기관 IRB 심의 대상인지 확인한다(행동 데이터 + 무작위 배정이 있으므로 최소 위험 심의 예상).
- 사후 설문(별도): 금융 이해력, 평소 소비 성향, 앱 사용성(SUS).

## 8. 재현성
- 모든 금액 계산은 순수 함수 + 단위 테스트(`tests/bank*.test.ts`, `tests/futureCost.test.ts`, `tests/research.test.ts`).
- 체험 데이터는 고정 규칙으로 만든다(`src/lib/demoWorld.ts`, `tests/demoWorld.test.ts`).
- 스키마를 바꾸면 `schema` 버전을 올리고 이 문서 §4를 먼저 고친다.
