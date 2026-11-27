#!/usr/bin/env bash
# Builds and runs tools/movement-check.ts in Node (no browser). Exit code 1 when any case fails.
set -e
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)/movement-check.cjs"
../node_modules/.bin/esbuild tools/movement-check.ts --bundle --platform=node --outfile="$OUT" --log-level=error \
  --define:import.meta.glob=globalThis.__glob \
  --define:import.meta.env='{"DEV":false,"PROD":true,"MODE":"production","BASE_URL":"/"}' \
  "--banner:js=globalThis.__glob=()=>({});globalThis.window=globalThis;globalThis.localStorage={getItem(){return null},setItem(){}};globalThis.document={createElement(){return {getContext(){return null},style:{}}}};" \
  --loader:.png=empty --loader:.svg=empty --loader:.css=empty --loader:.webp=empty --loader:.glb=empty
node "$OUT"
