# MOA 금융 프론트 → AWS FastAPI 연동

금융 프론트엔드는 이 저장소(`MOAAPP/MOA_2ND`)입니다. 발음학습 MOA 프론트(`MOAAPP/MOA_FE`)와 혼동하지 마세요.

## 구조

Browser → 같은 출처 `/api/v4/...` → Vercel Node Function `api/moa-gateway.mjs` → HTTPS EC2 Caddy → FastAPI `/api/v4/...`

- Browser는 API 키/게이트웨이 키를 받지 않습니다.
- FastAPI는 `MOA_GATEWAY_SECRET` 헤더를 검증합니다.
- Vercel은 서버 전용 `MOA_PROXY_SHARED_KEY`에서 같은 값을 읽어 요청에 추가합니다.
- Vercel의 `VITE_FINANCE_API_BASE`는 **설정하지 않거나 빈 값**이어야 동일 출처 프록시를 사용합니다.
- 기존 Node API `/api/(.*)`는 종전대로 유지합니다.

## Vercel 프로젝트 (parallel-bank)

Vercel Dashboard → `parallel-bank` → Settings → Environment Variables에서 두 값을 **Production과 Preview 모두** 등록합니다.

```text
MOA_FASTAPI_ORIGIN=https://3-107-190-215.sslip.io
MOA_PROXY_SHARED_KEY=<EC2의 MOA_GATEWAY_SECRET와 동일한 랜덤 토큰>
```

**절대 VITE_ 접두사를 붙이지 마세요.** 이 변수들은 빌드 출력이 아니라 Vercel 서버 함수에서만 사용합니다. 실제 시크릿은 Chat, GitHub, 브라우저 개발자도구에 붙여넣지 마세요.

EC2의 공인 IP가 바뀌면 `sslip.io` 호스트도 바뀌므로 `MOA_FASTAPI_ORIGIN`도 바꿔야 합니다. 장기적으로는 고정 도메인 + Elastic IP 또는 다른 고정 엔드포인트가 필요합니다.

## 빠른 검증

배포 후 금융 프론트 도메인에서 다음 URL을 호출합니다.

```text
https://parallel-bank.vercel.app/api/v4/health
https://parallel-bank.vercel.app/api/v4/ai/status
https://parallel-bank.vercel.app/api/v4/users/S01/home?as_of=2026-11-04
```

- 첫 번째는 공개 건강 상태 확인이라 초기 세팅 중에도 작동할 수 있습니다.
- 나머지는 **AWS의 게이트웨이 토큰 설정 + Vercel 서버 변수 설정**이 모두 끝나야 정상 작동합니다.
- AI는 EC2에 `MOA_AI_API_KEY`를 안전하게 설치해야 비로소 `llm_configured=true`가 됩니다.

## 주의

서버 측 토큰이 직접 EC2 API 접근을 제한하지만, 공개 Vercel 프록시 자체는 접근 가능한 URL입니다. FastAPI의 전역/사용자별 AI 호출량 제한이 과금 폭증을 완화하지만 **금액 기준 예산 제한은 아닙니다**. API 제공업체 콘솔의 프로젝트별 예산/사용량도 반드시 설정하세요.
