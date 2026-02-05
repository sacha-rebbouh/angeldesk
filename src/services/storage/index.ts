import { put, del } from "@vercel/blob";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, resolve, normalize } from "path";

export interface UploadResult {
  url: string;
  pathname: string;
}

const isVercelBlobConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;

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
  options?: { access?: "public" | "private" }
): Promise<UploadResult> {
  if (isVercelBlobConfigured) {
    return uploadToVercelBlob(path, file, options);
  }
  return uploadToLocal(path, file);
}

/**
 * Delete a file from storage
 */
export async function deleteFile(urlOrPath: string): Promise<void> {
  if (isVercelBlobConfigured) {
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
  if (isVercelBlobConfigured) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to download from blob: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const { readFile } = await import("fs/promises");
  const baseDir = join(process.cwd(), "public", "uploads");

  // Extract the path part after /uploads/ if present
  const pathPart = urlOrPath.startsWith("/uploads/")
    ? urlOrPath.substring("/uploads/".length)
    : urlOrPath;

  // Sanitize to prevent path traversal
  const localPath = sanitizePath(baseDir, pathPart);
  return readFile(localPath);
}

/**
 * Get the public URL for a file
 */
export function getPublicUrl(pathname: string): string {
  if (isVercelBlobConfigured) {
    return pathname; // Vercel Blob returns full URL
  }
  // Local: return relative URL
  return `/uploads/${pathname}`;
}

// --- Vercel Blob ---
async function uploadToVercelBlob(
  path: string,
  file: File | Buffer,
  _options?: { access?: "public" | "private" }
): Promise<UploadResult> {
  // Vercel Blob only supports "public" access in the free tier
  const blob = await put(path, file, {
    access: "public",
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}

// --- Local Storage (dev) ---
async function uploadToLocal(
  path: string,
  file: File | Buffer
): Promise<UploadResult> {
  const uploadsDir = join(process.cwd(), "public", "uploads");

  // Sanitize path to prevent path traversal
  const fullPath = sanitizePath(uploadsDir, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Convert File to Buffer if needed
  let buffer: Buffer;
  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = file;
  }

  // Write file
  await writeFile(fullPath, buffer);

  // Extract relative path for URL
  const relativePath = fullPath.replace(uploadsDir + "/", "");
  const publicUrl = `/uploads/${relativePath}`;

  return {
    url: publicUrl,
    pathname: relativePath,
  };
}

// Export config check for debugging
export const storageConfig = {
  provider: isVercelBlobConfigured ? "vercel-blob" : "local",
  isConfigured: isVercelBlobConfigured,
};
