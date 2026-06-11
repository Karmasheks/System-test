#!/bin/sh
set -e

echo "[amvera-build] waiting for /git/client/index.html"
for i in $(seq 1 60); do
  if [ -f /git/client/index.html ]; then
    break
  fi
  sleep 2
done

if [ ! -f /git/client/index.html ]; then
  echo "[amvera-build] FATAL: /git/client/index.html missing after 120s"
  ls -la /git 2>/dev/null || echo "[amvera-build] /git does not exist"
  exit 1
fi

echo "[amvera-build] build in /git (full clone)"
cd /git

rm -rf dist project-source.tar.gz
npm install
npm run build

test -f dist/index.js || {
  echo "[amvera-build] FATAL: /git/dist/index.js missing"
  exit 1
}

echo "[amvera-build] copy dist/ -> /source/dist/"
rm -rf /source/dist
cp -a dist /source/dist

test -f /source/dist/index.js || {
  echo "[amvera-build] FATAL: /source/dist/index.js missing"
  exit 1
}

echo "[amvera-build] done"
