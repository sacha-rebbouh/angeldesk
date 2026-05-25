/**
 * Phase C slice C1d-1 — Tests `assertCompletionNotTruncated` helper.
 *
 * Couvre la matrice complète :
 *   1. Données non tronquées → false (pas de throw).
 *   2. Données tronquées sans opt-in → throw avec message clair incluant
 *      le `caller`.
 *   3. Données tronquées avec opt-in → true (caller responsable du
 *      downgrade).
 *   4. Defensive : `data === null`, primitive (`string`, `number`,
 *      `boolean`), tableau → false (rien à inspecter).
 *   5. Champ `_wasTruncated` typé incorrectement (`"true"` string,
 *      `1`, `undefined`) → false (le check est strict `=== true`).
 */

import { describe, expect, it } from "vitest";
import { assertCompletionNotTruncated } from "@/services/openrouter/truncation-guard";

describe("Phase C C1d-1 — assertCompletionNotTruncated", () => {
  describe("Cas nominal — données non tronquées", () => {
    it("retourne `false` sur un objet sans `_wasTruncated`", () => {
      const data = { answer: "ok", score: 42 };
      const result = assertCompletionNotTruncated(data, { caller: "test" });
      expect(result).toBe(false);
    });

    it("retourne `false` sur un objet vide", () => {
      expect(assertCompletionNotTruncated({}, { caller: "test" })).toBe(false);
    });

    it("retourne `false` quand `_wasTruncated: false` explicite", () => {
      const data = { answer: "ok", _wasTruncated: false };
      expect(assertCompletionNotTruncated(data, { caller: "test" })).toBe(false);
    });
  });

  describe("Données tronquées sans opt-in — throw fail-closed", () => {
    it("throw quand `_wasTruncated === true` sans option opt-in", () => {
      const data = { partial: true, _wasTruncated: true };
      expect(() =>
        assertCompletionNotTruncated(data, { caller: "test-caller" }),
      ).toThrow(/LLM JSON response was truncated and auto-repaired/);
    });

    it("le message d'erreur inclut le `caller` pour diagnostic prod", () => {
      const data = { partial: true, _wasTruncated: true };
      expect(() =>
        assertCompletionNotTruncated(data, { caller: "board-member.analyze" }),
      ).toThrow(/\[board-member\.analyze\]/);
    });

    it("le message d'erreur mentionne le opt-in `allowPartialOnTruncation`", () => {
      const data = { partial: true, _wasTruncated: true };
      expect(() =>
        assertCompletionNotTruncated(data, { caller: "test" }),
      ).toThrow(/allowPartialOnTruncation:\s*true/);
    });

    it("throw même avec `allowPartialOnTruncation: false` explicite", () => {
      const data = { partial: true, _wasTruncated: true };
      expect(() =>
        assertCompletionNotTruncated(data, {
          caller: "test",
          allowPartialOnTruncation: false,
        }),
      ).toThrow();
    });
  });

  describe("Données tronquées avec opt-in — retourne true", () => {
    it("retourne `true` quand opt-in `allowPartialOnTruncation: true`", () => {
      const data = { partial: true, _wasTruncated: true };
      const result = assertCompletionNotTruncated(data, {
        caller: "financial-auditor",
        allowPartialOnTruncation: true,
      });
      expect(result).toBe(true);
    });

    it("ne mute pas l'objet `data` (le caller décide quoi en faire)", () => {
      const data = { answer: "partial", _wasTruncated: true };
      assertCompletionNotTruncated(data, {
        caller: "test",
        allowPartialOnTruncation: true,
      });
      // Le helper ne strip pas `_wasTruncated` ; c'est `checkTruncation` qui le fait
      // côté BaseAgent au moment de la normalisation.
      expect(data._wasTruncated).toBe(true);
    });
  });

  describe("Defensive — types non-objet", () => {
    it("retourne `false` sur `null`", () => {
      expect(assertCompletionNotTruncated(null, { caller: "test" })).toBe(false);
    });

    it("retourne `false` sur `undefined`", () => {
      expect(assertCompletionNotTruncated(undefined, { caller: "test" })).toBe(
        false,
      );
    });

    it("retourne `false` sur string", () => {
      expect(
        assertCompletionNotTruncated("hello" as unknown, { caller: "test" }),
      ).toBe(false);
    });

    it("retourne `false` sur number", () => {
      expect(
        assertCompletionNotTruncated(42 as unknown, { caller: "test" }),
      ).toBe(false);
    });

    it("retourne `false` sur boolean", () => {
      expect(
        assertCompletionNotTruncated(true as unknown, { caller: "test" }),
      ).toBe(false);
    });

    it("retourne `false` sur un array (les arrays n'ont pas de `_wasTruncated`)", () => {
      expect(
        assertCompletionNotTruncated(["a", "b"], { caller: "test" }),
      ).toBe(false);
    });
  });

  describe("Defensive — `_wasTruncated` typé incorrectement (check strict `=== true`)", () => {
    it("retourne `false` sur `_wasTruncated: \"true\"` (string)", () => {
      const data = { _wasTruncated: "true" };
      expect(assertCompletionNotTruncated(data, { caller: "test" })).toBe(
        false,
      );
    });

    it("retourne `false` sur `_wasTruncated: 1`", () => {
      const data = { _wasTruncated: 1 };
      expect(assertCompletionNotTruncated(data, { caller: "test" })).toBe(
        false,
      );
    });

    it("retourne `false` sur `_wasTruncated: undefined`", () => {
      const data = { _wasTruncated: undefined };
      expect(assertCompletionNotTruncated(data, { caller: "test" })).toBe(
        false,
      );
    });
  });
});
