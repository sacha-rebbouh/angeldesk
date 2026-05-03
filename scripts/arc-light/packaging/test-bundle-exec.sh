#!/usr/bin/env bash
# ARC-LIGHT Phase 0.5b - test that the extracted pdftoppm bundle runs inside
# a fresh AL2023 Lambda runtime container WITHOUT poppler-utils installed.
# This simulates what Vercel will do at runtime: only the bundled files are
# available, libs must resolve via LD_LIBRARY_PATH.
#
# Usage: ./test-bundle-exec.sh <bundle_dir> <pdf_path> <page_number>
set -euo pipefail

BUNDLE="${1:?usage: test-bundle-exec.sh <bundle_dir> <pdf_path> <page_number>}"
PDF="${2:?}"
PAGE="${3:?}"

if [ ! -x "$BUNDLE/bin/pdftoppm" ]; then
  echo "FATAL: $BUNDLE/bin/pdftoppm not found" >&2
  exit 1
fi
if [ ! -f "$PDF" ]; then
  echo "FATAL: PDF not found: $PDF" >&2
  exit 1
fi

docker run --rm --platform=linux/amd64 \
  --entrypoint=/bin/bash \
  -v "$BUNDLE:/opt/poppler:ro" \
  -v "$(dirname "$PDF"):/input:ro" \
  -v "/tmp/arc-light-spike:/output" \
  public.ecr.aws/amazonlinux/amazonlinux:2023 \
  -c "
    set -euo pipefail
    echo '--- clean runtime, no poppler-utils installed ---'
    rpm -q poppler-utils 2>&1 || true
    echo '--- verifying ldd resolution of bundled pdftoppm ---'
    LD_LIBRARY_PATH=/opt/poppler/lib ldd /opt/poppler/bin/pdftoppm 2>&1 | head -30
    echo '--- running bundled pdftoppm -v ---'
    LD_LIBRARY_PATH=/opt/poppler/lib /opt/poppler/bin/pdftoppm -v 2>&1 | head -3
    echo '--- rendering page $PAGE from e4n ---'
    LD_LIBRARY_PATH=/opt/poppler/lib /opt/poppler/bin/pdftoppm \
      -r 200 -png \
      -f $PAGE -l $PAGE \
      '/input/$(basename "$PDF")' \
      /output/bundled-page-$PAGE
    echo '--- output ---'
    ls -la /output/bundled-page-*.png
  "
