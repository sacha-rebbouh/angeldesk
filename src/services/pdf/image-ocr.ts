import { MODELS, openrouter } from "../openrouter/client";

const IMAGE_OCR_MODEL = MODELS.GPT4O_MINI;
const IMAGE_OCR_REQUEST_TIMEOUT_MS = 90_000;
const IMAGE_OCR_MAX_RETRIES = 1;
const IMAGE_OCR_RETRY_BASE_DELAY_MS = 750;

const ESTIMATED_INPUT_TOKENS = 800;
const ESTIMATED_OUTPUT_TOKENS = 300;

const IMAGE_OCR_COST =
  (ESTIMATED_INPUT_TOKENS / 1000) * IMAGE_OCR_MODEL.inputCost +
  (ESTIMATED_OUTPUT_TOKENS / 1000) * IMAGE_OCR_MODEL.outputCost;

export type ImageOCRFormat = "jpeg" | "png";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableImageOCRError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (/timeout|timed out|fetch failed/i.test(error.message)) return true;
  }

  const typedError = error as { status?: number; code?: string } | null;
  if (!typedError) return false;

  if (typeof typedError.status === "number") {
    return typedError.status === 429 || typedError.status >= 500;
  }

  if (typeof typedError.code === "string") {
    return ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(typedError.code);
  }

  return false;
}

function buildImageOCRPrompt(): string {
  return `Extract ALL text from this slide. Include:
- Headings and titles
- Body text and bullet points
- Numbers, metrics, data points
- Chart/graph labels and values
- Diagram text

Output clean text only, no commentary.`;
}

async function generateImageOCRText(dataUrl: string): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= IMAGE_OCR_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_OCR_REQUEST_TIMEOUT_MS);

    try {
      const response = await openrouter.chat.completions.create(
        {
          model: IMAGE_OCR_MODEL.id,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: dataUrl },
                },
                {
                  type: "text",
                  text: buildImageOCRPrompt(),
                },
              ],
            },
          ],
          max_tokens: 1600,
          temperature: 0,
        },
        {
          signal: controller.signal,
          maxRetries: 0,
        }
      );

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      lastError = error;

      if (attempt === IMAGE_OCR_MAX_RETRIES || !isRetryableImageOCRError(error)) {
        throw error;
      }

      await sleep(IMAGE_OCR_RETRY_BASE_DELAY_MS * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown image OCR error");
}

/**
 * Process a standalone image (JPEG/PNG) with Vision OCR.
 *
 * This module intentionally avoids importing the PDF OCR service. Upload routes
 * need image OCR but do not need the vendored Poppler PDF renderer in their
 * serverless bundle.
 */
export async function processImageOCR(
  imageBuffer: Buffer,
  format: ImageOCRFormat
): Promise<{ text: string; confidence: "high" | "medium" | "low"; cost: number }> {
  const base64Image = imageBuffer.toString("base64");
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mimeType};base64,${base64Image}`;
  const text = (await generateImageOCRText(dataUrl)).trim();
  let confidence: "high" | "medium" | "low" = "medium";
  if (text.length > 200) confidence = "high";
  else if (text.length < 30) confidence = "low";

  return { text, confidence, cost: IMAGE_OCR_COST };
}
