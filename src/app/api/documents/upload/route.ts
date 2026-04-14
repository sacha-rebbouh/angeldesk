import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { DocumentType, Prisma } from "@prisma/client";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { extractFromExcel } from "@/services/excel";
import { extractFromDocx } from "@/services/docx";
import { extractFromPptx } from "@/services/pptx";
import { uploadFile } from "@/services/storage";
import { handleApiError } from "@/lib/api-error";
import { computeContentHash, checkDuplicateDocument } from "@/services/document-hash";
import { encryptText } from "@/lib/encryption";
import { isValidDocumentSignature } from "@/lib/file-signatures";
import {
  buildStructuredDocumentManifest,
  completeDocumentExtractionRun,
  markExtractionRunProgress,
  recordExtractionPageProgress,
  recordDocumentExtractionRun,
  summarizeManifestForLegacyMetrics,
  startDocumentExtractionRun,
} from "@/services/documents/extraction-runs";
import {
  buildProgressSnapshot,
  setDocumentExtractionProgress,
} from "@/services/documents/extraction-progress";
import { deductCreditAmount } from "@/services/credits";
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
    const uploadProgressId = formData.get("progressId") as string | null;

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
    const publishUploadProgress = async (params: {
      phase: "queued" | "started" | "native_extracted" | "page_processed" | "completed" | "failed";
      pageCount?: number;
      pagesProcessed?: number;
      message?: string;
    }) => {
      if (!uploadProgressId) return;
      await setDocumentExtractionProgress(buildProgressSnapshot({
        id: uploadProgressId,
        userId: user.id,
        documentId: document.id,
        documentName: document.name,
        phase: params.phase,
        pageCount: params.pageCount,
        pagesProcessed: params.pagesProcessed,
        message: params.message,
      }));
    };
    await publishUploadProgress({
      phase: "queued",
      message: "Document uploaded; extraction queued",
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
        const imageManifest = buildStructuredDocumentManifest({
          artifacts: [{
            index: 1,
            label: "Image 1",
            text: ocrResult.text,
            method: "ocr",
            hasCharts: /chart|graph|diagram|graphique|table|bar|axis|axe/i.test(ocrResult.text),
            hasTables: /\|/.test(ocrResult.text),
            requiresReview: ocrResult.text.trim().length < 30,
          }],
          estimatedCredits: 2,
          estimatedUsd: ocrResult.cost,
        });
        const extractionRun = await recordDocumentExtractionRun({
          documentId: document.id,
          documentVersion: document.version,
          contentHash,
          text: ocrResult.text,
          qualityScore: extractionQuality,
          manifest: imageManifest,
          warnings: [{
            code: "IMAGE_OCR",
            severity: "low",
            message: `Texte extrait de l'image via OCR (${ocrResult.text.length} caractères)`,
            suggestion: "Le texte a été extrait par un modèle de vision IA."
          }],
        });
        const creditCharge = await chargeExtractionCredits({
          userId: user.id,
          dealId,
          documentId: document.id,
          runId: extractionRun.id,
          credits: imageManifest.creditEstimate.estimatedCredits,
          description: `Image OCR extraction for ${file.name}`,
        });

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
              latestExtractionRunId: extractionRun.id,
              extractionCreditsCharged: creditCharge.creditsCharged,
              ...summarizeManifestForLegacyMetrics(imageManifest),
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
        const progressRun = await startDocumentExtractionRun({
          documentId: document.id,
          documentVersion: document.version,
          contentHash,
          extractionVersion: "strict-pdf-v1",
        });
        let uploadPageCount = 0;
        // Smart extraction: regular + auto OCR for low-quality pages
        const result = await smartExtract(buffer, {
          qualityThreshold: 40,
          maxOCRPages: Number.POSITIVE_INFINITY,
          autoOCR: true,
          strict: true,
          onProgress: async (event) => {
            if (event.phase === "native_extracted") {
              uploadPageCount = event.pageCount;
              await publishUploadProgress({
                phase: event.phase,
                pageCount: event.pageCount,
                pagesProcessed: 0,
                message: event.message,
              });
              await markExtractionRunProgress({
                runId: progressRun.id,
                pageCount: event.pageCount,
                pagesProcessed: 0,
                phase: event.phase,
                message: event.message,
              });
              return;
            }
            if (event.phase === "page_processed") {
              await recordExtractionPageProgress({
                runId: progressRun.id,
                page: event.page,
              });
              await publishUploadProgress({
                phase: event.phase,
                pageCount: Math.max(uploadPageCount, event.page.pageNumber),
                pagesProcessed: event.pageNumber,
                message: event.message,
              });
              return;
            }
            await publishUploadProgress({
              phase: event.phase,
              message: event.message,
              pageCount: "pageCount" in event ? event.pageCount : undefined,
              pagesProcessed: "pagesProcessed" in event ? event.pagesProcessed : undefined,
            });
            await markExtractionRunProgress({
              runId: progressRun.id,
              phase: event.phase,
              message: event.message,
              pageCount: "pageCount" in event ? event.pageCount : undefined,
              pagesProcessed: "pagesProcessed" in event ? event.pagesProcessed : undefined,
            });
          },
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

        const extractionRun = await completeDocumentExtractionRun({
          runId: progressRun.id,
          text: result.text,
          qualityScore: extractionQuality,
          manifest: result.manifest,
          warnings: extractionWarnings.length > 0
            ? JSON.parse(JSON.stringify(extractionWarnings))
            : [],
        });
        const creditCharge = await chargeExtractionCredits({
          userId: user.id,
          dealId,
          documentId: document.id,
          runId: extractionRun.id,
          credits: result.manifest.creditEstimate.estimatedCredits,
          description: `Enhanced PDF extraction for ${file.name}`,
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
              extractionCreditsCharged: creditCharge.creditsCharged,
              ...summarizeManifestForLegacyMetrics(result.manifest),
            },
            extractionWarnings: extractionWarnings.length > 0
              ? JSON.parse(JSON.stringify(extractionWarnings))
              : Prisma.DbNull,
            requiresOCR,
            ocrProcessed,
          },
        });
        await publishUploadProgress({
          phase: "completed",
          pageCount: result.manifest.pageCount,
          pagesProcessed: result.manifest.pagesProcessed,
          message: "Extraction completed",
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
        await publishUploadProgress({
          phase: "failed",
          message: extractionError instanceof Error ? extractionError.message : "PDF extraction failed",
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
          // Persist the complete workbook corpus. Summaries are useful for prompts,
          // but they are not an acceptable storage format for audit-grade extraction.
          const textContent = result.text;

          extractionQuality = result.metadata.totalCells > 0 ? 80 : 50;
          const excelManifest = buildStructuredDocumentManifest({
            artifacts: result.sheets.map((sheet, index) => ({
              index: index + 1,
              label: `Feuille ${sheet.name}`,
              text: sheet.textContent,
              method: "native_text",
              hasTables: sheet.rowCount > 1 && sheet.columnCount > 1,
              hasFinancialKeywords: /\b(arr|mrr|revenue|cash|burn|runway|ebitda|margin|forecast|budget|p&l|pl|profit|loss)\b/i.test(sheet.textContent),
              requiresReview: sheet.rowCount > 0 && sheet.textContent.trim().length < 20,
            })),
          });

          // Add info about the extraction
          if (result.metadata.hasFormulas) {
            extractionWarnings.push({
              code: "EXCEL_HAS_FORMULAS",
              severity: "low",
              message: `Excel contient des formules (${result.metadata.sheetCount} feuilles, ${result.metadata.totalCells} cellules)`,
              suggestion: "Les valeurs calculées ont été extraites."
            });
          }

          const extractionRun = await recordDocumentExtractionRun({
            documentId: document.id,
            documentVersion: document.version,
            contentHash,
            text: textContent,
            qualityScore: extractionQuality,
            manifest: excelManifest,
            warnings: extractionWarnings.length > 0
              ? JSON.parse(JSON.stringify(extractionWarnings))
              : [],
          });

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
                formulaCount: result.metadata.formulaCount,
                extractorVersion: 2,
                promptTextChars: textContent.length,
                truncated: textContent.length >= 120_000,
                latestExtractionRunId: extractionRun.id,
                ...summarizeManifestForLegacyMetrics(excelManifest),
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
          const wordManifest = buildStructuredDocumentManifest({
            artifacts: buildTextArtifacts("Section", result.text, 12000).map((artifact) => ({
              ...artifact,
              method: "native_text" as const,
              requiresReview: artifact.text.trim().length < 80,
            })),
          });
          const extractionRun = await recordDocumentExtractionRun({
            documentId: document.id,
            documentVersion: document.version,
            contentHash,
            text: result.text,
            qualityScore: extractionQuality,
            manifest: wordManifest,
            warnings: [],
          });

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(result.text),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                charCount: result.text.length,
                latestExtractionRunId: extractionRun.id,
                ...summarizeManifestForLegacyMetrics(wordManifest),
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
          const pptManifest = buildStructuredDocumentManifest({
            artifacts: buildSlideArtifacts(result.text, result.slideCount).map((artifact) => ({
              ...artifact,
              method: "native_text" as const,
              hasCharts: /chart|graph|diagram|graphique|axis|axe|bar|line|pie|waterfall|funnel/i.test(artifact.text),
              hasTables: /\|/.test(artifact.text) || /\d+([.,]\d+)?\s?(%|€|eur|\$|m|k|x)/i.test(artifact.text),
              requiresReview: artifact.text.trim().length < 80,
            })),
          });
          const extractionRun = await recordDocumentExtractionRun({
            documentId: document.id,
            documentVersion: document.version,
            contentHash,
            text: result.text,
            qualityScore: extractionQuality,
            manifest: pptManifest,
            warnings: [],
          });

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(result.text),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                slideCount: result.slideCount,
                charCount: result.text.length,
                latestExtractionRunId: extractionRun.id,
                ...summarizeManifestForLegacyMetrics(pptManifest),
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
    if (updatedDocument?.processingStatus === "FAILED") {
      await publishUploadProgress({
        phase: "failed",
        message: "Document extraction failed",
      });
    } else if (updatedDocument?.processingStatus === "COMPLETED" && file.type !== "application/pdf") {
      await publishUploadProgress({
        phase: "completed",
        pageCount: 1,
        pagesProcessed: 1,
        message: "Document extraction completed",
      });
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

function buildTextArtifacts(label: string, text: string, chunkSize: number) {
  const normalized = text.trim();
  if (!normalized) {
    return [{ index: 1, label: `${label} 1`, text: "" }];
  }

  const artifacts: Array<{ index: number; label: string; text: string }> = [];
  for (let start = 0; start < normalized.length; start += chunkSize) {
    const index = artifacts.length + 1;
    artifacts.push({
      index,
      label: `${label} ${index}`,
      text: normalized.slice(start, start + chunkSize),
    });
  }
  return artifacts;
}

function buildSlideArtifacts(text: string, slideCount: number) {
  const parts = text
    .split(/--- Slide \d+ ---/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return Array.from({ length: Math.max(1, slideCount) }, (_, index) => ({
      index: index + 1,
      label: `Slide ${index + 1}`,
      text: "",
    }));
  }

  return parts.map((part, index) => ({
    index: index + 1,
    label: `Slide ${index + 1}`,
    text: part,
  }));
}

async function chargeExtractionCredits(params: {
  userId: string;
  dealId: string;
  documentId: string;
  runId: string;
  credits: number;
  description: string;
}) {
  const credits = Math.max(0, Math.ceil(params.credits));
  if (credits === 0) return { creditsCharged: 0 };

  const deduction = await deductCreditAmount(params.userId, "EXTRACTION_HIGH_PAGE", credits, {
    dealId: params.dealId,
    documentId: params.documentId,
    documentExtractionRunId: params.runId,
    idempotencyKey: `extraction:run:${params.runId}`,
    description: params.description,
  });

  if (!deduction.success) {
    throw new Error(deduction.error ?? `Credits insuffisants pour l'extraction (${credits} requis)`);
  }

  return { creditsCharged: credits };
}
