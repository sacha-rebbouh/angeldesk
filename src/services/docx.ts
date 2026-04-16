import mammoth from "mammoth";
import JSZip from "jszip";

interface DocxExtractionResult {
  success: true;
  text: string;
  tables: string[][][];
  sections: DocxSectionData[];
  embeddedMedia: OfficeEmbeddedMedia[];
  warnings: string[];
}

interface DocxExtractionError {
  success: false;
  error: string;
}

export interface DocxSectionData {
  sectionNumber: number;
  text: string;
  tables: string[][][];
}

export interface OfficeEmbeddedMedia {
  name: string;
  contentType: "image/png" | "image/jpeg" | "image/unknown";
  extension: string;
  sizeBytes: number;
  buffer: Buffer;
}

export async function extractFromDocx(
  buffer: Buffer
): Promise<DocxExtractionResult | DocxExtractionError> {
  try {
    const nativeArtifact = await extractNativeDocxArtifacts(buffer);
    const rawTextResult = await mammoth.extractRawText({ buffer }).catch((error) => ({
      value: nativeArtifact.nativeText,
      messages: [{ message: error instanceof Error ? error.message : "Mammoth raw text extraction failed" }],
    }));

    const text = buildDocxPromptText(rawTextResult.value, nativeArtifact.tables);
    return {
      success: true,
      text,
      tables: nativeArtifact.tables,
      sections: splitDocxSections(text, nativeArtifact.tables),
      embeddedMedia: nativeArtifact.embeddedMedia,
      warnings: nativeArtifact.warnings,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function extractNativeDocxArtifacts(buffer: Buffer): Promise<{
  tables: string[][][];
  warnings: string[];
  nativeText: string;
  embeddedMedia: OfficeEmbeddedMedia[];
}> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]?.async("string");
    if (!documentXml) {
      return { tables: [], warnings: ["DOCX document.xml not found"], nativeText: "", embeddedMedia: [] };
    }

    const tables = extractWordTables(documentXml);
    const nativeText = extractWordTextRuns(documentXml).join("\n");
    const embeddedMedia = await extractEmbeddedMedia(zip, "word/media/");
    const warnings: string[] = [];
    if (embeddedMedia.length > 0) {
      warnings.push(`${embeddedMedia.length} embedded media object(s) detected; media OCR required for full screenshot/image fidelity.`);
    }

    return { tables, warnings, nativeText, embeddedMedia };
  } catch (error) {
    return {
      tables: [],
      warnings: [error instanceof Error ? error.message : "Failed to parse native DOCX XML"],
      nativeText: "",
      embeddedMedia: [],
    };
  }
}

async function extractEmbeddedMedia(zip: JSZip, prefix: string): Promise<OfficeEmbeddedMedia[]> {
  const media: OfficeEmbeddedMedia[] = [];
  const mediaFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith(prefix) && !zip.files[name].dir)
    .sort();

  for (const name of mediaFiles) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : "image/unknown";
    if (contentType === "image/unknown") continue;
    const buffer = await zip.files[name].async("nodebuffer");
    media.push({
      name,
      extension,
      contentType,
      sizeBytes: buffer.length,
      buffer,
    });
  }

  return media.slice(0, 20);
}

function buildDocxPromptText(rawText: string, tables: string[][][]): string {
  const parts = [rawText.trim()];
  if (tables.length > 0) {
    parts.push(
      tables
        .map((table, index) => [
          `[DOCX Table ${index + 1}]`,
          ...table.map((row) => row.join(" | ")),
        ].join("\n"))
        .join("\n\n")
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

function splitDocxSections(text: string, tables: string[][][]): DocxSectionData[] {
  const chunks = text.trim()
    ? chunkByParagraphs(text, 12_000)
    : ["[Aucun texte natif extrait]"];

  return chunks.map((chunk, index) => ({
    sectionNumber: index + 1,
    text: chunk,
    tables: index === 0 ? tables : [],
  }));
}

function extractWordTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  for (const tableMatch of xml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)) {
    const rows: string[][] = [];
    for (const rowMatch of tableMatch[0].matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)) {
        const cellText = extractWordTextRuns(cellMatch[0]).join(" ").replace(/\s+/g, " ").trim();
        cells.push(cellText);
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables.slice(0, 50);
}

function extractWordTextRuns(xml: string): string[] {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1] ?? "").trim())
    .filter(Boolean);
}

function chunkByParagraphs(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n{2,}|\r?\n/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}
