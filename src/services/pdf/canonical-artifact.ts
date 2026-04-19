export const DOCUMENT_PAGE_ARTIFACT_V1 = "document-page-artifact-v1" as const;
export const DOCUMENT_PAGE_ARTIFACT_V2 = "document-page-artifact-v2" as const;
export const OPENROUTER_VLM_PROVIDER_KIND = "openrouter-vlm" as const;
export const OPENROUTER_VLM_PROVIDER_VERSION = "openrouter-v1" as const;
export const STANDARD_OCR_PROMPT_VERSION = "ocr-standard-v2" as const;
export const STRUCTURED_OCR_PROMPT_VERSION = "ocr-structured-v2" as const;
export const STRUCTURED_OCR_SCHEMA_VERSION = "ocr-structured-schema-v1" as const;

export type DocumentPageArtifactVersion =
  | typeof DOCUMENT_PAGE_ARTIFACT_V1
  | typeof DOCUMENT_PAGE_ARTIFACT_V2;

export type ArtifactTransport = "legacy_text" | "json_object" | "json_schema" | "provider_structured";

export type ArtifactVerificationState =
  | "unverified"
  | "provider_structured"
  | "heuristic_fallback"
  | "parse_failed";

export interface ArtifactProviderMetadata {
  kind: typeof OPENROUTER_VLM_PROVIDER_KIND | "google-document-ai" | "azure-document-intelligence" | "native";
  modelId?: string;
  mode?: string;
  providerVersion?: string;
  schemaVersion?: string;
  promptVersion?: string;
  transport?: ArtifactTransport;
}

export interface ArtifactVerificationMetadata {
  state: ArtifactVerificationState;
  evidence: string[];
  issues?: string[];
}

export interface StructuredOCRVisualBlock {
  type: "table" | "chart" | "diagram" | "image" | "text" | "unknown";
  title?: string | null;
  description: string;
  confidence: "high" | "medium" | "low";
}

export interface StructuredOCRTable {
  title?: string | null;
  markdown?: string | null;
  rows?: string[][];
  confidence: "high" | "medium" | "low";
}

export interface StructuredOCRChart {
  title?: string | null;
  chartType?: string | null;
  description: string;
  series?: string[];
  values?: Array<{ label: string; value: string }>;
  confidence: "high" | "medium" | "low";
}

export interface StructuredOCRUnreadableRegion {
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface StructuredOCRNumericClaim {
  label: string;
  value: string;
  unit?: string | null;
  sourceText: string;
  confidence: "high" | "medium" | "low";
}

export interface StructuredOCRPagePayload {
  pageText: string;
  visualBlocks: StructuredOCRVisualBlock[];
  tables: StructuredOCRTable[];
  charts: StructuredOCRChart[];
  unreadableRegions: StructuredOCRUnreadableRegion[];
  numericClaims: StructuredOCRNumericClaim[];
  needsHumanReview: boolean;
}

export function buildStructuredOCRResponseFormat(name: string) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name,
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          pageText: {
            type: "string",
            description: "All visible normal text on the page in reading order. Preserve headings, bullets, footnotes, and labels.",
          },
          visualBlocks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: {
                  type: "string",
                  enum: ["table", "chart", "diagram", "image", "text", "unknown"],
                },
                title: {
                  anyOf: [{ type: "string" }, { type: "null" }],
                },
                description: { type: "string" },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
              },
              required: ["type", "description", "confidence", "title"],
            },
          },
          tables: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { anyOf: [{ type: "string" }, { type: "null" }] },
                markdown: { anyOf: [{ type: "string" }, { type: "null" }] },
                rows: {
                  anyOf: [
                    {
                      type: "array",
                      items: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    { type: "null" },
                  ],
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
              },
              required: ["title", "markdown", "rows", "confidence"],
            },
          },
          charts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { anyOf: [{ type: "string" }, { type: "null" }] },
                chartType: { anyOf: [{ type: "string" }, { type: "null" }] },
                description: { type: "string" },
                series: {
                  anyOf: [
                    {
                      type: "array",
                      items: { type: "string" },
                    },
                    { type: "null" },
                  ],
                },
                values: {
                  anyOf: [
                    {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          label: { type: "string" },
                          value: { type: "string" },
                        },
                        required: ["label", "value"],
                      },
                    },
                    { type: "null" },
                  ],
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
              },
              required: ["title", "chartType", "description", "series", "values", "confidence"],
            },
          },
          unreadableRegions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                reason: { type: "string" },
                severity: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                },
              },
              required: ["reason", "severity"],
            },
          },
          numericClaims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                unit: { anyOf: [{ type: "string" }, { type: "null" }] },
                sourceText: { type: "string" },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
              },
              required: ["label", "value", "unit", "sourceText", "confidence"],
            },
          },
          needsHumanReview: { type: "boolean" },
        },
        required: [
          "pageText",
          "visualBlocks",
          "tables",
          "charts",
          "unreadableRegions",
          "numericClaims",
          "needsHumanReview",
        ],
      },
    },
  };
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

