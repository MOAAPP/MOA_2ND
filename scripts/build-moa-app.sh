#!/usr/bin/env bash
# /      : 처음 사용자 (온보딩부터)
# /demo  : 예시 기록이 채워진 시연 계정
# API    : /api/v4/* → api/moa-gateway.mjs → EC2 FastAPI(MOA_2ND_BE)
#          /api/*    → api/index.mjs (시세 · AI 문장 · Discord)
set -euo pipefail
cd "$(dirname "$0")/../moa-app"
npm ci --no-audit --no-fund
npm run build
cd ..
npm run bundle:api
