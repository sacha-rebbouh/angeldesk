/**
 * OpenAPI 3.1 specification for Angel Desk API v1.
 * Served at GET /api/v1/openapi.json
 */

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Angel Desk API",
    version: "1.0.0",
    description:
      "API pour la plateforme de Due Diligence IA Angel Desk. Authentification via API key (header Authorization: Bearer ak_xxx).",
  },
  servers: [
    { url: "https://app.angeldesk.io/api/v1", description: "Production" },
    { url: "http://localhost:3003/api/v1", description: "Development" },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key prefixed ak_",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["ok", "error"],
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
      DealSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          companyName: { type: "string", nullable: true },
          sector: { type: "string", nullable: true },
          stage: { type: "string", nullable: true },
          status: { type: "string" },
          geography: { type: "string", nullable: true },
          globalScore: { type: "number", nullable: true },
          valuationPre: { type: "number", nullable: true },
          arr: { type: "number", nullable: true },
          documentsCount: { type: "integer" },
          redFlagsCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DealDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          companyName: { type: "string", nullable: true },
          sector: { type: "string", nullable: true },
          stage: { type: "string", nullable: true },
          status: { type: "string" },
          geography: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          website: { type: "string", nullable: true },
          globalScore: { type: "number", nullable: true },
          valuationPre: { type: "number", nullable: true },
          arr: { type: "number", nullable: true },
          amountRequested: { type: "number", nullable: true },
          growthRate: { type: "number", nullable: true },
          founders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                role: { type: "string", nullable: true },
                linkedinUrl: { type: "string", nullable: true },
              },
            },
          },
          documents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                type: { type: "string" },
                processingStatus: { type: "string" },
                extractionQuality: { type: "number", nullable: true },
                version: { type: "integer" },
                uploadedAt: { type: "string", format: "date-time" },
              },
            },
          },
          redFlags: {
            type: "array",
            items: { $ref: "#/components/schemas/RedFlag" },
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DealCreate: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          companyName: { type: "string", maxLength: 200, nullable: true },
          sector: { type: "string", maxLength: 100, nullable: true },
          stage: {
            type: "string",
            enum: ["SOURCING", "SCREENING", "DEEP_DD", "NEGOTIATION", "CLOSED", "PASSED"],
            nullable: true,
          },
          geography: { type: "string", maxLength: 100, nullable: true },
          description: { type: "string", maxLength: 5000, nullable: true },
          website: { type: "string", format: "uri", nullable: true },
          arr: { type: "number", minimum: 0, nullable: true },
          growthRate: { type: "number", nullable: true },
          amountRequested: { type: "number", minimum: 0, nullable: true },
          valuationPre: { type: "number", minimum: 0, nullable: true },
        },
      },
      RedFlag: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          category: { type: "string" },
          status: { type: "string", enum: ["OPEN", "INVESTIGATING", "RESOLVED", "ACCEPTED"] },
          confidenceScore: { type: "number", nullable: true },
          questionsToAsk: { type: "array", items: { type: "string" } },
          detectedAt: { type: "string", format: "date-time" },
        },
      },
      Analysis: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["SCREENING", "FULL_DD"] },
          status: { type: "string", enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"] },
          results: { type: "object", nullable: true },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          totalCost: { type: "number", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string", format: "uri" },
          events: {
            type: "array",
            items: {
              type: "string",
              enum: ["analysis.completed", "analysis.failed", "red_flag.detected", "deal.created", "deal.updated"],
            },
          },
          active: { type: "boolean" },
          lastTriggeredAt: { type: "string", format: "date-time", nullable: true },
          failureCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          keyPrefix: { type: "string" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/deals": {
      get: {
        operationId: "listDeals",
        summary: "Liste des deals",
        tags: ["Deals"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "sector", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Liste paginee des deals",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", const: true },
                    data: {
                      type: "object",
                      properties: {
                        deals: { type: "array", items: { $ref: "#/components/schemas/DealSummary" } },
                        pagination: { $ref: "#/components/schemas/Pagination" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Non authentifie", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        operationId: "createDeal",
        summary: "Creer un deal",
        tags: ["Deals"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DealCreate" } } },
        },
        responses: {
          "201": {
            description: "Deal cree",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { $ref: "#/components/schemas/DealDetail" } } } } },
          },
          "400": { description: "Erreur de validation", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/deals/{dealId}": {
      get: {
        operationId: "getDeal",
        summary: "Detail d'un deal",
        tags: ["Deals"],
        parameters: [{ name: "dealId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Deal detail", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { $ref: "#/components/schemas/DealDetail" } } } } } },
          "404": { description: "Deal introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      patch: {
        operationId: "updateDeal",
        summary: "Modifier un deal",
        tags: ["Deals"],
        parameters: [{ name: "dealId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/DealCreate" } } },
        },
        responses: {
          "200": { description: "Deal mis a jour", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { $ref: "#/components/schemas/DealDetail" } } } } } },
          "404": { description: "Deal introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        operationId: "deleteDeal",
        summary: "Supprimer un deal",
        tags: ["Deals"],
        parameters: [{ name: "dealId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Deal supprime", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { type: "object", properties: { deleted: { type: "boolean" } } } } } } } },
          "404": { description: "Deal introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/deals/{dealId}/red-flags": {
      get: {
        operationId: "listRedFlags",
        summary: "Red flags d'un deal",
        tags: ["Red Flags"],
        parameters: [
          { name: "dealId", in: "path", required: true, schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "INVESTIGATING", "RESOLVED", "ACCEPTED"] } },
        ],
        responses: {
          "200": { description: "Liste des red flags", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/RedFlag" } } } } } } },
          "404": { description: "Deal introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/deals/{dealId}/analyses": {
      get: {
        operationId: "listAnalyses",
        summary: "Analyses d'un deal",
        tags: ["Analyses"],
        parameters: [{ name: "dealId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Liste des analyses", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/Analysis" } } } } } } },
          "404": { description: "Deal introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        operationId: "launchAnalysis",
        summary: "Lancer une analyse",
        tags: ["Analyses"],
        parameters: [{ name: "dealId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["quick", "full"], default: "full", description: "quick = screening (4 agents), full = DD complete (18 agents)" },
                },
              },
            },
          },
        },
        responses: {
          "202": { description: "Analyse lancee", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { $ref: "#/components/schemas/Analysis" } } } } } },
          "409": { description: "Analyse deja en cours", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/webhooks": {
      get: {
        operationId: "listWebhooks",
        summary: "Liste des webhooks",
        tags: ["Webhooks"],
        responses: {
          "200": { description: "Liste des webhooks", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/Webhook" } } } } } } },
        },
      },
      post: {
        operationId: "createWebhook",
        summary: "Enregistrer un webhook",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url", "events"],
                properties: {
                  url: { type: "string", format: "uri", description: "HTTPS uniquement" },
                  events: {
                    type: "array",
                    items: { type: "string", enum: ["analysis.completed", "analysis.failed", "red_flag.detected", "deal.created", "deal.updated"] },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Webhook cree (secret retourne une seule fois)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/Webhook" },
                        { type: "object", properties: { secret: { type: "string", description: "HMAC secret, visible une seule fois" } } },
                      ],
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Erreur de validation ou limite atteinte", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        operationId: "deleteWebhook",
        summary: "Supprimer un webhook",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "Webhook supprime" },
          "404": { description: "Webhook introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/keys": {
      get: {
        operationId: "listApiKeys",
        summary: "Liste des cles API",
        description: "Authentification via session Clerk (pas via API key)",
        tags: ["API Keys"],
        security: [],
        responses: {
          "200": { description: "Liste des cles", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } } } } } } },
        },
      },
      post: {
        operationId: "createApiKey",
        summary: "Creer une cle API",
        description: "Authentification via session Clerk. Requiert abonnement Pro.",
        tags: ["API Keys"],
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string", default: "API Key" } } },
            },
          },
        },
        responses: {
          "201": {
            description: "Cle creee (key visible une seule fois)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/ApiKey" },
                        { type: "object", properties: { key: { type: "string", description: "Cle complete, visible une seule fois" } } },
                      ],
                    },
                  },
                },
              },
            },
          },
          "403": { description: "Abonnement Pro requis", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        operationId: "revokeApiKey",
        summary: "Revoquer une cle API",
        tags: ["API Keys"],
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "Cle revoquee" },
        },
      },
    },
  },
} as const;
