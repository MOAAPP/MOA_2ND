# 모아 앱 v5

사기 전에 두 세계(현실 · 평행세계)를 비교하는 React 앱입니다.

- `/` 처음 사용자(온보딩부터) · `/demo` 예시 기록이 있는 시연 계정
- 실행: `npm ci && npm run dev` (개발 서버는 `/api/v4` → `127.0.0.1:8000` FastAPI, `/api` → `127.0.0.1:8787` Node 서버로 프록시)
- 배포: 저장소 루트 `vercel.json` → `scripts/build-moa-app.sh`

## 연결된 API

| 화면 | API |
| --- | --- |
| 사기 전 비교(현실 카드·잔액 그래프) | `POST /api/v4/personal/compare` (MOA_2ND_BE 금융 엔진) |
| 비교 화면 AI 코치 | `POST /api/ai/coach` |
| 홈 AI 브리핑 | `POST /api/ai/brief` |
| 가계부 AI 요약 | `POST /api/ai/ledgerSummary` |
| 실험실 시세 | `GET /api/quotes`, `GET /api/quotes/:code` |
| 매수·매도 카드뉴스 | `POST /api/discord/trade-card` |
| 디스코드 데일리 카드뉴스 켜기/끄기 | `PUT/DELETE /api/daily/subscription` |
| 금융 공부 · 오늘의 1문제 | `GET/POST /api/v4/users/{S01|S08}/daily-quiz` |

서버가 응답하지 않으면 앱 안의 계산과 규칙 문장으로 그대로 동작합니다. AI 결과는 같은 입력이면 하루 동안 다시 부르지 않습니다.
