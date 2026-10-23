#!/bin/sh
set -eu

MERMAID_SHARED_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../shared" && pwd)"

# syncFramework selects the Xcode device/simulator architectures and Debug/Release configuration.
# Do not run this during pod installation or JavaScript dependency installation.
"${MERMAID_SHARED_DIR}/gradlew" -p "${MERMAID_SHARED_DIR}" syncFramework \
  -Pkotlin.native.cocoapods.platform="${PLATFORM_NAME}" \
  -Pkotlin.native.cocoapods.archs="${ARCHS}" \
  -Pkotlin.native.cocoapods.configuration="${CONFIGURATION}"

mkdir -p "${PODS_CONFIGURATION_BUILD_DIR}/CherryMermaid.framework"
rsync -a --delete \
  "${MERMAID_SHARED_DIR}/build/cocoapods/framework/CherryMermaid.framework/" \
  "${PODS_CONFIGURATION_BUILD_DIR}/CherryMermaid.framework/"
