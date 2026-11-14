#!/usr/bin/env bash
# Shared build for the current MOA mobile frontend ZIP.
# 2026-11-15: 대시보드 홈 · 듀오링고형 학습 · 기록 기반 평행세계 · AI 에이전트(MOA_2ND_BE) · Discord 연결
# 테스트 주소 /demo (예시 기록) · 일반 사용자 / (빈 상태에서 온보딩)
set -euo pipefail
cd "$(dirname "$0")/.."

unzip -q releases/MOA_home_dashboard_ai_20261115.zip -d .
sed -i 's/ES2020/ES2022/g' moa-web/tsconfig.json

cd moa-web
npm ci
npm run build
