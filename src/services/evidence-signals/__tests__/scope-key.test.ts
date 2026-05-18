import { describe, expect, it } from "vitest";
import { validateSignalScopeKey } from "../create-signal";

const VALID_CUID = "cjld2cyuq0000t3rmniod1foy";

describe("validateSignalScopeKey", () => {
  describe("run scope", () => {
    it("accepte run:<cuid> avec extractionRunId matching", () => {
      expect(() => validateSignalScopeKey(`run:${VALID_CUID}`, VALID_CUID)).not.toThrow();
    });

    it("rejette run:<cuid> sans extractionRunId", () => {
      expect(() => validateSignalScopeKey(`run:${VALID_CUID}`, null)).toThrow(/requires extractionRunId/);
    });

    it("rejette run:<cuidA> avec extractionRunId=<cuidB> (mismatch)", () => {
      const otherCuid = "cjld2cyuq0000t3rmniod1xxx";
      expect(() => validateSignalScopeKey(`run:${VALID_CUID}`, otherCuid)).toThrow(/must match extractionRunId/);
    });
  });

  describe("filename scope", () => {
    it("accepte filename sans extractionRunId", () => {
      expect(() => validateSignalScopeKey("filename", null)).not.toThrow();
    });

    it("rejette filename avec extractionRunId set", () => {
      expect(() => validateSignalScopeKey("filename", VALID_CUID)).toThrow(/must not have extractionRunId/);
    });
  });

  describe("source_metadata scope (Codex round 7 P2)", () => {
    it("accepte source_metadata sans extractionRunId", () => {
      expect(() => validateSignalScopeKey("source_metadata", null)).not.toThrow();
    });

    it("rejette source_metadata avec extractionRunId set", () => {
      expect(() => validateSignalScopeKey("source_metadata", VALID_CUID)).toThrow(/must not have extractionRunId/);
    });
  });

  describe("human scope", () => {
    it("accepte human:<cuid> sans extractionRunId", () => {
      expect(() => validateSignalScopeKey(`human:${VALID_CUID}`, null)).not.toThrow();
    });

    it("rejette human:<cuid> avec extractionRunId set", () => {
      expect(() => validateSignalScopeKey(`human:${VALID_CUID}`, VALID_CUID)).toThrow(/must not have extractionRunId/);
    });
  });

  describe("import scope", () => {
    it("accepte import:<batchId> sans extractionRunId", () => {
      expect(() => validateSignalScopeKey("import:backfill-2026-05-17", null)).not.toThrow();
    });

    it("rejette import:<batchId> avec extractionRunId set", () => {
      expect(() => validateSignalScopeKey("import:backfill-2026-05-17", VALID_CUID)).toThrow(/must not have extractionRunId/);
    });
  });

  describe("invalid scope formats", () => {
    it("rejette un scope inconnu", () => {
      expect(() => validateSignalScopeKey("unknown_scope", null)).toThrow(/Invalid signalScopeKey/);
    });

    it("rejette une casse incorrecte (Run vs run)", () => {
      expect(() => validateSignalScopeKey(`Run:${VALID_CUID}`, VALID_CUID)).toThrow(/Invalid signalScopeKey/);
    });

    it("rejette une typo (runn vs run)", () => {
      expect(() => validateSignalScopeKey(`runn:${VALID_CUID}`, VALID_CUID)).toThrow(/Invalid signalScopeKey/);
    });

    it("rejette un scope vide", () => {
      expect(() => validateSignalScopeKey("", null)).toThrow(/Invalid signalScopeKey/);
    });
  });
});
