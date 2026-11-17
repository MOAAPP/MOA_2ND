# MOA · 평행통장

20대를 위한 소비 선택·날짜별 현금흐름 비교·평행세계 시뮬레이션·금융 학습 서비스입니다.

**서비스:** https://parallel-bank.vercel.app

## 저장소 구성

| 위치 | 역할 |
|---|---|
| `moa-app/src/` | 현재 Vercel에서 제공하는 React 앱 |
| `server/`, `shared/` | Node 금융 AI API·공통 계산/프롬프트 |
| `api/moa-gateway.mjs` | 동일 도메인에서 EC2 FastAPI `/api/v4/*`로 요청을 전달하는 인증 프록시 |
| `scripts/`, `tests/` | 빌드·검증·합성 금융 AI 벤치마크 |
| `docs/` | 제품·교육·ML·검증·연구 문서 |

**백엔드:** [MOA_2ND_BE](https://github.com/MOAAPP/MOA_2ND_BE) (EC2 Docker FastAPI)

## 개발·검증

```bash
npm ci
npm run typecheck
npm test
bash scripts/build-moa-app.sh
```

Vercel은 `vercel.json`에 정의된 빌드를 사용합니다.

## 주요 문서

- [제품 기획](docs/PRODUCT_SPEC.md)
- [디자인 및 UX 원칙](docs/DESIGN.md)
- [금융 엔진](docs/MOA_ENGINE.md)
- [금융 학습 커리큘럼](docs/CURRICULUM.md)
- [ML 연계](docs/ML_INTERFACE.md)
- [AI 품질·재현 가능한 검증](docs/AI_QUALITY_V10.md)
- [EC2 API 프록시 구조](docs/EC2_FASTAPI_GATEWAY.md)
- [연구 설계](docs/RESEARCH.md)
- [EC2 운영 모니터링](https://github.com/MOAAPP/MOA_2ND_BE/blob/main/docs/OPERATIONS_MONITORING.md)

**배포 주의:** `MOA_FASTAPI_ORIGIN`은 EC2 HTTPS 주소입니다. Vercel 서버 전용 `MOA_PROXY_SHARED_KEY`가 없는 동안 API 프록시는 과거 호환 API 서버를 사용할 수 있습니다. 공유 인증 키는 Vercel과 EC2에만 저장하고 브라우저 환경변수(`VITE_*`)에는 넣지 마세요.
