import mammoth from "mammoth";

interface DocxExtractionResult {
  success: true;
  text: string;
}

interface DocxExtractionError {
  success: false;
  error: string;
}

export async function extractFromDocx(
  buffer: Buffer
): Promise<DocxExtractionResult | DocxExtractionError> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { success: true, text: result.value };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
