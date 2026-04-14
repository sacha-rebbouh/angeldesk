import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { DocumentType, Prisma } from "@prisma/client";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { extractFromExcel, summarizeForLLM } from "@/services/excel";
import { extractFromDocx } from "@/services/docx";
import { extractFromPptx } from "@/services/pptx";
import { uploadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { computeContentHash, checkDuplicateDocument } from "@/services/document-hash";
import { encryptText } from "@/lib/encryption";
import { isValidDocumentSignature } from "@/lib/file-signatures";
import {
  recordDocumentExtractionRun,
  summarizeManifestForLegacyMetrics,
} from "@/services/documents/extraction-runs";
import type { ExtractionCreditEstimate } from "@/services/pdf";

// CUID validation
const cuidSchema = z.string().cuid();

export const maxDuration = 300;

// Max file size: 50MB. Keep a small multipart envelope allowance so oversized
// requests can be rejected before Next materializes formData in memory.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_MULTIPART_SIZE_BYTES = MAX_FILE_SIZE_BYTES + 2 * 1024 * 1024;

// POST /api/documents/upload - Upload a document
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limiting: max 10 uploads per minute (distributed via Redis)
    const rateLimit = await checkRateLimitDistributed(`upload:${user.id}`, { maxRequests: 10, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (contentLength == null || !Number.isFinite(contentLength) || contentLength <= 0) {
      return NextResponse.json(
        { error: "Content-Length header is required for document uploads" },
        { status: 411 }
      );
    }
    if (contentLength > MAX_MULTIPART_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB" },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dealId = formData.get("dealId") as string | null;
    const documentType = formData.get("type") as DocumentType | null;
    const customType = formData.get("customType") as string | null;
    const comments = formData.get("comments") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!dealId) {
      return NextResponse.json(
        { error: "Deal ID is required" },
        { status: 400 }
      );
    }

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(dealId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Validate file type
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "image/png",
      "image/jpeg",
    ];

    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, Word, Excel, PowerPoint, Images (PNG, JPG)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB" },
        { status: 413 }
      );
    }

    // Read file buffer ONCE (File stream can only be read once)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const isValidSignature = await isValidDocumentSignature(buffer, file.type);
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid file signature. The uploaded file does not match its declared type." },
        { status: 400 }
      );
    }

    // F63: Compute content hash for dedup + cache invalidation
    const contentHash = computeContentHash(buffer);

    // F63: Check for duplicate content
    const duplicateCheck = await checkDuplicateDocument(contentHash, dealId, user.id);
    if (duplicateCheck.isDuplicate && duplicateCheck.sameDeal) {
      return NextResponse.json(
        {
          error: "Document identique deja uploade",
          existingDocument: duplicateCheck.existingDocument,
        },
        { status: 409 }
      );
    }

    // F62: Check if this is a new version of an existing document (same name, same deal)
    const existingDoc = await prisma.document.findFirst({
      where: { dealId, name: file.name, isLatest: true },
      select: { id: true, version: true },
    });

    // Sanitize filename: remove path traversal and special chars
    const sanitizedName = file.name
      .replace(/[/\\]/g, "_")
      .replace(/\.\./g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    // Upload to storage (Vercel Blob in prod, local in dev)
    const uploaded = await uploadFile(`deals/${dealId}/${sanitizedName}`, buffer, {
      access: "private",
    });

    // F62: If re-uploading same filename, mark old as superseded
    if (existingDoc) {
      await prisma.document.update({
        where: { id: existingDoc.id },
        data: { isLatest: false, supersededAt: new Date() },
      });
    }

    // Create document record with PENDING status
    const document = await prisma.document.create({
      data: {
        dealId,
        name: file.name,
        type: documentType ?? "OTHER",
        customType: customType ?? undefined,
        comments: comments ?? undefined,
        storagePath: uploaded.pathname,
        storageUrl: uploaded.url,
        mimeType: file.type,
        sizeBytes: file.size,
        processingStatus: "PENDING",
        contentHash,
        // F62: Version tracking
        version: existingDoc ? existingDoc.version + 1 : 1,
        parentDocumentId: existingDoc?.id ?? undefined,
        isLatest: true,
      },
    });

    // Extract text for PDFs with smart extraction (auto-OCR if needed)
    let extractionWarnings: ExtractionWarning[] = [];
    let extractionQuality: number | null = null;
    let requiresOCR = false;
    let ocrProcessed = false;
    let pagesOCRd = 0;
    let ocrCost = 0;
    let extractionCreditEstimate: ExtractionCreditEstimate | null = null;

    // Images (JPEG/PNG): OCR via Vision LLM to extract text content
    if (file.type === "image/jpeg" || file.type === "image/png") {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        const { processImageOCR } = await import("@/services/pdf/ocr-service");
        const ocrResult = await processImageOCR(buffer, file.type === "image/jpeg" ? "jpeg" : "png");

        extractionQuality = ocrResult.text.length > 100 ? 75 : ocrResult.text.length > 30 ? 50 : 20;
        ocrProcessed = true;

        await prisma.document.update({
          where: { id: document.id },
          data: {
            extractedText: ocrResult.text ? encryptText(ocrResult.text) : null,
            processingStatus: "COMPLETED",
            extractionQuality,
            extractionMetrics: {
              method: "image_ocr",
              charCount: ocrResult.text.length,
              confidence: ocrResult.confidence,
              ocrCost: ocrResult.cost,
            },
            extractionWarnings: [{
              code: "IMAGE_OCR",
              severity: "low",
              message: `Texte extrait de l'image via OCR (${ocrResult.text.length} caractères)`,
              suggestion: "Le texte a été extrait par un modèle de vision IA."
            }] as Prisma.InputJsonValue,
            ocrProcessed: true,
          },
        });

        extractionWarnings = [{
          code: "IMAGE_OCR",
          severity: "low",
          message: `Texte extrait de l'image via OCR (${ocrResult.text.length} caractères)`,
          suggestion: "Le texte a été extrait par un modèle de vision IA."
        }];
      } catch (ocrError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Image OCR error:", ocrError);
        }
        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "COMPLETED",
            extractionWarnings: [{
              code: "IMAGE_OCR_FAILED",
              severity: "medium",
              message: "L'extraction de texte de l'image a échoué",
              suggestion: "L'image sera utilisée telle quelle par les agents d'analyse."
            }] as Prisma.InputJsonValue,
          },
        });
        extractionWarnings = [{
          code: "IMAGE_OCR_FAILED",
          severity: "medium",
          message: "L'extraction de texte de l'image a échoué",
          suggestion: "L'image sera utilisée telle quelle par les agents d'analyse."
        }];
      }
    }

    if (file.type === "application/pdf") {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        // Smart extraction: regular + auto OCR for low-quality pages
        const result = await smartExtract(buffer, {
          qualityThreshold: 40,
          maxOCRPages: Number.POSITIVE_INFINITY,
          autoOCR: true,
          strict: true,
        });

        extractionQuality = result.quality;
        pagesOCRd = result.pagesOCRd;
        ocrCost = result.estimatedCost;
        extractionCreditEstimate = result.manifest.creditEstimate;
        ocrProcessed = result.method === 'ocr' || result.method === 'hybrid';

        // Get warnings from OCR result if available
        if (result.ocrResult?.pageResults) {
          const lowConfidencePages = result.ocrResult.pageResults
            .filter(p => p.confidence === 'low')
            .map(p => p.pageNumber);

          if (lowConfidencePages.length > 0) {
            extractionWarnings.push({
              code: 'LOW_OCR_CONFIDENCE',
              severity: 'medium',
              message: `OCR had low confidence on pages: ${lowConfidencePages.join(', ')}`,
              suggestion: 'Some text may not be accurately extracted from these pages.'
            });
          }
        }

        // Add method info
        if (result.method === 'hybrid') {
          extractionWarnings.push({
            code: 'OCR_APPLIED',
            severity: 'low',
            message: `Visual extraction applied to ${pagesOCRd} page(s) requiring enhanced review`,
            suggestion: `Extraction plan: ${formatExtractionTierSummary(result.manifest.creditEstimate.pagesByTier)}. Estimated extraction credits: ${result.manifest.creditEstimate.estimatedCredits}. Provider cost: $${ocrCost.toFixed(4)}`
          });
        } else if (result.method === 'ocr') {
          extractionWarnings.push({
            code: 'FULL_OCR',
            severity: 'medium',
            message: 'Full OCR was required - PDF appears to be image-based',
            suggestion: `Extraction plan: ${formatExtractionTierSummary(result.manifest.creditEstimate.pagesByTier)}. Estimated extraction credits: ${result.manifest.creditEstimate.estimatedCredits}. Provider cost: $${ocrCost.toFixed(4)}`
          });
        }

        const extractionRun = await recordDocumentExtractionRun({
          documentId: document.id,
          documentVersion: document.version,
          contentHash,
          text: result.text,
          qualityScore: extractionQuality,
          manifest: result.manifest,
          warnings: extractionWarnings.length > 0
            ? JSON.parse(JSON.stringify(extractionWarnings))
            : [],
        });

        // Check if quality is still low after OCR or if strict page-level controls blocked the run.
        requiresOCR = result.manifest.status === "needs_review" || result.manifest.status === "failed";

        await prisma.document.update({
          where: { id: document.id },
          data: {
            extractedText: encryptText(result.text),
            processingStatus: result.text ? "COMPLETED" : "FAILED",
            extractionQuality,
            extractionMetrics: {
              quality: extractionQuality,
              method: result.method,
              pagesOCRd,
              ocrCost,
              latestExtractionRunId: extractionRun.id,
              ...summarizeManifestForLegacyMetrics(result.manifest),
            },
            extractionWarnings: extractionWarnings.length > 0
              ? JSON.parse(JSON.stringify(extractionWarnings))
              : Prisma.DbNull,
            requiresOCR,
            ocrProcessed,
          },
        });
      } catch (extractionError) {
        if (process.env.NODE_ENV === "development") {
          console.error("PDF extraction error:", extractionError);
        }

        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "FAILED",
            extractionWarnings: [{
              code: "EXTRACTION_ERROR",
              severity: "critical",
              message: "PDF extraction failed",
              suggestion: "The PDF may be corrupted or password-protected."
            }] as Prisma.InputJsonValue,
          },
        });
        extractionWarnings = [{
          code: "EXTRACTION_ERROR",
          severity: "critical",
          message: "PDF extraction failed",
          suggestion: "The PDF may be corrupted or password-protected."
        }];
      }
    }

    // Extract text for Excel files (.xlsx, .xls)
    const excelMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (excelMimeTypes.includes(file.type)) {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        const result = extractFromExcel(buffer);

        if (result.success) {
          // For financial models, use the LLM-optimized summary with large limit
          // to ensure ALL sheets are included (50K chars to cover multiple sheets)
          const textContent = documentType === "FINANCIAL_MODEL"
            ? summarizeForLLM(result, 50000)
            : result.text;

          extractionQuality = result.metadata.totalCells > 0 ? 80 : 50;

          // Add info about the extraction
          if (result.metadata.hasFormulas) {
            extractionWarnings.push({
              code: "EXCEL_HAS_FORMULAS",
              severity: "low",
              message: `Excel contient des formules (${result.metadata.sheetCount} feuilles, ${result.metadata.totalCells} cellules)`,
              suggestion: "Les valeurs calculées ont été extraites."
            });
          }

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(textContent),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                sheetCount: result.metadata.sheetCount,
                totalRows: result.metadata.totalRows,
                totalCells: result.metadata.totalCells,
                hasFormulas: result.metadata.hasFormulas,
              },
              extractionWarnings: extractionWarnings.length > 0
                ? JSON.parse(JSON.stringify(extractionWarnings))
                : Prisma.DbNull,
            },
          });

          if (process.env.NODE_ENV === "development") {
            console.log(`[Excel] Extracted ${result.metadata.totalCells} cells from ${result.metadata.sheetCount} sheets`);
          }
        } else {
          throw new Error(result.error || "Failed to parse Excel file");
        }
      } catch (extractionError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Excel extraction error:", extractionError);
        }
        const errorMessage = extractionError instanceof Error
          ? extractionError.message
          : "Unknown error";

        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "FAILED",
            extractionWarnings: [{
              code: "EXCEL_EXTRACTION_ERROR",
              severity: "critical",
              message: `Excel extraction failed: ${errorMessage}`,
              suggestion: "The file may be corrupted or password-protected."
            }] as Prisma.InputJsonValue,
          },
        });

        extractionWarnings = [{
          code: "EXCEL_EXTRACTION_ERROR",
          severity: "critical",
          message: `Excel extraction failed: ${errorMessage}`,
          suggestion: "The file may be corrupted or password-protected."
        }];
      }
    }

    // Extract text for Word files (.docx, .doc)
    const wordMimeTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (wordMimeTypes.includes(file.type)) {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        const result = await extractFromDocx(buffer);

        if (result.success) {
          extractionQuality = result.text.length > 100 ? 85 : 50;

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(result.text),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                charCount: result.text.length,
              },
              extractionWarnings: Prisma.DbNull,
            },
          });

          if (process.env.NODE_ENV === "development") {
            console.log(`[Word] Extracted ${result.text.length} chars`);
          }
        } else {
          throw new Error(result.error || "Failed to parse Word file");
        }
      } catch (extractionError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Word extraction error:", extractionError);
        }
        const errorMessage = extractionError instanceof Error
          ? extractionError.message
          : "Unknown error";

        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "FAILED",
            extractionWarnings: [{
              code: "WORD_EXTRACTION_ERROR",
              severity: "critical",
              message: `Word extraction failed: ${errorMessage}`,
              suggestion: "The file may be corrupted or password-protected."
            }] as Prisma.InputJsonValue,
          },
        });

        extractionWarnings = [{
          code: "WORD_EXTRACTION_ERROR",
          severity: "critical",
          message: `Word extraction failed: ${errorMessage}`,
          suggestion: "The file may be corrupted or password-protected."
        }];
      }
    }

    // Extract text for PowerPoint files (.pptx, .ppt)
    const pptMimeTypes = [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ];

    if (pptMimeTypes.includes(file.type)) {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        const result = await extractFromPptx(buffer);

        if (result.success) {
          extractionQuality = result.text.length > 100 ? 80 : 50;

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(result.text),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                slideCount: result.slideCount,
                charCount: result.text.length,
              },
              extractionWarnings: Prisma.DbNull,
            },
          });

          if (process.env.NODE_ENV === "development") {
            console.log(`[PPTX] Extracted ${result.text.length} chars from ${result.slideCount} slides`);
          }
        } else {
          throw new Error(result.error || "Failed to parse PowerPoint file");
        }
      } catch (extractionError) {
        if (process.env.NODE_ENV === "development") {
          console.error("PowerPoint extraction error:", extractionError);
        }
        const errorMessage = extractionError instanceof Error
          ? extractionError.message
          : "Unknown error";

        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "FAILED",
            extractionWarnings: [{
              code: "PPTX_EXTRACTION_ERROR",
              severity: "critical",
              message: `PowerPoint extraction failed: ${errorMessage}`,
              suggestion: "The file may be corrupted or password-protected."
            }] as Prisma.InputJsonValue,
          },
        });

        extractionWarnings = [{
          code: "PPTX_EXTRACTION_ERROR",
          severity: "critical",
          message: `PowerPoint extraction failed: ${errorMessage}`,
          suggestion: "The file may be corrupted or password-protected."
        }];
      }
    }

    // Return fresh document with updated status
    const updatedDocument = await prisma.document.findUnique({
      where: { id: document.id },
    });

    // Build response with extraction health info
    const response: {
      data: typeof updatedDocument;
      extraction?: {
        quality: number | null;
        warnings: ExtractionWarning[];
        requiresOCR: boolean;
        isUsable: boolean;
        ocrApplied: boolean;
        pagesOCRd: number;
        ocrCost: number;
        creditEstimate: ExtractionCreditEstimate | null;
      };
      // F62: version info
      versioning?: { version: number; replacedDocumentId?: string };
      // F63: duplicate warning (cross-deal)
      duplicateWarning?: { existingDocument: NonNullable<typeof duplicateCheck.existingDocument> };
    } = { data: updatedDocument };

    // F62: Include versioning info
    if (existingDoc) {
      response.versioning = {
        version: existingDoc.version + 1,
        replacedDocumentId: existingDoc.id,
      };
    }

    // F63: Warn about cross-deal duplicate
    if (duplicateCheck.isDuplicate && !duplicateCheck.sameDeal && duplicateCheck.existingDocument) {
      response.duplicateWarning = {
        existingDocument: duplicateCheck.existingDocument,
      };
    }

    // Include extraction info for PDFs
    if (file.type === "application/pdf") {
      response.extraction = {
        quality: extractionQuality,
        warnings: extractionWarnings,
        requiresOCR,
        isUsable: (extractionQuality ?? 0) >= 40,
        ocrApplied: ocrProcessed,
        pagesOCRd,
        ocrCost,
        creditEstimate: extractionCreditEstimate,
      };
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleApiError(error, "upload document");
  }
}

function formatExtractionTierSummary(pagesByTier: ExtractionCreditEstimate["pagesByTier"]): string {
  return Object.entries(pagesByTier)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => `${tier}=${count}`)
    .join(", ");
}
