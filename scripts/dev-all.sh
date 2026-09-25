#!/usr/bin/env bash
# Starts the operator API and the three front-ends. Logs go to .logs/. Ctrl-C stops all.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .logs
trap 'kill 0' EXIT INT TERM
npm -w operator run dev      > .logs/operator.log 2>&1 &
npm -w apps/wallet run dev   > .logs/wallet.log   2>&1 &
npm -w apps/pos run dev      > .logs/pos.log      2>&1 &
npm -w apps/lumbung run dev  > .logs/lumbung.log  2>&1 &
sleep 4
echo "Operator API  http://localhost:4600/health"
echo "Tandur wallet http://localhost:5171   (NIK 3310131310760001 / PIN 123456)"
echo "Tandur Kasir  http://localhost:5172   (kdmp-klaten / tandur123)"
echo "Lumbung       http://localhost:5173   (admin / lumbung123)"
wait
