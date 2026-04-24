#!/usr/bin/env bash
# ARC-LIGHT Phase 0.5b - extract pdftoppm + its shared libs from AL2023 install
# into a flat, self-contained bundle. Writes to $1 (default: /output).
#
# Output layout:
#   /output/bin/pdftoppm
#   /output/lib/*.so*  (all recursively required libs)
#   /output/MANIFEST   (list of files + total size + poppler version)
set -euo pipefail

OUT="${1:-/output}"
BIN_NAME="pdftoppm"
SRC_BIN="/usr/bin/${BIN_NAME}"

if [ ! -x "$SRC_BIN" ]; then
  echo "FATAL: $SRC_BIN not found. Is poppler-utils installed?" >&2
  exit 1
fi

mkdir -p "$OUT/bin" "$OUT/lib"
cp "$SRC_BIN" "$OUT/bin/${BIN_NAME}"

# Walk ldd output recursively to gather all required .so files except the
# dynamic linker itself and anything in /lib64/ld-*.so (provided by runtime).
collect_libs() {
  local bin="$1"
  ldd "$bin" 2>/dev/null | awk '
    /=>/ && $3 ~ /^\// { print $3 }
    !/=>/ && $1 ~ /^\// { print $1 }
  '
}

# BFS over libs
declare -A seen
queue=("$OUT/bin/${BIN_NAME}")
while [ ${#queue[@]} -gt 0 ]; do
  current="${queue[0]}"
  queue=("${queue[@]:1}")
  for lib in $(collect_libs "$current"); do
    base=$(basename "$lib")
    # Skip the dynamic loader (provided by target runtime libc)
    if [[ "$base" == ld-linux* || "$base" == linux-vdso* || "$base" == ld-*.so* ]]; then
      continue
    fi
    if [ -z "${seen[$base]+x}" ]; then
      seen[$base]=1
      cp -L "$lib" "$OUT/lib/$base"
      queue+=("$OUT/lib/$base")
    fi
  done
done

# Strip binaries + libs to minimize bundle size (keep symbols out of production)
find "$OUT/bin" "$OUT/lib" -type f -exec strip --strip-unneeded {} + 2>/dev/null || true

POPPLER_VERSION="$("$OUT/bin/${BIN_NAME}" -v 2>&1 | sed -n '1p' || true)"

# MANIFEST
{
  echo "# ARC-LIGHT Poppler AL2023 bundle"
  echo "built_at=$(date -u +%FT%TZ)"
  echo "poppler_version=${POPPLER_VERSION:-unknown}"
  echo "arch=$(uname -m)"
  echo ""
  echo "## files"
  (cd "$OUT" && find . -type f -printf '%s\t%p\n' | sort -nr)
  echo ""
  echo "## totals"
  echo "total_bytes=$(du -sb "$OUT" | cut -f1)"
  echo "file_count=$(find "$OUT" -type f | wc -l)"
} > "$OUT/MANIFEST"

echo "--- extract.sh done ---"
cat "$OUT/MANIFEST"
