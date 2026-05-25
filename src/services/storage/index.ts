import { put, del } from "@vercel/blob";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, resolve, normalize } from "path";
import { encryptBuffer, safeDecryptBuffer } from "@/lib/encryption";

export interface UploadResult {
  url: string;
  pathname: string;
}

function hasVercelBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function shouldUseVercelBlob(): boolean {
  if (hasVercelBlobToken()) return true;
  if (isVercelRuntime()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required for storage on Vercel; refusing local filesystem fallback"
    );
  }
  return false;
}

/**
 * Sanitize path to prevent path traversal attacks
 * Ensures the path stays within the uploads directory
 */
function sanitizePath(basePath: string, userPath: string): string {
  // Normalize and resolve the user path
  const normalizedPath = normalize(userPath).replace(/^(\.\.[\/\\])+/, '');

  // Remove any leading slashes
  const cleanPath = normalizedPath.replace(/^[\/\\]+/, '');

  // Build full path and verify it's within base
  const fullPath = resolve(basePath, cleanPath);
  const resolvedBase = resolve(basePath);

  // Security check: ensure the resolved path starts with the base path
  if (!fullPath.startsWith(resolvedBase + '/') && fullPath !== resolvedBase) {
    throw new Error('Invalid path: path traversal attempt detected');
  }

  return fullPath;
}

/**
 * Upload a file to storage (Vercel Blob in prod, local in dev)
 */
export async function uploadFile(
  path: string,
  file: File | Buffer,
  options?: { access?: "public" | "private"; allowOverwrite?: boolean }
): Promise<UploadResult> {
  const buffer = await toBuffer(file);
  const content = options?.access === "private" ? encryptBuffer(buffer) : buffer;

  if (shouldUseVercelBlob()) {
    return uploadToVercelBlob(path, content, {
      allowOverwrite: options?.allowOverwrite,
    });
  }
  return uploadToLocal(path, content);
}

/**
 * Delete a file from storage
 */
export async function deleteFile(urlOrPath: string): Promise<void> {
  if (shouldUseVercelBlob()) {
    await del(urlOrPath);
  } else {
    const baseDir = join(process.cwd(), "public", "uploads");

    // Extract the path part after /uploads/ if present
    const pathPart = urlOrPath.startsWith("/uploads/")
      ? urlOrPath.substring("/uploads/".length)
      : urlOrPath;

    // Sanitize to prevent path traversal
    const localPath = sanitizePath(baseDir, pathPart);
    await unlink(localPath).catch(() => {});
  }
}

/**
 * Download a file from storage as Buffer
 */
export async function downloadFile(urlOrPath: string): Promise<Buffer> {
  let buffer: Buffer;

  if (shouldUseVercelBlob()) {
    // Phase 5 (Codex P1): a Document row can legitimately have `storageUrl`
    // null and only `storagePath` set (legacy rows, the `?? storagePath`
    // fallback in /retry, /process, /ocr, etc.). `storagePath` is a pathname
    // like `deals/<dealId>/abc.pdf` — NOT a URL. Passing it to `fetch()`
    // throws "Invalid URL". Resolve the pathname to its current blob URL
    // via `@vercel/blob.head()` (which accepts both URL and pathname)
    // before fetching. URLs pass through untouched.
    let downloadUrl = urlOrPath;
    if (!/^https?:\/\//i.test(urlOrPath)) {
      const { head } = await import("@vercel/blob");
      const info = await head(urlOrPath);
      downloadUrl = info.url;
    }
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Failed to download from blob: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    return safeDecryptBuffer(buffer);
  }

  const { readFile } = await import("fs/promises");
  const baseDir = join(process.cwd(), "public", "uploads");

  // Extract the path part after /uploads/ if present
  const pathPart = urlOrPath.startsWith("/uploads/")
    ? urlOrPath.substring("/uploads/".length)
    : urlOrPath;

  // Sanitize to prevent path traversal
  const localPath = sanitizePath(baseDir, pathPart);
  buffer = await readFile(localPath);
  return safeDecryptBuffer(buffer);
}

/**
 * Get the public URL for a file
 */
export function getPublicUrl(pathname: string): string {
  if (shouldUseVercelBlob()) {
    return pathname; // Vercel Blob returns full URL
  }
  // Local: return relative URL
  return `/uploads/${pathname}`;
}

// --- Vercel Blob ---
async function uploadToVercelBlob(
  path: string,
  file: Buffer,
  options?: { allowOverwrite?: boolean }
): Promise<UploadResult> {
  // Vercel Blob only supports public blobs. Private uploads are encrypted by
  // uploadFile() before reaching this function and must be served through an
  // authenticated API route that calls downloadFile().
  const blob = await put(path, file, {
    access: "public",
    ...(options?.allowOverwrite === undefined
      ? {}
      : { allowOverwrite: options.allowOverwrite }),
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

// --- Local Storage (dev) ---
async function uploadToLocal(
  path: string,
  file: Buffer
): Promise<UploadResult> {
  const uploadsDir = join(process.cwd(), "public", "uploads");

  // Sanitize path to prevent path traversal
  const fullPath = sanitizePath(uploadsDir, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Write file
  await writeFile(fullPath, file);

  // Extract relative path for URL
  const relativePath = fullPath.replace(uploadsDir + "/", "");
  const publicUrl = `/uploads/${relativePath}`;

  return {
    url: publicUrl,
    pathname: relativePath,
  };
}

async function toBuffer(file: File | Buffer): Promise<Buffer> {
  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  return file;
}

// Export config check for debugging
export const storageConfig = {
  get provider() {
    return hasVercelBlobToken() ? "vercel-blob" : "local";
  },
  get isConfigured() {
    return hasVercelBlobToken();
  },
};
