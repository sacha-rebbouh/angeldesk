#!/usr/bin/env npx tsx
/**
 * Reprocess Excel documents that have NULL extractedText
 *
 * Usage: npx dotenv -e .env.local -- npx tsx scripts/reprocess-excel.ts
 */

import { prisma } from "@/lib/prisma";
import { extractFromExcel, summarizeForLLM } from "@/services/excel";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Finding Excel documents with NULL extractedText...\n");

  const excelMimeTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  const documents = await prisma.document.findMany({
    where: {
      mimeType: { in: excelMimeTypes },
      extractedText: null,
    },
    include: {
      deal: {
        select: { name: true },
      },
    },
  });

  console.log(`Found ${documents.length} Excel documents to reprocess\n`);

  for (const doc of documents) {
    console.log(`Processing: ${doc.name} (Deal: ${doc.deal.name})`);

    // We need to fetch the file from storage
    // Check if we have a storage URL or path
    if (!doc.storageUrl && !doc.storagePath) {
      console.log(`  ❌ No storage URL or path - skipping\n`);
      continue;
    }

    try {
      // Get file path - handle both local paths and URLs
      const storagePath = doc.storagePath || doc.storageUrl;
      if (!storagePath) {
        console.log(`  ❌ No storage path available - skipping\n`);
        continue;
      }

      let buffer: Buffer;

      // Check if it's a local path (starts with /uploads/ or deals/)
      if (storagePath.startsWith("/uploads/") || storagePath.startsWith("deals/")) {
        const relativePath = storagePath.startsWith("/uploads/")
          ? storagePath
          : `/uploads/${storagePath}`;
        const localPath = path.join(process.cwd(), "public", relativePath);
        console.log(`  Reading from local: ${localPath.substring(localPath.length - 50)}...`);

        if (!fs.existsSync(localPath)) {
          console.log(`  ❌ File not found at ${localPath}\n`);
          continue;
        }

        buffer = fs.readFileSync(localPath);
      } else if (storagePath.startsWith("http")) {
        // It's a URL (production)
        console.log(`  Fetching from URL: ${storagePath.substring(0, 50)}...`);

        const response = await fetch(storagePath);
        if (!response.ok) {
          console.log(`  ❌ Failed to fetch: ${response.status}\n`);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        console.log(`  ❌ Unknown storage path format: ${storagePath}\n`);
        continue;
      }

      console.log(`  Extracting text...`);
      const result = extractFromExcel(buffer);

      if (result.success) {
        // Use LLM-optimized summary for financial models (50K to include all sheets)
        const textContent = doc.type === "FINANCIAL_MODEL"
          ? summarizeForLLM(result, 50000)
          : result.text;

        await prisma.document.update({
          where: { id: doc.id },
          data: {
            extractedText: textContent,
            processingStatus: "COMPLETED",
            extractionQuality: result.metadata.totalCells > 0 ? 80 : 50,
            extractionMetrics: {
              sheetCount: result.metadata.sheetCount,
              totalRows: result.metadata.totalRows,
              totalCells: result.metadata.totalCells,
              hasFormulas: result.metadata.hasFormulas,
            },
          },
        });

        console.log(`  ✅ Extracted ${result.metadata.totalCells} cells from ${result.metadata.sheetCount} sheets`);
        console.log(`  Text length: ${textContent.length} chars\n`);
      } else {
        console.log(`  ❌ Extraction failed: ${result.error}\n`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : "Unknown"}\n`);
    }
  }

  console.log("Done!");
  await prisma.$disconnect();
}

main().catch(console.error);
