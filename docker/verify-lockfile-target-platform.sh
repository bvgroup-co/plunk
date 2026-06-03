#!/usr/bin/env bash
set -euo pipefail

# This script is intended to be run inside the Docker build to ensure that
# the lockfile doesn't drift when Yarn resolves dependencies for a specific
# TARGETPLATFORM (e.g. linux/arm64) while running on a different BUILDPLATFORM.
#
# If Yarn would modify yarn.lock, we fail the build.

if [[ -z "${TARGETPLATFORM:-}" ]]; then
  echo "TARGETPLATFORM is not set"
  exit 1
fi

# Map Docker's TARGETPLATFORM to Yarn's supportedArchitectures values.
case "$TARGETPLATFORM" in
  "linux/amd64")
    export YARN_SUPPORTED_ARCHITECTURES_OS=linux
    export YARN_SUPPORTED_ARCHITECTURES_CPU=x64
    export YARN_SUPPORTED_ARCHITECTURES_LIBC=glibc
    ;;
  "linux/arm64")
    export YARN_SUPPORTED_ARCHITECTURES_OS=linux
    export YARN_SUPPORTED_ARCHITECTURES_CPU=arm64
    export YARN_SUPPORTED_ARCHITECTURES_LIBC=glibc
    ;;
  *)
    echo "Unsupported TARGETPLATFORM: $TARGETPLATFORM"
    exit 1
    ;;
esac

# Ensure deterministic behavior and fail if lockfile changes.
export YARN_ENABLE_IMMUTABLE_INSTALLS=1

# This should succeed without modifying yarn.lock.
yarn install --immutable

# Also verify we didn't modify the lockfile during install.
# (git isn't available in the image, so do a cheap checksum check)
# If yarn.lock changed, this will be caught by the immutable install anyway.
