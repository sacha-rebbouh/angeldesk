import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { DocumentType } from "@prisma/client";
import { extractTextFromPDF } from "@/services/pdf/extractor";
import { uploadFile } from "@/services/storage";

// POST /api/documents/upload - Upload a document
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dealId = formData.get("dealId") as string | null;
    const documentType = formData.get("type") as DocumentType | null;

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
    ];

    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, Excel, PowerPoint" },
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
        storagePath: uploaded.pathname,
        storageUrl: uploaded.url,
        mimeType: file.type,
        sizeBytes: file.size,
        processingStatus: "PENDING",
      },
    });

    // Extract text for PDFs
    if (file.type === "application/pdf") {
      await prisma.document.update({
        where: { id: document.id },
        data: { processingStatus: "PROCESSING" },
      });

      try {
        const extraction = await extractTextFromPDF(buffer);

        if (extraction.success && extraction.text) {
          await prisma.document.update({
            where: { id: document.id },
            data: {
              extractedText: extraction.text,
              processingStatus: "COMPLETED",
            },
          });
        } else {
          await prisma.document.update({
            where: { id: document.id },
            data: { processingStatus: "FAILED" },
          });
        }
      } catch (extractionError) {
        console.error("PDF extraction error:", extractionError);
        await prisma.document.update({
          where: { id: document.id },
          data: { processingStatus: "FAILED" },
        });
      }
    }

    // Return fresh document with updated status
    const updatedDocument = await prisma.document.findUnique({
      where: { id: document.id },
    });

    return NextResponse.json({ data: updatedDocument }, { status: 201 });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
}
