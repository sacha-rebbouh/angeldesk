# ARC-LIGHT Phase 0.5 + 0.5b — Renderer spike report

**Date**: 2026-04-24
**Branch**: `arc-light/phase-0-5-renderer-spike`
**Timebox**: 2 h + 4-8 h sub-spike. Both closed inside timebox.
**Owner**: Sacha (decision), Claude (execution).
**Test PDF**: `/Users/sacharebbouh/Downloads/e4n - Confidential Presentation_BD.pdf`.

---

## TL;DR

**Poppler packaging on Vercel = CONFIRMED.**

- Poppler 24.08.0 from Amazon Linux 2023 dnf (`poppler-utils;24.08.0-1.amzn2023;x86_64`).
- Self-contained bundle: 52 files (1 binary + 51 shared libs), **35.1 MB uncompressed**, **14.4 MB gzipped**.
- Executed successfully inside a vanilla `public.ecr.aws/amazonlinux/amazonlinux:2023` container with `poppler-utils` NOT installed, using only `LD_LIBRARY_PATH=/opt/poppler/lib /opt/poppler/bin/pdftoppm`.
- All libs resolve from the bundle (except `/lib64/ld-linux-x86-64.so.2`, the dynamic linker, which is guaranteed by any AL2023 runtime).
- OCR gate PASS on the 3 e4n decision pages (16 / 21 / 31), each with its own must-contain list. Zero gibberish pattern. `isolatedTokenRatio ≤ 0.021` across the three.
- MuPDF was excluded before implementation — AGPL-3.0-or-later clause is a blocker for Angel Desk until/unless Artifex commercial license is acquired.

**Next step**: Sacha signs off → Phase 2 implementation (introduce `PdfRenderer` abstraction + Poppler adapter + `outputFileTracingIncludes` config in `next.config.ts`).

---

## Phase 0.5 — Rendering quality (recap)

| Renderer | Page 16 | Page 21 | Page 31 | Render latency macOS arm64 | OCR gate |
|---|---|---|---|---|---|
| Poppler `pdftoppm` via subprocess | PASS | PASS | PASS | ~1-2 s/page (incl. subprocess overhead) | PASS |
| MuPDF (`mupdf@1.27.0` npm WASM) | PASS | PASS | PASS | 71-169 ms/page (in-process) | PASS |

Both renderers eliminate the original `pdfjs-dist + pdf-to-img` gibberish.

---

## Phase 0.5b — Poppler Vercel packaging (the critical sub-spike)

### Build artifact (kept under `scripts/arc-light/packaging/`)

| File | Purpose |
|---|---|
| `Dockerfile` | `FROM public.ecr.aws/lambda/provided:al2023`; `dnf install poppler-utils binutils findutils`. Pinned to `--platform=linux/amd64` (Vercel default Lambda CPU). |
| `extract.sh` | BFS on `ldd` to recursively collect every shared lib `pdftoppm` transitively depends on; excludes the runtime-provided dynamic linker (`ld-linux*`, `linux-vdso*`); strips symbols; writes MANIFEST. |
| `test-bundle-exec.sh` | Runs a fresh `public.ecr.aws/amazonlinux/amazonlinux:2023` container with NO `poppler-utils` installed. Mounts the bundle read-only at `/opt/poppler` (the Lambda-like layer path). Sets `LD_LIBRARY_PATH=/opt/poppler/lib` and runs `/opt/poppler/bin/pdftoppm`. Validates `ldd` resolves every lib from the bundle, prints Poppler version, renders the requested e4n page at 200 DPI. |

### Build + extract run
```
docker build --platform=linux/amd64 -t arc-light-poppler-builder -f scripts/arc-light/packaging/Dockerfile scripts/arc-light/packaging
docker run --rm --platform=linux/amd64 -v /tmp/arc-light-spike/poppler-al2023:/output arc-light-poppler-builder /usr/local/bin/extract.sh /output
```

**Result**:
- Poppler version installed by AL2023 dnf: `poppler-utils;24.08.0-1.amzn2023;x86_64`
- Bundle contents: 52 files under `/tmp/arc-light-spike/poppler-al2023/`
  - `bin/pdftoppm` (43 KB stripped)
  - `lib/libpoppler.so.140` (principal lib)
  - `lib/*.so*` (50 more shared libs including `libcairo`, `libfreetype`, `libfontconfig`, `libjpeg`, `libpng16`, `libtiff`, `liblcms2`, `libopenjp2`, `libxml2`, `libssl`, `libcurl`, `libglib-2.0`, `libharfbuzz`, etc.)
