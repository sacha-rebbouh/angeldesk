# ARC-LIGHT Phase 0.5b - Poppler Lambda-runtime packaging builder
#
# Purpose: produce a self-contained tarball of pdftoppm + shared libs that will
# run on the same Amazon Linux 2023 runtime Vercel/AWS Lambda uses today
# (public.ecr.aws/lambda/provided:al2023). The official Lambda base image is
# the closest proxy to what we'll deploy into.
#
# Build (x86_64 because Vercel default Lambda CPU is x86_64; ARM64 Graviton
# functions exist but are opt-in):
#   docker build --platform=linux/amd64 \
#     -t arc-light-poppler-builder \
#     -f scripts/arc-light/packaging/Dockerfile \
#     scripts/arc-light/packaging
#
# Extract to host:
#   docker run --rm --platform=linux/amd64 \
#     -v /tmp/arc-light-spike/poppler-al2023:/output \
#     arc-light-poppler-builder /usr/local/bin/extract.sh

FROM public.ecr.aws/lambda/provided:al2023

# Install poppler-utils from AL2023 repos (the set of binaries we need:
# pdftoppm is in poppler-utils). We also install binutils for strip + ldd.
RUN dnf install -y poppler-utils binutils findutils && dnf clean all

# ldd + cp helpers shipped as /usr/local/bin/extract.sh.
COPY extract.sh /usr/local/bin/extract.sh
RUN chmod +x /usr/local/bin/extract.sh

# Default entrypoint: run extraction to /output volume.
ENTRYPOINT ["/bin/bash"]
