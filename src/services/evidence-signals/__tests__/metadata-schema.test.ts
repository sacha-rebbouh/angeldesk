import { describe, expect, it } from "vitest";
import { evidenceSignalMetadataSchema } from "../metadata-schema";

describe("evidenceSignalMetadataSchema (test #15 §6.2 — metadata locked-down)", () => {
  describe("whitelist top-level", () => {
    it("accepte le payload whitelisté minimal", () => {
      expect(() => evidenceSignalMetadataSchema.parse({ modelName: "claude-3-5-sonnet" })).not.toThrow();
    });

    it("accepte une payload pleine avec tous les fields whitelisted", () => {
      const ok = {
        modelName: "claude-3-5-sonnet",
        promptVersion: "v3",
        relatedSignalIds: ["c123abc456def789ghi012jk"],
        parserDebug: { regex: "à\\s+jour\\s+au", matchCount: 2 },
        sourceUrl: "https://crunchbase.com/x",
      };
      expect(() => evidenceSignalMetadataSchema.parse(ok)).not.toThrow();
    });

    it("rejette un field top-level non-whitelisté (strict)", () => {
      expect(() => evidenceSignalMetadataSchema.parse({ rogueField: "x" })).toThrow();
    });
  });

  describe("parserDebug strict whitelist (Codex round 4 P1 fix + round 5 notes removal)", () => {
    it("accepte regex + matchCount + patternId + pageSpan + timingMs (PAS de notes)", () => {
      const ok = {
        parserDebug: {
          regex: "(?:Confidentiel|Confidential)\\s*[–-]\\s*\\w+\\s+\\d{4}",
          patternId: "doc-footer-date",
          matchCount: 32,
          pageSpan: [1, 2, 3, 24],
          timingMs: 45,
        },
      };
      expect(() => evidenceSignalMetadataSchema.parse(ok)).not.toThrow();
    });

    it("test critique Codex round 5 — rejette parserDebug.notes (champ supprimé pour interdire texte libre)", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          parserDebug: { notes: "Footer signature matched on E4N deck" },
        })
      ).toThrow();
    });

    it("test critique Codex round 5 — un extrait OCR court qui ne match pas les patterns sensibles n'a plus de porte dérobée", () => {
      // Avant round 5: ce payload passait (notes <= 200 chars + pas de mot-clé sensible).
      // Après round 5: rejeté car notes n'existe plus dans le whitelist.
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          parserDebug: { notes: "Table de capitalisation à jour au 18/09/2024" },
        })
      ).toThrow();
    });

    it("Codex round 5 — patternId est un slug, pas du texte libre (rejette les espaces, accents, ponctuation)", () => {
      const slug = { parserDebug: { patternId: "doc-footer-date_v2" } };
      expect(() => evidenceSignalMetadataSchema.parse(slug)).not.toThrow();

      const freeText = { parserDebug: { patternId: "Table de capitalisation à jour au 18/09/2024" } };
      expect(() => evidenceSignalMetadataSchema.parse(freeText)).toThrow();
    });

    it("test critique Codex round 4 — rejette rawOcr en ARRAY de strings (bypass impossible)", () => {
      // Before fix: validator only checked string values, so arrays passed.
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          parserDebug: { rawOcr: ["Table de capitalisation à jour au 18/09/2024"] },
        })
      ).toThrow();
    });

    it("test critique Codex round 4 — rejette amountEur en NUMBER (bypass impossible)", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          parserDebug: { amountEur: 6_000_000 },
        })
      ).toThrow();
    });

    it("test critique Codex round 4 — rejette promptBody en ARRAY (bypass impossible)", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          parserDebug: { promptBody: ["You are an AI analyst"] },
        })
      ).toThrow();
    });

    it("rejette un parserDebug key inconnu (strict)", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({ parserDebug: { someUnknownKey: "x" } })
      ).toThrow();
    });

    it("rejette un regex > 200 chars (proxy)", () => {
      const longRegex = "(" + "a".repeat(201) + ")";
      expect(() =>
        evidenceSignalMetadataSchema.parse({ parserDebug: { regex: longRegex } })
      ).toThrow();
    });

    it("rejette un matchCount négatif ou trop grand", () => {
      expect(() => evidenceSignalMetadataSchema.parse({ parserDebug: { matchCount: -1 } })).toThrow();
      expect(() => evidenceSignalMetadataSchema.parse({ parserDebug: { matchCount: 999_999 } })).toThrow();
    });

    it("rejette un pageSpan > 50 entries", () => {
      const pages = Array.from({ length: 51 }, (_, i) => i + 1);
      expect(() => evidenceSignalMetadataSchema.parse({ parserDebug: { pageSpan: pages } })).toThrow();
    });
  });

  describe("deep-walk defense-in-depth sur les fields whitelistés", () => {
    it("rejette un regex contenant 'raw ocr' (sensitive string pattern)", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          parserDebug: { regex: "match raw ocr block" },
        })
      ).toThrow(/sensitive content rejected/i);
    });

    it("rejette un modelName contenant 'prompt body'", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({
          modelName: "model-with-prompt-body-leak",
        })
      ).toThrow(/sensitive content rejected/i);
    });
  });

  describe("autres invariants", () => {
    it("rejette une URL non-https/http (sourceUrl validator)", () => {
      expect(() => evidenceSignalMetadataSchema.parse({ sourceUrl: "not-a-url" })).toThrow();
    });

    it("rejette plus de 20 relatedSignalIds", () => {
      const ids = Array.from({ length: 21 }, () => "c123abc456def789ghi012jk");
      expect(() => evidenceSignalMetadataSchema.parse({ relatedSignalIds: ids })).toThrow();
    });

    it("rejette un relatedSignalId mal formé", () => {
      expect(() =>
        evidenceSignalMetadataSchema.parse({ relatedSignalIds: ["not-a-cuid"] })
      ).toThrow();
    });
  });
});
