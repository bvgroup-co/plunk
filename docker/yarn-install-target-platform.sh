#!/usr/bin/env bash
set -euo pipefail

# Run Yarn install using the same Node base image as the Docker build stages,
# but force the *resolution* to match the target architecture.
#
# This prevents `yarn install --immutable` from failing during Docker builds
# when BUILDPLATFORM != TARGETPLATFORM (e.g. building linux/arm64 images from amd64).

TARGETPLATFORM="${TARGETPLATFORM:-}"
if [[ -z "$TARGETPLATFORM" ]]; then
  echo "TARGETPLATFORM is not set"
  exit 1
fi

case "$TARGETPLATFORM" in
  linux/amd64)
    export npm_config_platform=linux
    export npm_config_arch=x64
    export npm_config_libc=glibc
    ;;
  linux/arm64)
    export npm_config_platform=linux
    export npm_config_arch=arm64
    export npm_config_libc=glibc
    ;;
  *)
    echo "Unsupported TARGETPLATFORM: $TARGETPLATFORM"
    exit 1
    ;;
esac

echo "Running yarn install for TARGETPLATFORM=$TARGETPLATFORM (npm_config_arch=$npm_config_arch)"

# Keep immutable behavior.
yarn install --immutable
