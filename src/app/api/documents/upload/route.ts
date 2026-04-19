import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { DocumentType, Prisma } from "@prisma/client";
import { smartExtract, estimatePdfExtractionCost, type ExtractionWarning } from "@/services/pdf";
import {
  extractFromExcel,
  buildExcelModelIntelligence,
  runExcelFinancialAudit,
  generateExcelAnalystReport,
  type SheetData,
} from "@/services/excel";
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
  getBlockingPageNumbersFromManifest,
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
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";
import type { DocumentPageArtifact, ExtractionCreditEstimate } from "@/services/pdf";

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
    let imageOcrCredits = 0;
    if (file.type === "image/jpeg" || file.type === "image/png") {
      // P0.4 + P1: pre-check credits AVANT d'appeler le Vision LLM. Tarification
      // granulaire par taille: 1 credit si < 500KB (image simple, screenshot
      // standard), 2 credits au-dela (image lourde, qualite high-fidelity).
      imageOcrCredits = file.size < 500 * 1024 ? 1 : 2;
      const imagePreCheck = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", imageOcrCredits, {
        dealId,
        documentId: document.id,
        idempotencyKey: `extraction:pre:image:${document.id}`,
        description: `Pre-check image OCR (${imageOcrCredits}cr, ${Math.round(file.size / 1024)}KB) for ${file.name}`,
      });
      if (!imagePreCheck.success) {
        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "FAILED",
            extractionWarnings: [{
              code: "INSUFFICIENT_CREDITS",
              severity: "critical",
              message: `Credits insuffisants pour l'OCR image (${imageOcrCredits} requis)`,
              suggestion: "Acheter un pack de credits puis re-uploader.",
            }] as Prisma.InputJsonValue,
          },
        });
        return NextResponse.json(
          {
            error: "Credits insuffisants pour l'OCR image",
            required: imageOcrCredits,
            breakdown: { image: imageOcrCredits, sizeKb: Math.round(file.size / 1024) },
          },
          { status: 402 }
        );
      }

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
          estimatedCredits: imageOcrCredits,
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
        // P0.4: credits deja preleves avant OCR. Pas de charge supplementaire ici.
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
              extractionCreditsCharged: imageOcrCredits,
              sizeKb: Math.round(file.size / 1024),
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
        // P0.4: OCR a echoue apres pre-check. Remboursement integral du montant
        // effectivement deduit (compute partiel peut avoir ete consomme mais on
        // favorise l'UX).
        await refundCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", imageOcrCredits, {
          dealId,
          documentId: document.id,
          idempotencyKey: `extraction:refund:image-fail:${document.id}`,
          description: `Refund image OCR failed for ${file.name}`,
        }).catch(() => undefined);
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

    let pdfPreChargedCredits = 0;

    if (file.type === "application/pdf") {
      // P0.4: pre-check credits avant de lancer smartExtract (qui peut engager
      // du compute OpenRouter). Estimation conservatrice worst-case: 1 credit/page
      // high_fidelity. Apres extraction reelle, on rembourse la difference si le
      // plan effectif est plus economique.
      const pdfEstimate = await estimatePdfExtractionCost(buffer);
      const preCharge = Math.max(0, pdfEstimate.estimatedCredits);
      if (preCharge > 0) {
        const deduction = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", preCharge, {
          dealId,
          documentId: document.id,
          idempotencyKey: `extraction:pre:pdf:${document.id}`,
          description: `Pre-check PDF extraction (${pdfEstimate.pageCount} pages) for ${file.name}`,
        });
        if (!deduction.success) {
          await prisma.document.update({
            where: { id: document.id },
            data: {
              processingStatus: "FAILED",
              extractionWarnings: [{
                code: "INSUFFICIENT_CREDITS",
                severity: "critical",
                message: `Credits insuffisants (estime: ${preCharge} credits pour ${pdfEstimate.pageCount} pages)`,
                suggestion: "Acheter un pack de credits puis re-uploader.",
              }] as Prisma.InputJsonValue,
            },
          });
          return NextResponse.json(
            {
              error: "Credits insuffisants pour l'extraction PDF",
              required: preCharge,
              breakdown: {
                pageCount: pdfEstimate.pageCount,
                worstCaseCreditsPerPage: 1,
                totalCredits: preCharge,
              },
            },
            { status: 402 }
          );
        }
        pdfPreChargedCredits = preCharge;
      }

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

        // P0.4: reconciliation pre-charge vs cout reel
        const actualCredits = Math.max(0, Math.ceil(result.manifest.creditEstimate.estimatedCredits));
        let finalChargedCredits = pdfPreChargedCredits;
        if (actualCredits > pdfPreChargedCredits) {
          const delta = actualCredits - pdfPreChargedCredits;
          const extra = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", delta, {
            dealId,
            documentId: document.id,
            documentExtractionRunId: extractionRun.id,
            idempotencyKey: `extraction:delta:pdf:${extractionRun.id}`,
            description: `Delta PDF extraction (+${delta} credits) for ${file.name}`,
          });
          if (extra.success) {
            finalChargedCredits += delta;
          } else {
            // Si le user n'a plus le delta, on accepte quand meme le resultat d'extraction
            // (compute deja consomme cote OpenRouter). A investigation en prod.
            console.warn(
              `[upload] PDF extraction delta de ${delta} non facture (solde insuffisant) pour document ${document.id}`
            );
          }
        } else if (actualCredits < pdfPreChargedCredits) {
          const refundAmount = pdfPreChargedCredits - actualCredits;
          const refund = await refundCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", refundAmount, {
            dealId,
            documentId: document.id,
            documentExtractionRunId: extractionRun.id,
            idempotencyKey: `extraction:refund:pdf:${extractionRun.id}`,
            description: `Refund surestimation PDF (-${refundAmount} credits) for ${file.name}`,
          });
          if (refund.success) {
            finalChargedCredits -= refundAmount;
          }
        }

        // Keep OCR / review blocking only for genuinely unresolved critical pages.
        requiresOCR =
          result.manifest.status === "failed" ||
          getBlockingPageNumbersFromManifest(result.manifest).length > 0;

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
              extractionCreditsCharged: finalChargedCredits,
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

        // P0.4: extraction crashee apres pre-check. Remboursement integral du pre-charge.
        if (pdfPreChargedCredits > 0) {
          await refundCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", pdfPreChargedCredits, {
            dealId,
            documentId: document.id,
            idempotencyKey: `extraction:refund:pdf-fail:${document.id}`,
            description: `Refund PDF extraction failed for ${file.name}`,
          }).catch(() => undefined);
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
          const modelIntelligence = buildExcelModelIntelligence(buffer, result);
          const financialAudit = runExcelFinancialAudit(result, modelIntelligence);
          const analystReport = await generateExcelAnalystReport({
            extraction: result,
            intelligence: modelIntelligence,
            financialAudit,
          });

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
              artifact: buildExcelSheetArtifact(sheet, index + 1),
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
          for (const flag of financialAudit.consistencyFlags.slice(0, 3)) {
            extractionWarnings.push({
              code: "EXCEL_MODEL_CONSISTENCY",
              severity: flag.severity === "critical" ? "critical" : flag.severity === "high" ? "high" : "medium",
              message: flag.title,
              suggestion: flag.message,
            });
          }
          for (const flag of financialAudit.reconciliationFlags.slice(0, 3)) {
            extractionWarnings.push({
              code: "EXCEL_MODEL_RECONCILIATION",
              severity: flag.severity === "critical" ? "critical" : flag.severity === "high" ? "high" : "medium",
              message: flag.title,
              suggestion: flag.message,
            });
          }
          for (const flag of financialAudit.plausibilityFlags.slice(0, 3)) {
            extractionWarnings.push({
              code: "EXCEL_MODEL_PLAUSIBILITY",
              severity: flag.severity === "critical" ? "critical" : flag.severity === "high" ? "high" : "medium",
              message: flag.title,
              suggestion: flag.message,
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
            extraSummaryMetrics: JSON.parse(JSON.stringify({
              workbookAudit: result.workbookAudit,
              modelIntelligence,
              financialAudit,
              analystReport,
            })) as Prisma.InputJsonObject,
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
                hiddenSheetCount: result.metadata.hiddenSheetCount,
                workbookAudit: JSON.parse(JSON.stringify(result.workbookAudit)),
                modelIntelligence: JSON.parse(JSON.stringify(modelIntelligence)),
                financialAudit: JSON.parse(JSON.stringify(financialAudit)),
                analystReport: analystReport ? JSON.parse(JSON.stringify(analystReport)) : null,
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
          const embeddedMediaExtraction = await extractOfficeEmbeddedMediaArtifacts(result.embeddedMedia, "DOCX");
          const combinedText = [result.text, embeddedMediaExtraction.text].filter(Boolean).join("\n\n");
          extractionQuality = combinedText.length > 100 ? 85 : 50;
          const wordManifest = buildStructuredDocumentManifest({
            artifacts: [
              ...result.sections.map((section) => ({
                index: section.sectionNumber,
                label: `Section ${section.sectionNumber}`,
                text: section.text,
                method: "native_text" as const,
                hasTables: section.tables.length > 0 || looksLikeDelimitedTable(section.text),
                hasFinancialKeywords: /\b(arr|mrr|revenue|cash|burn|runway|ebitda|margin|forecast|budget|profit|loss)\b/i.test(section.text),
                hasTeamKeywords: /\b(founder|ceo|cto|cfo|team|linkedin|board|advisor)\b/i.test(section.text),
                hasMarketKeywords: /\b(tam|sam|som|market|competitor|cagr|customer|segment)\b/i.test(section.text),
                requiresReview: section.text.trim().length < 80 || result.warnings.length > 0,
                artifact: buildOfficeTextArtifact({
                  pageNumber: section.sectionNumber,
                  label: `Section ${section.sectionNumber}`,
                  text: section.text,
                  sourceType: "DOCX",
                  nativeTables: section.tables,
                  extractionWarnings: result.warnings,
                }),
              })),
              ...embeddedMediaExtraction.artifacts.map((artifact, index) => ({
                index: result.sections.length + index + 1,
                label: artifact.label,
                text: artifact.text,
                method: "ocr" as const,
                hasCharts: artifact.artifact.charts.length > 0 || artifact.artifact.visualBlocks.some((block) => block.type === "chart"),
                hasTables: artifact.artifact.tables.length > 0 || artifact.artifact.visualBlocks.some((block) => block.type === "table"),
                requiresReview: artifact.artifact.needsHumanReview,
                artifact: artifact.artifact,
              })),
            ],
            estimatedCredits: embeddedMediaExtraction.credits,
            estimatedUsd: embeddedMediaExtraction.usd,
          });
          const extractionRun = await recordDocumentExtractionRun({
            documentId: document.id,
            documentVersion: document.version,
            contentHash,
            text: combinedText,
            qualityScore: extractionQuality,
            manifest: wordManifest,
            warnings: [...result.warnings, ...embeddedMediaExtraction.warnings],
          });
          await chargeExtractionCredits({
            userId: user.id,
            dealId,
            documentId: document.id,
            runId: extractionRun.id,
            credits: embeddedMediaExtraction.credits,
            description: `Embedded media OCR for ${file.name}`,
          });

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(combinedText),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                charCount: combinedText.length,
                tableCount: result.tables.length,
                embeddedMediaCount: result.embeddedMedia.length,
                embeddedMediaOCRCount: embeddedMediaExtraction.ocrCount,
                embeddedMediaOCRCost: embeddedMediaExtraction.usd,
                warnings: [...result.warnings, ...embeddedMediaExtraction.warnings],
                latestExtractionRunId: extractionRun.id,
                ...summarizeManifestForLegacyMetrics(wordManifest),
              },
              extractionWarnings: [...result.warnings, ...embeddedMediaExtraction.warnings].length > 0
                ? [...result.warnings, ...embeddedMediaExtraction.warnings].map((warning) => ({
                  code: "DOCX_NATIVE_EXTRACTION_WARNING",
                  severity: "medium",
                  message: warning,
                  suggestion: "Review extracted sections if this document relies on screenshots or embedded media."
                })) as Prisma.InputJsonValue
                : Prisma.DbNull,
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
          const embeddedMediaExtraction = await extractOfficeEmbeddedMediaArtifacts(result.embeddedMedia, "PPTX");
          const combinedText = [result.text, embeddedMediaExtraction.text].filter(Boolean).join("\n\n");
          extractionQuality = combinedText.length > 100 ? 80 : 50;
          const pptManifest = buildStructuredDocumentManifest({
            artifacts: [
              ...buildSlideArtifacts(result.text, result.slideCount).map((artifact) => {
              const slide = result.slides.find((entry) => entry.slideNumber === artifact.index);
              const charts = artifact.index === 1 ? result.charts : [];
              const chartHint = charts.length > 0 || /chart|graph|diagram|graphique|axis|axe|bar|line|pie|waterfall|funnel/i.test(artifact.text);
              const hasTables = (slide?.tables.length ?? 0) > 0 || /\|/.test(artifact.text) || /\d+([.,]\d+)?\s?(%|€|eur|\$|m|k|x)/i.test(artifact.text);
              return {
                ...artifact,
                method: "native_text" as const,
                hasCharts: chartHint,
                hasTables,
                requiresReview: artifact.text.trim().length < 80 || (chartHint && charts.length === 0),
                artifact: buildOfficeTextArtifact({
                  pageNumber: artifact.index,
                  label: artifact.label,
                  text: artifact.text,
                  sourceType: "PPTX",
                  chartHint,
                  nativeTables: slide?.tables,
                  nativeCharts: charts,
                }),
              };
              }),
              ...embeddedMediaExtraction.artifacts.map((artifact, index) => ({
                index: result.slideCount + index + 1,
                label: artifact.label,
                text: artifact.text,
                method: "ocr" as const,
                hasCharts: artifact.artifact.charts.length > 0 || artifact.artifact.visualBlocks.some((block) => block.type === "chart"),
                hasTables: artifact.artifact.tables.length > 0 || artifact.artifact.visualBlocks.some((block) => block.type === "table"),
                requiresReview: artifact.artifact.needsHumanReview,
                artifact: artifact.artifact,
              })),
            ],
            estimatedCredits: embeddedMediaExtraction.credits,
            estimatedUsd: embeddedMediaExtraction.usd,
          });
          const extractionRun = await recordDocumentExtractionRun({
            documentId: document.id,
            documentVersion: document.version,
            contentHash,
            text: combinedText,
            qualityScore: extractionQuality,
            manifest: pptManifest,
            warnings: [...result.warnings, ...embeddedMediaExtraction.warnings],
          });
          await chargeExtractionCredits({
            userId: user.id,
            dealId,
            documentId: document.id,
            runId: extractionRun.id,
            credits: embeddedMediaExtraction.credits,
            description: `Embedded media OCR for ${file.name}`,
          });

          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: encryptText(combinedText),
              processingStatus: "COMPLETED",
              extractionQuality,
              extractionMetrics: {
                slideCount: result.slideCount,
                chartCount: result.charts.length,
                charCount: combinedText.length,
                embeddedMediaCount: result.embeddedMedia.length,
                embeddedMediaOCRCount: embeddedMediaExtraction.ocrCount,
                embeddedMediaOCRCost: embeddedMediaExtraction.usd,
                latestExtractionRunId: extractionRun.id,
                ...summarizeManifestForLegacyMetrics(pptManifest),
              },
              extractionWarnings: [...result.warnings, ...embeddedMediaExtraction.warnings].length > 0
                ? [...result.warnings, ...embeddedMediaExtraction.warnings].map((warning) => ({
                  code: "PPTX_NATIVE_EXTRACTION_WARNING",
                  severity: "medium",
                  message: warning,
                  suggestion: "Review extracted slides if this presentation relies on screenshots or embedded media."
                })) as Prisma.InputJsonValue
                : Prisma.DbNull,
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

    // Thesis-first : si le deal a deja une these persistee ET le document a ete extrait avec succes,
    // declencher une re-extraction auto (1 credit). Garde metier: si une re-extraction
    // recente est deja en cours pour ce deal, on coalesce au lieu de multiplier les versions.
    if (updatedDocument?.processingStatus === "COMPLETED") {
      try {
        const { thesisService } = await import("@/services/thesis");
        const existingThesis = await thesisService.getLatest(dealId);
        if (existingThesis) {
          const recentPendingThesisReview = await prisma.analysis.findFirst({
            where: {
              dealId,
              mode: "full_analysis",
              status: "RUNNING",
              thesisDecision: null,
              createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
            },
            select: { id: true, thesisId: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          });

          if (recentPendingThesisReview) {
            console.log(
              `[upload] Thesis re-extract skipped for deal ${dealId}: pending thesis review already in flight (analysisId=${recentPendingThesisReview.id}, thesisId=${recentPendingThesisReview.thesisId ?? "pending-link"})`
            );
            return NextResponse.json(response, { status: 201 });
          }

          const { inngest } = await import("@/lib/inngest");
          await inngest.send({
            name: "analysis/thesis.reextract",
            data: {
              dealId,
              userId: user.id,
              triggeredByDocumentId: document.id,
              previousThesisId: existingThesis.id,
            },
          });
          console.log(`[upload] Thesis re-extract triggered for deal ${dealId} (prev thesisId=${existingThesis.id})`);
        }
      } catch (err) {
        // Non-bloquant : l'upload reussit meme si l'event Inngest echoue
        console.warn("[upload] Failed to trigger thesis re-extract:", err);
      }
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

type OfficeMediaLike = {
  name: string;
  contentType: "image/png" | "image/jpeg" | "image/unknown";
  sizeBytes: number;
  buffer: Buffer;
};

async function extractOfficeEmbeddedMediaArtifacts(
  media: OfficeMediaLike[],
  sourceType: "DOCX" | "PPTX"
): Promise<{
  text: string;
  artifacts: Array<{ label: string; text: string; artifact: DocumentPageArtifact }>;
  warnings: string[];
  credits: number;
  usd: number;
  ocrCount: number;
}> {
  if (media.length === 0) {
    return { text: "", artifacts: [], warnings: [], credits: 0, usd: 0, ocrCount: 0 };
  }

  const { processImageArtifactOCR } = await import("@/services/pdf/ocr-service");
  const artifacts: Array<{ label: string; text: string; artifact: DocumentPageArtifact }> = [];
  const warnings: string[] = [];
  let usd = 0;
  let ocrCount = 0;
  const supportedMedia = media.filter((item) => item.contentType === "image/png" || item.contentType === "image/jpeg");
  const mediaToOCR = supportedMedia.filter((item) => item.sizeBytes >= 128).slice(0, 8);
  const skipped = supportedMedia.length - mediaToOCR.length;

  for (const [index, item] of mediaToOCR.entries()) {
    const label = `${sourceType} embedded image ${index + 1}: ${item.name}`;
    try {
      const result = await processImageArtifactOCR(
        item.buffer,
        item.contentType === "image/jpeg" ? "jpeg" : "png",
        index + 1,
        "high_fidelity"
      );
      usd += result.cost;
      ocrCount += 1;
      const artifact = result.artifact ?? buildEmbeddedMediaFallbackArtifact({
        pageNumber: index + 1,
        label,
        text: result.text,
        sourceHash: hashBuffer(item.buffer),
        warning: result.text.trim().length === 0 ? "Embedded image OCR returned no text." : undefined,
      });
      artifacts.push({
        label,
        text: result.text,
        artifact: {
          ...artifact,
          label,
          sourceHash: artifact.sourceHash ?? hashBuffer(item.buffer),
        },
      });
      if (artifact.needsHumanReview || result.confidence === "low") {
        warnings.push(`${label} requires review after media OCR.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedded media OCR failed";
      warnings.push(`${label}: ${message}`);
      artifacts.push({
        label,
        text: "",
        artifact: buildEmbeddedMediaFallbackArtifact({
          pageNumber: index + 1,
          label,
          text: "",
          sourceHash: hashBuffer(item.buffer),
          warning: message,
        }),
      });
    }
  }

  for (const item of supportedMedia.filter((entry) => entry.sizeBytes < 128)) {
    const label = `${sourceType} embedded image skipped: ${item.name}`;
    warnings.push(`${label} is too small for reliable OCR (${item.sizeBytes} bytes).`);
    artifacts.push({
      label,
      text: "",
      artifact: buildEmbeddedMediaFallbackArtifact({
        pageNumber: artifacts.length + 1,
        label,
        text: "",
        sourceHash: hashBuffer(item.buffer),
        warning: "Embedded image too small for reliable OCR.",
      }),
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} embedded media object(s) were not OCRed because the per-document media OCR cap is 8.`);
  }

  const text = artifacts
    .filter((entry) => entry.text.trim())
    .map((entry, index) => `[Embedded Media ${index + 1} - ${entry.label}]\n${entry.text.trim()}`)
    .join("\n\n");

  return {
    text,
    artifacts,
    warnings,
    credits: ocrCount,
    usd,
    ocrCount,
  };
}

function buildEmbeddedMediaFallbackArtifact(params: {
  pageNumber: number;
  label: string;
  text: string;
  sourceHash: string;
  warning?: string;
}): DocumentPageArtifact {
  return {
    version: "document-page-artifact-v1",
    pageNumber: params.pageNumber,
    label: params.label,
    text: params.text,
    visualBlocks: [{
      type: "image",
      title: params.label,
      description: "Embedded Office media image. OCR was unavailable or insufficient; original document remains audit source.",
      confidence: "low",
    }],
    tables: [],
    charts: [],
    unreadableRegions: [{
      reason: params.warning ?? "Embedded media requires human review.",
      severity: "high",
    }],
    numericClaims: [],
    confidence: "low",
    needsHumanReview: true,
    sourceHash: params.sourceHash,
  };
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function buildExcelSheetArtifact(sheet: SheetData, pageNumber: number): DocumentPageArtifact {
  const rows = sheet.data
    .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0))
    .slice(0, 200)
    .map((row) => row.map((cell) => String(cell ?? "")));
  const confidence: DocumentPageArtifact["confidence"] = sheet.includedInPrompt && !sheet.truncated
    ? "high"
    : sheet.includedInPrompt
      ? "medium"
      : "low";
  const numericClaims: DocumentPageArtifact["numericClaims"] = [];

  for (const row of rows) {
    const label = row.find((cell) => cell.trim() && !looksNumericCell(cell)) ?? "row_value";
    for (const cell of row) {
      const value = cell.trim();
      if (!looksNumericCell(value)) continue;
      numericClaims.push({
        label,
        value,
        unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
        sourceText: row.join(" | ").slice(0, 180),
        confidence,
      });
      if (numericClaims.length >= 80) break;
    }
    if (numericClaims.length >= 80) break;
  }

  return {
    version: "document-page-artifact-v1",
    pageNumber,
    label: `Feuille ${sheet.name}`,
    text: sheet.textContent,
    visualBlocks: rows.length > 1
      ? [{
        type: "table",
        title: sheet.name,
        description: `Excel sheet classified as ${sheet.classification}/${sheet.role}; ${sheet.rowCount} rows x ${sheet.columnCount} columns; ${sheet.audit.formulaCellCount} formulas.`,
        confidence,
      }]
      : [],
    tables: rows.length > 1
      ? [{
        title: sheet.name,
        rows,
        confidence,
      }]
      : [],
    charts: [],
    unreadableRegions: [
      ...(!sheet.includedInPrompt ? [{
        reason: `Sheet excluded from prompt (${sheet.hidden ? "hidden" : sheet.classification}). Original workbook remains audit source.`,
        severity: "medium" as const,
      }] : []),
      ...(sheet.truncated ? [{
        reason: "Sheet prompt text was truncated; structured rows are capped for prompt safety.",
        severity: "medium" as const,
      }] : []),
    ],
    numericClaims,
    confidence,
    needsHumanReview: sheet.truncated || (!sheet.includedInPrompt && sheet.classification !== "CALCULATIONS"),
    semanticAssessment: {
      pageClass: sheet.role === "OUTPUTS" ? "structured_table" : sheet.role === "INPUTS" ? "narrative" : "mixed_visual_analytics",
      classConfidence: "medium",
      classReasons: [`excel sheet role: ${sheet.role}`],
      structureDependency: sheet.role === "OUTPUTS" ? "critical" : sheet.role === "INPUTS" ? "medium" : "high",
      semanticSufficiency: sheet.truncated ? "partial" : "sufficient",
      labelValueIntegrity: numericClaims.length >= 10 ? "strong" : numericClaims.length >= 3 ? "mixed" : "weak",
      visualNoiseScore: 0,
      analyticalValueScore: Math.min(100, 30 + sheet.audit.keyMetricLabels.length * 3 + Math.round(sheet.audit.formulaDensity * 40)),
      requiresStructuredPreservation: sheet.role === "OUTPUTS",
      shouldBlockIfStructureMissing: sheet.role === "OUTPUTS" && !sheet.truncated,
      canDegradeToWarning: sheet.truncated || sheet.role !== "OUTPUTS",
      minimumEvidence: sheet.role === "OUTPUTS"
        ? ["key outputs", "formula lineage sample", "metric labels", "values"]
        : ["sheet labels", "sampled values"],
      rationale: [
        `role=${sheet.role}`,
        `formulaDensity=${(sheet.audit.formulaDensity * 100).toFixed(1)}%`,
        ...(sheet.audit.warningFlags.length > 0 ? [`warnings=${sheet.audit.warningFlags.join(",")}`] : []),
      ],
    } as never,
  };
}

function buildOfficeTextArtifact(params: {
  pageNumber: number;
  label: string;
  text: string;
  sourceType: "DOCX" | "PPTX";
  chartHint?: boolean;
  nativeTables?: string[][][];
  nativeCharts?: Array<{ chartNumber: number; title?: string; values: Array<{ label: string; value: string }> }>;
  extractionWarnings?: string[];
}): DocumentPageArtifact {
  const nativeTableRows = params.nativeTables?.flatMap((table) => table) ?? [];
  const rows = nativeTableRows.length > 0 ? nativeTableRows : extractDelimitedRows(params.text);
  const nativeChartClaims: DocumentPageArtifact["numericClaims"] = (params.nativeCharts ?? []).flatMap((chart) =>
    chart.values.map((entry) => ({
      label: chart.title ? `${chart.title} - ${entry.label}` : entry.label,
      value: entry.value,
      sourceText: `PPTX chart ${chart.chartNumber}: ${entry.label}=${entry.value}`,
      confidence: "medium" as const,
    }))
  );
  const numericClaims = [
    ...nativeChartClaims,
    ...extractNumericClaims(params.text, "medium"),
  ].slice(0, 100);
  const visualBlocks: DocumentPageArtifact["visualBlocks"] = [];

  if (rows.length > 1) {
    visualBlocks.push({
      type: "table",
      title: params.label,
      description: nativeTableRows.length > 0
        ? `${params.sourceType} native table extracted from Office XML.`
        : `${params.sourceType} text contains delimited/table-like rows extracted from native text.`,
      confidence: nativeTableRows.length > 0 ? "high" : "medium",
    });
  }
  if (params.chartHint || numericClaims.length >= 8) {
    visualBlocks.push({
      type: "chart",
      title: params.label,
      description: (params.nativeCharts?.length ?? 0) > 0
        ? `${params.sourceType} native chart data extracted from Office XML.`
        : `${params.sourceType} text suggests visual chart content, but native Office extraction is text-first.`,
      confidence: (params.nativeCharts?.length ?? 0) > 0 ? "medium" : "low",
    });
  }

  return {
    version: "document-page-artifact-v1",
    pageNumber: params.pageNumber,
    label: params.label,
    text: params.text,
    visualBlocks,
    tables: rows.length > 1
      ? [{
        title: params.label,
        rows,
        confidence: nativeTableRows.length > 0 ? "high" : "medium",
      }]
      : [],
    charts: params.chartHint
      ? (params.nativeCharts?.length ?? 0) > 0
        ? params.nativeCharts!.map((chart) => ({
          title: chart.title ?? `Chart ${chart.chartNumber}`,
          chartType: "unknown",
          description: "Native PPTX chart values extracted from chart XML. Visual geometry/colors are not represented.",
          values: chart.values,
          confidence: "medium" as const,
        }))
        : [{
          title: params.label,
          chartType: "unknown",
          description: "Chart-like content detected from native text. Values are captured as numeric claims only; visual geometry is not guaranteed.",
          values: numericClaims.slice(0, 30).map((claim) => ({ label: claim.label, value: claim.value })),
          confidence: "low" as const,
        }]
      : [],
    unreadableRegions: [
      ...(params.chartHint && (params.nativeCharts?.length ?? 0) === 0
        ? [{
        reason: "Office native text extraction cannot guarantee chart geometry, labels, colors or embedded image/table fidelity.",
        severity: "medium",
      } as const]
        : []),
      ...(params.extractionWarnings ?? []).slice(0, 10).map((warning) => ({
        reason: warning,
        severity: "medium" as const,
      })),
    ],
    numericClaims,
    confidence: params.text.trim().length >= 80 || rows.length > 0 || numericClaims.length > 0 ? "medium" : "low",
    needsHumanReview: params.text.trim().length < 80 ||
      (Boolean(params.chartHint) && (params.nativeCharts?.length ?? 0) === 0) ||
      (params.extractionWarnings?.length ?? 0) > 0,
  };
}

function extractDelimitedRows(text: string): string[][] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => looksLikeDelimitedTable(line))
    .map((line) => line.split(/\t|\s{2,}|\|/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 1);
  return rows.slice(0, 120);
}

function extractNumericClaims(
  text: string,
  confidence: DocumentPageArtifact["confidence"]
): DocumentPageArtifact["numericClaims"] {
  const claims: DocumentPageArtifact["numericClaims"] = [];
  for (const line of text.split(/\r?\n/)) {
    const matches = line.matchAll(/(?:^|[\s(:])(-?\d+(?:[.,]\d+)?\s?(?:%|€|EUR|k€|m€|M€|\$|k|m|x|bps)?)(?=$|[\s),;])/gi);
    for (const match of matches) {
      const value = match[1]?.trim();
      if (!value || !looksNumericCell(value)) continue;
      claims.push({
        label: line.replace(value, "").trim().slice(0, 80) || "numeric_value",
        value,
        unit: value.match(/(%|€|EUR|k€|m€|M€|\$|k|m|x|bps)$/i)?.[1],
        sourceText: line.trim().slice(0, 180),
        confidence,
      });
      if (claims.length >= 100) return claims;
    }
  }
  return claims;
}

function looksLikeDelimitedTable(text: string): boolean {
  const line = text.trim();
  if (!line) return false;
  return line.includes("|") || line.includes("\t") || /\S+\s{2,}\S+\s{2,}\S+/.test(line);
}

function looksNumericCell(value: string): boolean {
  const cleaned = value.trim().replace(/[€$£,\s%]/g, "").replace(/[()]/g, "-");
  return cleaned.length > 0 && !Number.isNaN(Number.parseFloat(cleaned));
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
