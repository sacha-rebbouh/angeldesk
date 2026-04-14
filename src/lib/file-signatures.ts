import JSZip from "jszip";

const PDF_MAGIC = Buffer.from("%PDF-", "utf8");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const OOXML_SIGNATURES: Record<string, string[]> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xl/"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["word/"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["ppt/"],
};

function hasPrefix(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function hasAnyEntry(zipEntries: string[], prefixes: string[]): boolean {
  return prefixes.some((prefix) => zipEntries.some((entry) => entry.startsWith(prefix)));
}

async function validateOoxmlSignature(buffer: Buffer, mimeType: string): Promise<boolean> {
  if (!hasPrefix(buffer, ZIP_MAGIC)) return false;

  const requiredPrefixes = OOXML_SIGNATURES[mimeType];
  if (!requiredPrefixes) return false;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);
    return entries.includes("[Content_Types].xml") && hasAnyEntry(entries, requiredPrefixes);
  } catch {
    return false;
  }
}

/**
 * Validate that a buffered upload matches its declared document type.
 * Keeps the check server-side and fails closed when the signature is unknown.
 */
export async function isValidDocumentSignature(buffer: Buffer, mimeType: string): Promise<boolean> {
  switch (mimeType) {
    case "application/pdf":
      return hasPrefix(buffer, PDF_MAGIC);
    case "image/png":
      return hasPrefix(buffer, PNG_MAGIC);
    case "image/jpeg":
      return hasPrefix(buffer, JPEG_MAGIC);
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return hasPrefix(buffer, OLE_MAGIC);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return validateOoxmlSignature(buffer, mimeType);
    default:
      return false;
  }
}

