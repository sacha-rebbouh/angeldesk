import JSZip from "jszip";

interface PptxExtractionResult {
  success: true;
  text: string;
  slideCount: number;
  slides: PptxSlideData[];
  charts: PptxChartData[];
  embeddedMedia: PptxEmbeddedMedia[];
  warnings: string[];
}

interface PptxExtractionError {
  success: false;
  error: string;
}

export interface PptxSlideData {
  slideNumber: number;
  text: string;
  tables: string[][][];
}

export interface PptxChartData {
  chartNumber: number;
  title?: string;
  values: Array<{ label: string; value: string }>;
}

export interface PptxEmbeddedMedia {
  name: string;
  contentType: "image/png" | "image/jpeg" | "image/unknown";
  extension: string;
  sizeBytes: number;
  buffer: Buffer;
}

/**
 * Extract text from a PPTX file by parsing the XML slides inside the ZIP.
 */
export async function extractFromPptx(
  buffer: Buffer
): Promise<PptxExtractionResult | PptxExtractionError> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // Find all slide XML files (ppt/slides/slide1.xml, slide2.xml, etc.)
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
        return numA - numB;
      });

    if (slideFiles.length === 0) {
      return { success: false, error: "No slides found in PPTX file" };
    }

    const slideTexts: string[] = [];
    const slides: PptxSlideData[] = [];

    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async("string");
      // Extract all text content from <a:t> tags
      const texts: string[] = [];
      const regex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        const text = match[1].trim();
        if (text) texts.push(text);
      }
      const tables = extractSlideTables(xml);
      const slideNumber = slideTexts.length + 1;
      const slideBody = [
        texts.length > 0 ? texts.join("\n") : "[Aucun texte natif extrait]",
        ...tables.map((table, index) => [
          `\n[Table ${index + 1}]`,
          ...table.map((row) => row.join(" | ")),
        ].join("\n")),
      ].join("\n");
      slideTexts.push(`--- Slide ${slideNumber} ---\n${slideBody}`);
      slides.push({
        slideNumber,
        text: texts.join("\n"),
        tables,
      });
    }

    const charts = await extractCharts(zip);
    const embeddedMedia = await extractEmbeddedMedia(zip);
    const warnings = embeddedMedia.length > 0
      ? [`${embeddedMedia.length} embedded media object(s) detected; media OCR required for full screenshot/image fidelity.`]
      : [];
    if (charts.length > 0) {
      slideTexts.push([
        "--- Embedded Charts ---",
        ...charts.map((chart) => [
          `Chart ${chart.chartNumber}${chart.title ? ` - ${chart.title}` : ""}`,
          ...chart.values.map((value) => `${value.label}: ${value.value}`),
        ].join("\n")),
      ].join("\n\n"));
    }

    const fullText = slideTexts.join("\n\n");

    return {
      success: true,
      text: fullText,
      slideCount: slideFiles.length,
      slides,
      charts,
      embeddedMedia,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function extractEmbeddedMedia(zip: JSZip): Promise<PptxEmbeddedMedia[]> {
  const media: PptxEmbeddedMedia[] = [];
  const mediaFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/media\//.test(name) && !zip.files[name].dir)
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

function extractSlideTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  const tableRegex = /<a:tbl[\s\S]*?<\/a:tbl>/g;
  for (const tableMatch of xml.matchAll(tableRegex)) {
    const tableXml = tableMatch[0];
    const rows: string[][] = [];
    const rowRegex = /<a:tr[\s\S]*?<\/a:tr>/g;
    for (const rowMatch of tableXml.matchAll(rowRegex)) {
      const cells: string[] = [];
      const cellRegex = /<a:tc[\s\S]*?<\/a:tc>/g;
      for (const cellMatch of rowMatch[0].matchAll(cellRegex)) {
        const cellTexts = extractTextRuns(cellMatch[0]);
        cells.push(cellTexts.join(" ").trim());
      }
      if (cells.some((cell) => cell.length > 0)) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

async function extractCharts(zip: JSZip): Promise<PptxChartData[]> {
  const chartFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/chart(\d+)/)?.[1] ?? 0) - Number(b.match(/chart(\d+)/)?.[1] ?? 0));

  const charts: PptxChartData[] = [];
  for (const chartFile of chartFiles) {
    const xml = await zip.files[chartFile].async("string");
    const chartNumber = Number(chartFile.match(/chart(\d+)/)?.[1] ?? charts.length + 1);
    const title = extractFirstTextBetween(xml, /<c:title[\s\S]*?<\/c:title>/);
    const labels = extractChartValues(xml, "cat");
    const values = extractChartValues(xml, "val");

    charts.push({
      chartNumber,
      title,
      values: values.map((value, index) => ({
        label: labels[index] ?? `value_${index + 1}`,
        value,
      })),
    });
  }
  return charts;
}

function extractChartValues(xml: string, tagName: "cat" | "val"): string[] {
  const block = xml.match(new RegExp(`<c:${tagName}>[\\s\\S]*?<\\/c:${tagName}>`))?.[0] ?? "";
  return [...block.matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)]
    .map((match) => decodeXml(match[1] ?? "").trim())
    .filter(Boolean);
}

function extractTextRuns(xml: string): string[] {
  const texts: string[] = [];
  for (const match of xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)) {
    const text = decodeXml(match[1] ?? "").trim();
    if (text) texts.push(text);
  }
  return texts;
}

function extractFirstTextBetween(xml: string, pattern: RegExp): string | undefined {
  const scoped = xml.match(pattern)?.[0];
  if (!scoped) return undefined;
  return extractTextRuns(scoped).join(" ").trim() || undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}
