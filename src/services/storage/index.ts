import { put, del } from "@vercel/blob";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";

export interface UploadResult {
  url: string;
  pathname: string;
}

const isVercelBlobConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;

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
    const localPath = urlOrPath.startsWith("/uploads/")
      ? join(process.cwd(), "public", urlOrPath)
      : urlOrPath;
    await unlink(localPath).catch(() => {});
  }
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
  const fullPath = join(uploadsDir, path);
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

  const publicUrl = `/uploads/${path}`;

  return {
    url: publicUrl,
    pathname: path,
  };
}

// Export config check for debugging
export const storageConfig = {
  provider: isVercelBlobConfigured ? "vercel-blob" : "local",
  isConfigured: isVercelBlobConfigured,
};
