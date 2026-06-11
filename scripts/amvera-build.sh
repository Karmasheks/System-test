#!/bin/sh
set -e

cd /source

echo "[amvera-build] cwd=$(pwd)"
if [ -d .git ]; then
  echo "[amvera-build] git HEAD=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  git ls-tree HEAD client 2>/dev/null || true
fi

node prepare-amvera.mjs
npm run build

test -f dist/index.js || {
  echo "[amvera-build] FATAL: dist/index.js missing"
  exit 1
}

echo "[amvera-build] done"
