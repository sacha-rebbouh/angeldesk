import type { DataReliability, ReliabilityClassification } from "./types";
import { RELIABILITY_WEIGHTS } from "./types";

export interface ValidationReliabilityInput {
  status: "VERIFIED" | "CONTRADICTED" | "UNVERIFIABLE";
  validatedBy: string;
  explanation: string;
}

export function computeTruthConfidence(
  sourceConfidence: number,
  reliability: DataReliability
): number {
  return Math.max(
    0,
    Math.min(100, Math.round(sourceConfidence * RELIABILITY_WEIGHTS[reliability]))
  );
}

export function buildReliabilityFromValidation(
  input: ValidationReliabilityInput
): ReliabilityClassification | undefined {
  if (input.status === "UNVERIFIABLE") {
    return undefined;
  }

  if (input.status === "VERIFIED") {
    return {
      reliability: "VERIFIED",
      reasoning: input.explanation,
      isProjection: false,
      verificationMethod: input.validatedBy,
    };
  }

  return {
    reliability: "ESTIMATED",
    reasoning: input.explanation,
    isProjection: false,
    verificationMethod: input.validatedBy,
  };
}

export function buildDeclaredReliability(
  reasoning: string,
  verificationMethod: string
): ReliabilityClassification {
  return {
    reliability: "DECLARED",
    reasoning,
    isProjection: false,
    verificationMethod,
  };
}
