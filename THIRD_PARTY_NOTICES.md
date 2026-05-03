# Third-party notices

This file lists third-party components redistributed with Angel Desk, their
licenses, and how to rebuild them from source.

## Poppler (pdftoppm + shared libraries)

Angel Desk redistributes the `pdftoppm` binary and its transitive shared-library
dependencies inside `vendor/poppler/al2023-x64/`. These files are used by the
server-side PDF rendering pipeline (see `src/services/pdf/renderers/poppler-renderer.ts`).

- **Package**: `poppler-utils`
- **Upstream project**: Poppler — https://poppler.freedesktop.org/
- **Upstream source**: https://poppler.freedesktop.org/releases.html
- **Version redistributed**: `24.08.0-1.amzn2023.x86_64`
  (installed via `dnf install -y poppler-utils` on `public.ecr.aws/lambda/provided:al2023`)
- **License**: Poppler is licensed under the **GNU General Public License v2.0
  or later** (GPL-2.0-or-later), with some headers under GPL-3.0-or-later. See
  `https://poppler.freedesktop.org/` for the full license text and copyright
  attributions.
- **Usage mode in Angel Desk**: the binary is invoked as an external process
  via `child_process.execFile`. Angel Desk source code is NOT linked to Poppler
  source code. The GPL linking obligation therefore does not propagate to
  Angel Desk's proprietary source.
- **Redistribution obligation**: anyone receiving the Angel Desk function
  bundle has the right to obtain the corresponding source for the redistributed
  GPL binaries. The Poppler upstream source is listed above; the exact packaged
  binary provenance is recorded in `vendor/poppler/al2023-x64/MANIFEST`. The
  files under `scripts/arc-light/packaging/` are the rebuild/extraction recipe
  used to recreate the runtime bundle from the Amazon Linux 2023
  `poppler-utils` package.

### Rebuild procedure

```bash
# 1. Build the AL2023 image and extract the bundle.
docker build --platform=linux/amd64 \
  -t arc-light-poppler-builder \
  -f scripts/arc-light/packaging/Dockerfile \
  scripts/arc-light/packaging

docker run --rm --platform=linux/amd64 \
  -v "$PWD/vendor/poppler/al2023-x64:/output" \
  arc-light-poppler-builder /usr/local/bin/extract.sh /output

# 2. Verify execution in a clean AL2023 container.
bash scripts/arc-light/packaging/test-bundle-exec.sh \
  "$PWD/vendor/poppler/al2023-x64" \
  "<path-to-any-pdf>" \
  1
```

The `MANIFEST` file in the output directory records the Poppler version, arch,
file list, and total byte size. Every ARC-LIGHT rebuild should verify that the
`poppler_version` line matches the version intended for deployment. Upgrading
to a newer Poppler release happens by either (a) waiting for AL2023 to pick up
the new point release and re-running the procedure above, or (b) switching the
Dockerfile base image to a distribution that ships the desired version.