- MANIFEST generated with versions, file sizes, total bytes.

### Bundle size

| Measure | Bytes | Human | vs limit |
|---|---|---|---|
| Uncompressed | 35,151,400 | 35.1 MB | **14% of the 250 MB Lambda function hard limit** (safe). |
| Compressed gzip | 14,388,135 | 14.4 MB | **29% of the Vercel Hobby 50 MB compressed function limit**; far below Pro/Enterprise plan limits. Plan-dependent risk, not universal. The hard stop is the 250 MB uncompressed, which we are 7x below. |

### Vanilla AL2023 execution test (critical)

```
docker run --rm --platform=linux/amd64 --entrypoint=/bin/bash \
  -v /tmp/arc-light-spike/poppler-al2023:/opt/poppler:ro \
  -v "$(dirname e4n.pdf):/input:ro" \
  -v "/tmp/arc-light-spike:/output" \
  public.ecr.aws/amazonlinux/amazonlinux:2023 \
  -c "...LD_LIBRARY_PATH=/opt/poppler/lib /opt/poppler/bin/pdftoppm ..."
```

Highlights from the run:
```
package poppler-utils is not installed     ← runtime confirmed clean
libpoppler.so.140      => /opt/poppler/lib/libpoppler.so.140
liblcms2.so.2          => /opt/poppler/lib/liblcms2.so.2
libstdc++.so.6         => /opt/poppler/lib/libstdc++.so.6
...all 30+ libs resolve from /opt/poppler/lib...
/lib64/ld-linux-x86-64.so.2                ← provided by runtime, OK
pdftoppm version 24.08.0
rendering page 16 from e4n → /output/bundled-page-16-16.png (401,312 bytes)
```

Every required shared object was resolved from the mounted `/opt/poppler/lib`. No missing system library. No fallback to host `/usr/lib*`. This is the exact pattern Vercel would see on a cold-started Lambda with the bundle attached via `outputFileTracingIncludes`.

### End-to-end OCR gate on the bundled-Poppler PNGs

`OPENROUTER_API_KEY=... npx tsx scripts/arc-light/spike-bundle-ocr.ts` — reads the 3 PNGs produced by the bundled binary (pages 16, 21, 31) and runs the OCR gate.

| Page | PNG size | OCR latency | isolatedTokenRatio | Gibberish regex | Must-contain | Verdict |
|---|---|---|---|---|---|---|
| 16 | 401,312 B | ~2 s | 0.008 | clear | all 5 present: `One-stop-shop Offering`, `Genesis`, `Vendors & Solutions`, `Customers`, `Virtuous cycle` | **PASS** |
| 21 | 280,778 B | ~3 s | 0.006 | clear | all 5 present: `High Growth Managed Services Segment`, `Net Revenue Retention`, `Churn`, `LTM Managed Services Revenue`, `# of Customers` | **PASS** |
| 31 | 319,285 B | ~1.5 s | 0.021 | clear | all 5 present: `Transactions Comps`, `EV/EBITDA`, `TEV`, `Genesis`, `Mean` | **PASS** |

