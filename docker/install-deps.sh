#!/usr/bin/env bash
set -euo pipefail

# In the Docker publish workflow, we build linux/arm64 and linux/amd64 images.
# The previous approach attempted to run `yarn install --immutable` in a stage
# pinned to BUILDPLATFORM, which can cause lockfile drift when the resolver
# behaves differently per architecture.
#
# The simplest reliable fix is to execute the dependency install on the same
# architecture that will run it (TARGETPLATFORM). This avoids cross-arch
# resolution and keeps `--immutable` stable.

echo "Installing dependencies on $(uname -m) for TARGETPLATFORM=${TARGETPLATFORM:-unknown}"

# Native addons such as msgpackr-extract can fall back to node-gyp even though
# they are optional at runtime. The deps stage should validate the immutable
# dependency graph without requiring a native build toolchain.
yarn install --immutable --mode=skip-build
