import JSZip from "jszip";

interface PptxExtractionResult {
  success: true;
  text: string;
  slideCount: number;
}

interface PptxExtractionError {
  success: false;
  error: string;
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

    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async("string");
      // Extract all text content from <a:t> tags
      const texts: string[] = [];
      const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        const text = match[1].trim();
        if (text) texts.push(text);
      }
      if (texts.length > 0) {
        slideTexts.push(`--- Slide ${slideTexts.length + 1} ---\n${texts.join("\n")}`);
      }
    }

    const fullText = slideTexts.join("\n\n");

    return {
      success: true,
      text: fullText,
      slideCount: slideFiles.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
