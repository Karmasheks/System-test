#!/bin/sh
# Запуск на Amvera: additionalCommands: sh /git/scripts/amvera-build.sh
set -e

echo "[amvera-build] start in /git"
cd /git

rm -rf node_modules dist project-source.tar.gz
npm install
npm run build

test -f dist/index.js || (echo "[amvera-build] FATAL: dist/index.js missing" && exit 1)

echo "[amvera-build] dist OK, syncing /git -> /source"
rsync -a /git/ /source/ --exclude .git

test -f /source/dist/index.js || (echo "[amvera-build] FATAL: /source/dist/index.js missing" && exit 1)
echo "[amvera-build] done"
