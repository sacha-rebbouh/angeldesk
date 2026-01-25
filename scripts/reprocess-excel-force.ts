#!/usr/bin/env npx tsx
/**
 * Force reprocess ALL Excel documents with new format
 */

import { prisma } from "@/lib/prisma";
import { extractFromExcel, summarizeForLLM } from "@/services/excel";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const excelMimeTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  const documents = await prisma.document.findMany({
    where: { mimeType: { in: excelMimeTypes } },
    include: { deal: { select: { name: true } } }
  });

  console.log("Reprocessing", documents.length, "Excel documents with NEW FORMAT...\n");

  for (const doc of documents) {
    console.log("Processing:", doc.name);

    const storagePath = doc.storagePath || doc.storageUrl;
    if (!storagePath) {
      console.log("  No storage path");
      continue;
    }

    const relativePath = storagePath.startsWith("/uploads/")
      ? storagePath
      : `/uploads/${storagePath}`;
    const localPath = path.join(process.cwd(), "public", relativePath);

    if (!fs.existsSync(localPath)) {
      console.log("  File not found:", localPath);
      continue;
    }

    const buffer = fs.readFileSync(localPath);
    const result = extractFromExcel(buffer);

    if (result.success) {
      // 50K chars to ensure ALL sheets are included
      const textContent = doc.type === "FINANCIAL_MODEL"
        ? summarizeForLLM(result, 50000)
        : summarizeForLLM(result);

      await prisma.document.update({
        where: { id: doc.id },
        data: { extractedText: textContent }
      });

      console.log("  OK - New format, length:", textContent.length);
      console.log("  Preview (first 1500 chars):");
      console.log("  " + textContent.substring(0, 1500).split("\n").join("\n  "));
      console.log("\n");
    } else {
      console.log("  FAILED:", result.error);
    }
  }

  console.log("Done!");
  await prisma.$disconnect();
}

main().catch(console.error);
