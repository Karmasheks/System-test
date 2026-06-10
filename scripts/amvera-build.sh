#!/bin/sh
set -e

echo "[amvera-build] waiting for /git/package.json"
for i in $(seq 1 60); do
  if [ -f /git/package.json ]; then
    break
  fi
  sleep 2
done

if [ ! -f /git/package.json ]; then
  echo "[amvera-build] FATAL: /git not ready after 120s"
  exit 1
fi

echo "[amvera-build] start in /git"
cd /git

rm -rf node_modules dist project-source.tar.gz
npm install
npm run build

test -f dist/index.js || (echo "[amvera-build] FATAL: dist/index.js missing" && exit 1)

echo "[amvera-build] syncing /git -> /source"
rsync -a /git/ /source/ --exclude .git

test -f /source/dist/index.js || (echo "[amvera-build] FATAL: /source/dist/index.js missing" && exit 1)
echo "[amvera-build] done"
