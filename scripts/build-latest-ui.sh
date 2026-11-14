#!/usr/bin/env bash
# Shared build for the current MOA mobile frontend ZIP.
set -euo pipefail
cd "$(dirname "$0")/.."

unzip -q releases/MOA_briefing_minimal_list_20261114.zip -d .
node scripts/patch-onboarding-primary-bank.cjs
node scripts/patch-home-remove-monograms.cjs
node scripts/patch-home-remove-quick-card-emoji.cjs
sed -i 's/ES2020/ES2022/g' moa-web/tsconfig.json

cd moa-web
npm ci
npm run build
