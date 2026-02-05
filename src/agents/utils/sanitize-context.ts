/**
 * Agent Context Sanitization Utilities
 *
 * Provides functions to sanitize user-provided data before it's embedded
 * in LLM prompts to prevent prompt injection attacks.
 */

import { sanitizeForLLM, sanitizeName } from "@/lib/sanitize";
import type { AgentContext, EnrichedAgentContext } from "../types";

/**
 * Sanitize a deal object for safe use in LLM prompts
 */
export function sanitizeDealForPrompt(deal: AgentContext["deal"]): {
  name: string;
  companyName: string;
  description: string;
  sector: string;
  stage: string;
  geography: string;
  website: string;
} {
  return {
    name: sanitizeName(deal.name),
    companyName: sanitizeName(deal.companyName ?? ""),
    description: sanitizeForLLM(deal.description ?? "", { maxLength: 5000 }),
    sector: sanitizeName(deal.sector ?? ""),
    stage: sanitizeName(deal.stage ?? ""),
    geography: sanitizeName(deal.geography ?? ""),
    website: sanitizeName(deal.website ?? ""),
  };
}

/**
 * Sanitize document content for safe use in LLM prompts
 */
export function sanitizeDocumentContent(
  documents: AgentContext["documents"]
): Array<{
  id: string;
  name: string;
  type: string;
  extractedText: string;
}> {
  if (!documents) return [];

  return documents.map((doc) => ({
    id: doc.id,
    name: sanitizeName(doc.name),
    type: sanitizeName(doc.type),
    extractedText: sanitizeForLLM(doc.extractedText ?? "", { maxLength: 50000 }),
  }));
}

/**
 * Sanitize extracted data from documents
 */
export function sanitizeExtractedData(
  extractedData: Record<string, unknown> | null | undefined
): string {
  if (!extractedData) return "No extracted data available";

  try {
    const stringified = JSON.stringify(extractedData, null, 2);
    return sanitizeForLLM(stringified, { maxLength: 50000 });
  } catch {
    return "Invalid extracted data";
  }
}

/**
 * Sanitize previous agent results for context
 */
export function sanitizePreviousResults(
  previousResults: EnrichedAgentContext["previousResults"]
): string {
  if (!previousResults || Object.keys(previousResults).length === 0) {
    return "No previous results available";
  }

  try {
    // Filter out large raw data and keep summaries
    const sanitizedResults: Record<string, unknown> = {};

    for (const [key, result] of Object.entries(previousResults)) {
      if (result?.success) {
        // Only include basic success info
        sanitizedResults[key] = {
          success: true,
          agentName: result.agentName,
        };
      }
    }

    const stringified = JSON.stringify(sanitizedResults, null, 2);
    return sanitizeForLLM(stringified, { maxLength: 30000 });
  } catch {
    return "Error processing previous results";
  }
}

/**
 * Build a sanitized prompt section from deal data
 */
export function buildSanitizedDealSection(deal: AgentContext["deal"]): string {
  const sanitized = sanitizeDealForPrompt(deal);

  return `## Deal Information

**Company:** ${sanitized.companyName || sanitized.name}
**Sector:** ${sanitized.sector || "Not specified"}
**Stage:** ${sanitized.stage || "Not specified"}
**Geography:** ${sanitized.geography || "Not specified"}
**Website:** ${sanitized.website || "Not provided"}

**Description:**
${sanitized.description || "No description available"}`;
}

/**
 * Build a sanitized prompt section from documents
 */
export function buildSanitizedDocumentsSection(
  documents: AgentContext["documents"]
): string {
  if (!documents || documents.length === 0) {
    return "## Documents\n\nNo documents available.";
  }

  const sanitized = sanitizeDocumentContent(documents);

  const docSections = sanitized.map((doc) => {
    const textPreview = doc.extractedText
      ? doc.extractedText.substring(0, 10000) +
        (doc.extractedText.length > 10000 ? "\n[...truncated...]" : "")
      : "No text extracted";

    return `### ${doc.name} (${doc.type})

${textPreview}`;
  });

  return `## Documents

${docSections.join("\n\n---\n\n")}`;
}
