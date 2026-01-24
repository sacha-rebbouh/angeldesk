import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { DocumentType, Prisma } from "@prisma/client";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { uploadFile } from "@/services/storage";

// POST /api/documents/upload - Upload a document
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

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
      "image/png",
      "image/jpeg",
    ];

    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, Excel, PowerPoint, Images (PNG, JPG)" },
        { status: 400 }
      );
    }

    // Max file size: 50MB
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB" },
        { status: 400 }
      );
    }

    // Read file buffer ONCE (File stream can only be read once)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to storage (Vercel Blob in prod, local in dev)
    const uploaded = await uploadFile(`deals/${dealId}/${file.name}`, buffer, {
      access: "public",
    });

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
      },
    });

    // Extract text for PDFs with smart extraction (auto-OCR if needed)
    let extractionWarnings: ExtractionWarning[] = [];
    let extractionQuality: number | null = null;
    let requiresOCR = false;
    let ocrProcessed = false;
    let pagesOCRd = 0;
    let ocrCost = 0;

    if (file.type === "application/pdf") {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        // Smart extraction: regular + auto OCR for low-quality pages
        const result = await smartExtract(buffer, {
          qualityThreshold: 40,
          maxOCRPages: 20,
          autoOCR: true,
        });

        extractionQuality = result.quality;
        pagesOCRd = result.pagesOCRd;
        ocrCost = result.estimatedCost;
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
            message: `OCR applied to ${pagesOCRd} pages with low text content`,
            suggestion: `Extraction enhanced with OCR. Cost: $${ocrCost.toFixed(4)}`
          });
        } else if (result.method === 'ocr') {
          extractionWarnings.push({
            code: 'FULL_OCR',
            severity: 'medium',
            message: 'Full OCR was required - PDF appears to be image-based',
            suggestion: `All text extracted via OCR. Cost: $${ocrCost.toFixed(4)}`
          });
        }

        // Check if quality is still low after OCR
        requiresOCR = extractionQuality < 40 && !ocrProcessed;

        await prisma.document.update({
          where: { id: document.id },
          data: {
            extractedText: result.text,
            processingStatus: "COMPLETED",
            extractionQuality,
            extractionMetrics: {
              quality: extractionQuality,
              method: result.method,
              pagesOCRd,
              ocrCost
            },
            extractionWarnings: extractionWarnings.length > 0
              ? JSON.parse(JSON.stringify(extractionWarnings))
              : Prisma.DbNull,
            requiresOCR,
            ocrProcessed,
          },
        });
      } catch (extractionError) {
        console.error("PDF extraction error:", extractionError);
        const errorMessage = extractionError instanceof Error
          ? extractionError.message
          : "Unknown error";

        await prisma.document.update({
          where: { id: document.id },
          data: {
            processingStatus: "FAILED",
            extractionWarnings: [{
              code: "EXTRACTION_ERROR",
              severity: "critical",
              message: `Extraction failed: ${errorMessage}`,
              suggestion: "The PDF may be corrupted or password-protected."
            }] as Prisma.InputJsonValue,
          },
        });
        extractionWarnings = [{
          code: "EXTRACTION_ERROR",
          severity: "critical",
          message: `Extraction failed: ${errorMessage}`,
          suggestion: "The PDF may be corrupted or password-protected."
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
      };
    } = { data: updatedDocument };

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
      };
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
}
