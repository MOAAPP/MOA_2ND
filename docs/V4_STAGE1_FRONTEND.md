# V4 1단계 — 프론트엔드 연결

이 저장소 [MOAAPP/MOA_2ND](https://github.com/MOAAPP/MOA_2ND)는 React/Vite/PWA와 기존 Node 기반 시세·Discord API를 유지합니다. **Python 금융 계산 백엔드는 별도 저장소 [MOAAPP/MOA_2ND_BE](https://github.com/MOAAPP/MOA_2ND_BE)** 의 루트로 이동했습니다.

## 개발 환경

백엔드:
```sh
git clone https://github.com/MOAAPP/MOA_2ND_BE.git
cd MOA_2ND_BE
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

프론트엔드 (별도 터미널):
```sh
cd MOA_2ND
npm ci
npm run dev
```

개발 Vite 프록시:
- `/api/v4/*` → FastAPI `http://localhost:8000`
- 그 외 `/api/*` → 기존 Node API `http://localhost:8787` (변경 없음)

## 프로덕션 연결

1. `MOA_2ND_BE`를 독립적인 FastAPI 서비스로 배포합니다 (아직 미배포).
2. 백엔드에 `MOA_CORS_ORIGINS=https://parallel-bank.vercel.app` 또는 정확한 공개 프론트 origin을 설정합니다.
3. 프론트 빌드 환경변수 `VITE_FINANCE_API_BASE=https://<FASTAPI_URL>`를 설정하고 재배포합니다.
4. `GET https://<FASTAPI_URL>/api/v4/health` 정상 동작 및 PWA의 API 오류·로딩·성공 상태를 확인합니다.

`src/lib/financeApi.ts`: API 전용 클라이언트/타입.
`src/components/FinanceEnginePanel.tsx`: S01 합성 데이터에만 표시하는 금융 계산 패널.
`src/screens/V8Finance.tsx`: 기존 홈에 패널 연결.
`vite.config.ts`: 개발 프록시 경로 분리.

**범위 제한:** 이 패널은 합성 사용자 S01의 Python 계산만 보여줍니다. 기존 `src/lib/moa/`, `src/lib/cashflow.ts`, 가계부·차트의 TypeScript 계산은 기존 기능 보존을 위해 아직 교체하지 않았습니다. 따라서 두 계산 결과가 동일하다고 보장하지 않습니다. 실사용자 데이터의 Python 동기화, 전체 차트/평행세계 엔진의 API 단일화, 인증은 후속 단계에 해당합니다.

[백엔드 API·데이터 검증 문서](https://github.com/MOAAPP/MOA_2ND_BE/tree/main/docs)
