/**
 * Poppler renderer (ARC-LIGHT Phase 2 primary).
 *
 * Invokes pdftoppm via child_process.execFile. No shell string. LD_LIBRARY_PATH
 * is injected into the spawned process env ONLY, never the Node process env.
 *
 * Binary resolution order:
 *  1. process.env.POPPLER_BIN (explicit override - local dev convenience).
 *  2. vendor/poppler/al2023-x64/bin/pdftoppm  (the redistributed Linux bundle
 *     used on Vercel / AWS Lambda serverless runtimes).
 *  3. System pdftoppm discovered via PATH (macOS dev via Homebrew, Linux
 *     dev machines with poppler-utils installed).
 *
 * On Vercel the redistributed bundle is guaranteed present thanks to
 * outputFileTracingIncludes in next.config.ts. On macOS arm64 the redistributed
 * Linux x64 binary is skipped (the resolver falls through to PATH).
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { PdfRenderer, RenderedPage, RenderOptions } from "./types";

const execFileAsync = promisify(execFile);

const DEFAULT_DPI = 200;
const BUNDLED_BIN_REL = "vendor/poppler/al2023-x64/bin/pdftoppm";
const BUNDLED_LIB_REL = "vendor/poppler/al2023-x64/lib";
const EXEC_TIMEOUT_MS = 60_000;

interface ResolvedBinary {
  binPath: string;
  libDir: string | null; // null when using a system binary — no LD_LIBRARY_PATH override.
  source: "env" | "bundle" | "path";
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    const s = await stat(file);
    return s.isFile();
  } catch {
    return false;
  }
}

async function findSystemBinary(): Promise<string | null> {
  // Use POSIX `which` via execFile (no shell). Fails quietly on Windows/non-POSIX.
  try {
    const { stdout } = await execFileAsync("which", ["pdftoppm"], { timeout: 3000 });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function isBundleCompatibleWithCurrentPlatform(): boolean {
  // The redistributed bundle was built for Amazon Linux 2023 x86_64. Skip it
  // on any other OS/arch combination (macOS dev, Linux arm64, Windows) so the
  // resolver falls through to POPPLER_BIN / system pdftoppm.
  return process.platform === "linux" && process.arch === "x64";
}

async function resolvePdftoppm(cwd: string): Promise<ResolvedBinary> {
  const envBin = process.env.POPPLER_BIN?.trim();
  if (envBin && (await isExecutable(envBin))) {
    return { binPath: envBin, libDir: null, source: "env" };
  }

  if (isBundleCompatibleWithCurrentPlatform()) {
    const bundledBin = path.join(cwd, BUNDLED_BIN_REL);
    const bundledLib = path.join(cwd, BUNDLED_LIB_REL);
    if (await isExecutable(bundledBin)) {
      let libDir: string | null = null;
      try {
        const libStat = await stat(bundledLib);
        if (libStat.isDirectory()) libDir = bundledLib;
      } catch {
        libDir = null;
      }
      return { binPath: bundledBin, libDir, source: "bundle" };
    }
  }

  const systemBin = await findSystemBinary();
  if (systemBin) {
    return { binPath: systemBin, libDir: null, source: "path" };
  }

  throw new Error(
    "[PopplerRenderer] pdftoppm not found. Set POPPLER_BIN, install poppler-utils locally, " +
      "or ensure vendor/poppler/al2023-x64/bin/pdftoppm is present on the deployment bundle."
  );
}

export class PopplerRenderer implements PdfRenderer {
  public readonly id = "poppler" as const;

  private readonly cwd: string;

  constructor(options: { cwd?: string } = {}) {
    this.cwd = options.cwd ?? process.cwd();
  }

  async renderPage(
    buffer: Buffer,
    pageNumber: number,
    options: RenderOptions = {}
  ): Promise<RenderedPage> {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new Error(`[PopplerRenderer] invalid pageNumber: ${pageNumber}`);
    }
    const dpi = options.dpi ?? DEFAULT_DPI;
    const resolved = await resolvePdftoppm(this.cwd);

    const workDir = await mkdtemp(path.join(tmpdir(), "arc-light-poppler-"));
    const pdfPath = path.join(workDir, "input.pdf");
    const outPrefix = path.join(workDir, "page");

    try {
      await mkdir(workDir, { recursive: true });
      await writeBuffer(pdfPath, buffer);

      const start = Date.now();
      await execFileAsync(
        resolved.binPath,
        [
          "-r", String(dpi),
          "-png",
          "-f", String(pageNumber),
          "-l", String(pageNumber),
          pdfPath,
          outPrefix,
        ],
        {
          timeout: EXEC_TIMEOUT_MS,
          env: buildChildEnv(resolved),
          maxBuffer: 1024 * 1024,
        }
      );
      const renderLatencyMs = Date.now() - start;

      const pngPath = await locateProducedPng(outPrefix, pageNumber);
      const pngBuffer = await readFile(pngPath);
      return {
        pageNumber,
        pngBuffer,
        bytes: pngBuffer.length,
        renderLatencyMs,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async renderPages(
    buffer: Buffer,
    pageNumbers: number[],
    options: RenderOptions = {}
  ): Promise<RenderedPage[]> {
    // Spawn pdftoppm once per page for isolation + ordering. Simpler than
    // streaming a range; pdftoppm is fast per page and per-page errors stay
    // local. Concurrency is deliberately 1 so tmp dirs never collide.
    const results: RenderedPage[] = [];
    for (const pageNumber of pageNumbers) {
      const rendered = await this.renderPage(buffer, pageNumber, options);
      results.push(rendered);
    }
    return results;
  }
}

function buildChildEnv(resolved: ResolvedBinary): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    // Inherit the base parent env so PATH, HOME, tmpdir resolution still work.
    ...process.env,
  };
  // Inject LD_LIBRARY_PATH ONLY for the bundled Linux path. System / env
  // overrides should not have their loader poisoned with our lib dir.
  if (resolved.source === "bundle" && resolved.libDir) {
    base.LD_LIBRARY_PATH = resolved.libDir;
  }
  return base;
}

async function writeBuffer(filePath: string, buffer: Buffer): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buffer);
}

async function locateProducedPng(prefix: string, pageNumber: number): Promise<string> {
  // pdftoppm pads the page number in the produced file name depending on the
  // total page count; try the 3 common variants.
  const candidates = [
    `${prefix}-${pageNumber}.png`,
    `${prefix}-${String(pageNumber).padStart(2, "0")}.png`,
    `${prefix}-${String(pageNumber).padStart(3, "0")}.png`,
    `${prefix}-${String(pageNumber).padStart(4, "0")}.png`,
  ];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error(
    `[PopplerRenderer] pdftoppm did not produce a PNG for page ${pageNumber}. Tried: ${candidates.join(", ")}`
  );
}

export function createPopplerRenderer(options: { cwd?: string } = {}): PopplerRenderer {
  return new PopplerRenderer(options);
}
