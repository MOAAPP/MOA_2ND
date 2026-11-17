#!/usr/bin/env bash
# Shared build for the current MOA mobile frontend ZIP.
# 2026-11-15: 대시보드 홈 · 듀오링고형 학습 · 기록 기반 평행세계 · AI 에이전트(MOA_2ND_BE) · Discord 연결
# 테스트 주소 /demo (예시 기록) · 일반 사용자 / (빈 상태에서 온보딩)
set -euo pipefail
cd "$(dirname "$0")/.."

unzip -q releases/MOA_home_dashboard_ai_20261115.zip -d .
# Patch the ZIP source that Vercel actually deploys; root src/ is not built here.
# Only AI Agent data handling is changed. No JSX or CSS is modified.
node scripts/patch-agent-backend.mjs
# Replace only demo finance fixtures with authoritative S01/S08 FastAPI data.
node scripts/patch-demo-finance.mjs
# Canonical six-path FastAPI comparison for the existing A/B world graph.
node scripts/patch-world-backend.mjs
# The existing 3D diagnostic box now uses six-path 90-day FastAPI checks.
node scripts/patch-world-six-safety.mjs
# Keep the existing virtual product UI; calculate demo plans with FastAPI.
node scripts/patch-savings-backend.mjs
# Validate locally filled virtual ETF/stock trades with canonical portfolio FastAPI.
node scripts/patch-portfolio-backend.mjs
# USER mode: stateless personal-input finance and rules-goal endpoints (no S01/S08 data).
node scripts/patch-personal-input.mjs
# Review branch ONLY: UI hierarchy and result communication, no API / financial logic changes.
node scripts/patch-ux-journey.mjs
# 별도 검토 브랜치: 2차 사용자 경험 리디자인 (기능 및 API 변경 없음)
node scripts/patch-ux-journey-v2.mjs
sed -i 's/ES2020/ES2022/g' moa-web/tsconfig.json

cd moa-web
npm ci
npm run build
# Load review-only stylesheet after Vite-generated CSS so original styles stay intact.
node ../scripts/patch-ux-journey.mjs --postbuild
node ../scripts/patch-ux-journey-v2.mjs --postbuild
