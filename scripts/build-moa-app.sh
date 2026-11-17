#!/usr/bin/env bash
# 2026-11-17 모아 앱 v5 (React 새 버전) — 두 세계 비교 중심 흐름
# /      : 처음 사용자 (온보딩부터)
# /demo  : 예시 기록이 채워진 시연 계정
# API    : /api/v4/* → api/moa-gateway.mjs → EC2 FastAPI(MOA_2ND_BE)
#          /api/*    → api/index.mjs (시세 · AI 문장 · Discord)
# 이전 화면 빌드는 scripts/build-latest-ui.sh 에 그대로 남아 있습니다.
set -euo pipefail
cd "$(dirname "$0")/../moa-app"
npm ci --no-audit --no-fund
npm run build