GPT-4o self-attributed confidence is intentionally NOT a gate (per Sacha's rule 1) — only the 3 objective criteria above are checked.

### Licensing confirmation

| Renderer | License | Usage mode | Commercial obligation |
|---|---|---|---|
| Poppler 24.08.0 | GPL-2.0 / GPL-3.0 | Called via `child_process.execFile` → NOT linked into Angel Desk source | None. GPL contagion does not cross the subprocess boundary. Obligation limited to redistribution of the GPL binary itself (source/build offer accompanying the bundle), which we can satisfy by keeping `scripts/arc-light/packaging/Dockerfile` and `extract.sh` committed (they reproducibly build the binary). |
| MuPDF `mupdf@1.27.0` | **AGPL-3.0-or-later** | Would be `import * as mupdf from "mupdf"` → linked | Angel Desk source would be AGPL-obliged unless Artifex commercial license is acquired. **Excluded per Sacha's decision.** |

---

## Artifacts produced (on branch `arc-light/phase-0-5-renderer-spike`)

### Committed to repo
- `scripts/arc-light/spike-renderer.ts` — Phase 0.5 render + OCR gate driver (Poppler via local Homebrew).
- `scripts/arc-light/spike-mupdf-ocr.ts` — Phase 0.5 OCR gate on pre-rendered MuPDF PNGs (script kept for reproducibility; mupdf itself is NOT in `package.json`).
- `scripts/arc-light/spike-bundle-ocr.ts` — Phase 0.5b OCR gate on bundled-Poppler PNGs, per-page must-contain.
- `scripts/arc-light/packaging/Dockerfile` — AL2023 Poppler builder image.
- `scripts/arc-light/packaging/extract.sh` — transitive lib extraction.
- `scripts/arc-light/packaging/test-bundle-exec.sh` — vanilla AL2023 execution test.

### NOT in repo (deliberately outside)
- `mupdf` npm install (AGPL contamination avoidance): lived in `/tmp/arc-light-spike/mupdf-test/`.
- `/tmp/arc-light-spike/poppler-al2023/` — the extracted bundle itself (reproducible from the Dockerfile).
- `/tmp/arc-light-spike/poppler-bundle.tar.gz` — gzipped form for size measurement.
- `/tmp/arc-light-spike/*.png` — render outputs.

### NOT changed
- `src/services/pdf/ocr-service.ts` — untouched (per contract: no modification before packaging confirmed; now that it IS confirmed, Phase 2 can begin).
- `src/services/pdf/providers/*` — untouched.
- `next.config.ts` — untouched.
- `package.json` — untouched.

---

## Risks called out explicitly

1. **Vercel plan limit is plan-dependent**, not universal. The compressed 14.4 MB sits inside every Vercel plan's limit today, but the 50 MB Hobby ceiling is a product decision Vercel could change. Hard stop is the 250 MB uncompressed Lambda limit, which we are 7× below.
2. **Cold-start overhead not yet measured on Vercel itself**. The bundle needs to be unpacked by the Lambda runtime on cold start (14 MB gzipped). Empirical measurement is deferred to Phase 2 deploy preview.
3. **Poppler 24.08 vs upstream 26.02** — AL2023 ships 24.08. This is well-maintained (Aug 2024 release) and covers the e4n deck without issues. Future upgrades to 26.x will require rebuilding our bundle when AL2023 picks up a newer point release, or manually compiling.
4. **GPL redistribution obligation** — since the binary is distributed as part of Angel Desk's function bundle, we must offer access to Poppler source on request. Keeping the Dockerfile + `extract.sh` committed satisfies "corresponding source" in practice (they reproducibly build the redistributed binary). This should be documented in a `LICENSES.md` or similar at Phase 2.

## Stop conditions that were NOT triggered
- `ldd` reporting "not found" → **did not happen**, all libs resolved from bundle.
- Bundle > 250 MB uncompressed → **did not happen**, 35.1 MB.
- `pdftoppm -v` segfault → **did not happen**.
- OCR returning < 5 expected phrases on any page → **did not happen**, 5/5 on all three pages.
- Dependency on a system-only lib → **did not happen** (only `/lib64/ld-linux-x86-64.so.2` which is the dynamic linker present in every AL2023 runtime).

---

## Decision

**Poppler 24.08.0, packaged via the Dockerfile+extract chain, is the renderer for ARC-LIGHT.** MuPDF is off the table until/unless Artifex commercial license is acquired.

**Sacha's sign-off required to enter Phase 2** (implementation). Phase 2 will:
1. Introduce `src/services/pdf/renderers/types.ts` + `poppler-renderer.ts` (subprocess adapter).
2. Modify `next.config.ts` with `outputFileTracingIncludes` for the extraction/preview routes to ship the bundle.
3. Replace `pdf-to-img` callers in `ocr-service.ts` with the new renderer.
4. Keep `pdf-to-img` behind `extraction.renderer=pdfjs-legacy` kill-switch flag during ramp-up.
5. Deploy preview on Vercel, verify cold-start and warm render latency.
6. Add the e4n golden test (Phase 6).

---

## Sources consulted

- [Pete Wilcock — Using Poppler/pdftotext on AWS Lambda](https://www.petewilcock.com/using-poppler-pdftotext-and-other-custom-binaries-on-aws-lambda/)
- [AWS Amazon Linux 2023 release notes](https://github.com/amazonlinux/amazon-linux-2023)
- [jeylabs/aws-lambda-poppler-layer (dormant since 2020, NOT used here)](https://github.com/jeylabs/aws-lambda-poppler-layer)
- [Poppler project homepage](https://poppler.freedesktop.org/)
- [mupdf npm — AGPL-3.0-or-later declaration](https://www.npmjs.com/package/mupdf)
- [Artifex MuPDF commercial licensing](https://artifex.com/licensing)
