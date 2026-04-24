import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isExtractionStrictReadinessEnabled,
  isPageArtifactToxic,
  readPageVerificationState,
  REJECTED_EXTRACTION_STATES,
  VERIFIED_EXTRACTION_STATES,
} from "../extraction-readiness-policy";

describe("readPageVerificationState", () => {
  it("returns the state string for a well-formed artifact", () => {
    expect(
      readPageVerificationState({ verification: { state: "provider_structured" } })
    ).toBe("provider_structured");
  });

  it("returns null when artifact is null", () => {
    expect(readPageVerificationState(null)).toBeNull();
  });

  it("returns null when artifact is undefined", () => {
    expect(readPageVerificationState(undefined)).toBeNull();
  });

  it("returns null when artifact is an array", () => {
    expect(readPageVerificationState([])).toBeNull();
  });

  it("returns null when verification is missing", () => {
    expect(readPageVerificationState({})).toBeNull();
  });

  it("returns null when verification is null", () => {
    expect(readPageVerificationState({ verification: null })).toBeNull();
  });

  it("returns null when verification is an array", () => {
    expect(readPageVerificationState({ verification: [] })).toBeNull();
  });

  it("returns null when state is missing", () => {
    expect(readPageVerificationState({ verification: {} })).toBeNull();
  });

  it("returns null when state is not a string", () => {
    expect(readPageVerificationState({ verification: { state: 42 } })).toBeNull();
  });
});

describe("isPageArtifactToxic", () => {
  for (const state of ["heuristic_fallback", "unverified", "parse_failed"]) {
    it(`flags state "${state}" as toxic`, () => {
      expect(isPageArtifactToxic({ verification: { state } })).toBe(true);
    });
  }

  for (const state of ["provider_structured", "cross_validated", "cross_validated_3p"]) {
    it(`does not flag state "${state}" as toxic`, () => {
      expect(isPageArtifactToxic({ verification: { state } })).toBe(false);
    });
  }

  it("does not flag native-legacy artifacts without verification", () => {
    expect(isPageArtifactToxic({})).toBe(false);
    expect(isPageArtifactToxic({ text: "hello" })).toBe(false);
    expect(isPageArtifactToxic(null)).toBe(false);
  });

  it("does not flag unknown states as toxic (conservative - only explicit reject list)", () => {
    expect(isPageArtifactToxic({ verification: { state: "something_new" } })).toBe(false);
  });
});

describe("isExtractionStrictReadinessEnabled", () => {
  const originalValue = process.env.EXTRACTION_STRICT_READINESS;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.EXTRACTION_STRICT_READINESS;
    } else {
      process.env.EXTRACTION_STRICT_READINESS = originalValue;
    }
  });

  it("returns true by default when env var is unset", () => {
    delete process.env.EXTRACTION_STRICT_READINESS;
    expect(isExtractionStrictReadinessEnabled()).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    process.env.EXTRACTION_STRICT_READINESS = "true";
    expect(isExtractionStrictReadinessEnabled()).toBe(true);
  });

  it("returns false only when env var is exactly 'false'", () => {
    process.env.EXTRACTION_STRICT_READINESS = "false";
    expect(isExtractionStrictReadinessEnabled()).toBe(false);
  });

  it("returns true for any other value (kill-switch must be explicit)", () => {
    process.env.EXTRACTION_STRICT_READINESS = "0";
    expect(isExtractionStrictReadinessEnabled()).toBe(true);
  });
});

describe("state sets", () => {
  it("has no overlap between verified and rejected", () => {
    for (const state of VERIFIED_EXTRACTION_STATES) {
      expect(REJECTED_EXTRACTION_STATES.has(state)).toBe(false);
    }
  });
});
