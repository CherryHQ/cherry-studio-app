#!/usr/bin/env bash
set -euo pipefail

build_id="${1:?Pass the EAS build ID}"
shift
if [[ $# -gt 1 || ( $# -eq 1 && $1 != --retry-upload ) ]]; then
  echo 'Usage: verifyEasIosSymbols.sh BUILD_ID [--retry-upload]' >&2
  exit 2
fi

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
pnpm exec eas build:view "$build_id" --json > "$scratch/build.json"
artifact_url=$(jq -er --arg id "$build_id" '
  select(.id == $id and .platform == "IOS" and .status == "FINISHED")
  | .artifacts.buildArtifactsUrl | select(type == "string" and startswith("https://"))
' "$scratch/build.json") || { echo 'This iOS build has no downloadable recovery package.' >&2; exit 1; }

if ! curl --fail --silent --location --proto '=https' --proto-redir '=https' --retry 3 \
  --connect-timeout 20 --max-time 1200 --output "$scratch/symbols" "$artifact_url"; then
  echo 'Could not download the recovery package. Retry with the same build ID.' >&2
  exit 1
fi
node --import tsx scripts/verifyIosSymbolPackage.ts "$scratch/symbols" "$build_id" "$@"