export function normalizeStructuredOCRPayload(value: unknown): StructuredOCRPagePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.pageText !== "string" || typeof record.needsHumanReview !== "boolean") {
    return null;
  }

  return {
    pageText: record.pageText.trim(),
    visualBlocks: Array.isArray(record.visualBlocks)
      ? record.visualBlocks.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const entry = item as Record<string, unknown>;
          const type = typeof entry.type === "string" &&
            ["table", "chart", "diagram", "image", "text", "unknown"].includes(entry.type)
            ? entry.type as StructuredOCRVisualBlock["type"]
            : "unknown";
          if (typeof entry.description !== "string") return [];
          return [{
            type,
            title: typeof entry.title === "string" ? entry.title : null,
            description: entry.description,
            confidence: normalizeConfidence(entry.confidence),
          }];
        })
      : [],
    tables: Array.isArray(record.tables)
      ? record.tables.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const entry = item as Record<string, unknown>;
          return [{
            title: typeof entry.title === "string" ? entry.title : null,
            markdown: typeof entry.markdown === "string" ? entry.markdown : null,
            rows: Array.isArray(entry.rows)
              ? entry.rows.filter(Array.isArray).map((row) => row.map(String))
              : undefined,
            confidence: normalizeConfidence(entry.confidence),
          }];
        })
      : [],
    charts: Array.isArray(record.charts)
      ? record.charts.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const entry = item as Record<string, unknown>;
          if (typeof entry.description !== "string") return [];
          return [{
            title: typeof entry.title === "string" ? entry.title : null,
            chartType: typeof entry.chartType === "string" ? entry.chartType : null,
            description: entry.description,
            series: Array.isArray(entry.series) ? entry.series.map(String) : undefined,
            values: Array.isArray(entry.values)
              ? entry.values.flatMap((rawValue) => {
                  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) return [];
                  const claim = rawValue as Record<string, unknown>;
                  if (typeof claim.label !== "string" || typeof claim.value !== "string") return [];
                  return [{ label: claim.label, value: claim.value }];
                })
              : undefined,
            confidence: normalizeConfidence(entry.confidence),
          }];
        })
      : [],
    unreadableRegions: Array.isArray(record.unreadableRegions)
      ? record.unreadableRegions.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const entry = item as Record<string, unknown>;
          if (typeof entry.reason !== "string") return [];
          return [{
            reason: entry.reason,
            severity: normalizeSeverity(entry.severity),
          }];
        })
      : [],
    numericClaims: Array.isArray(record.numericClaims)
      ? record.numericClaims.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const entry = item as Record<string, unknown>;
          if (
            typeof entry.label !== "string" ||
            typeof entry.value !== "string" ||
            typeof entry.sourceText !== "string"
          ) {
            return [];
          }
          return [{
            label: entry.label,
            value: entry.value,
            unit: typeof entry.unit === "string" ? entry.unit : null,
            sourceText: entry.sourceText,
            confidence: normalizeConfidence(entry.confidence),
          }];
        })
      : [],
    needsHumanReview: record.needsHumanReview,
  };
}

export function summarizeStructuredOCREvidence(payload: StructuredOCRPagePayload): string[] {
  return [
    `${payload.visualBlocks.length} visual block(s)`,
    `${payload.tables.length} table(s)`,
    `${payload.charts.length} chart(s)`,
    `${payload.numericClaims.length} numeric claim(s)`,
    `${payload.unreadableRegions.length} unreadable region(s)`,
  ];
}
