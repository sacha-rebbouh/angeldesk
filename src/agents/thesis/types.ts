/**
 * Thesis-First Architecture — types partages
 *
 * Principe : la these d'une societe est decomposee en axes structurels
 * (probleme, solution, why-now, moat, path-to-exit) + hypotheses porteuses
 * (load-bearing). Elle est ensuite analysee via 3 lunettes canoniques (YC, Thiel,
 * Angel Desk) qui extraient chacune leurs claims specifiques et verdict.
 *
 * Le verdict final de la these est le "worst-of-3" (la lunette la plus severe
 * emporte), doctrine explicite : un deal qui passe YC mais echoue Thiel reste
 * flagge — la these est fragile sur un des angles.
 */

// ---------------------------------------------------------------------------
// Labels alignes sur RECOMMENDATION_CONFIG existant (ui-configs.ts)
// very_favorable | favorable | contrasted | vigilance | alert_dominant
// ---------------------------------------------------------------------------
export type ThesisVerdict =
  | "very_favorable"
  | "favorable"
  | "contrasted"
  | "vigilance"
  | "alert_dominant";

export const THESIS_VERDICT_ORDER: ThesisVerdict[] = [
  "very_favorable",
  "favorable",
  "contrasted",
  "vigilance",
  "alert_dominant",
];

/** Retourne le pire verdict (le plus a droite dans l'ordre). Worst-of-3 doctrine. */
export function worstVerdict(verdicts: ThesisVerdict[]): ThesisVerdict {
  if (verdicts.length === 0) return "vigilance";
  return verdicts.reduce((worst, v) => (
    THESIS_VERDICT_ORDER.indexOf(v) > THESIS_VERDICT_ORDER.indexOf(worst) ? v : worst
  ), verdicts[0]);
}

// ---------------------------------------------------------------------------
// Load-bearing assumption — une hypothese SANS laquelle la these s'effondre
// ---------------------------------------------------------------------------
export type LoadBearingStatus =
  | "verified"    // Source auditable confirmant
  | "declared"    // Uniquement dans le deck, non verifie par source externe
  | "projected"   // Projection future (BP, hypothese commerciale)
  | "speculative"; // Aucune donnee pour soutenir

export interface LoadBearingAssumption {
  id: string;            // id stable pour reference cross-sections
  statement: string;     // formulation de l'hypothese
  status: LoadBearingStatus;
  impact: string;        // ce qui casse si l'hypothese est fausse
  validationPath: string; // comment valider/invalider (question, benchmark, etc.)
}

// ---------------------------------------------------------------------------
// Claim d'un framework — affirmation implicite testee contre le reel
// ---------------------------------------------------------------------------
export type ClaimStatus =
  | "supported"    // Reel confirme ce claim
  | "contradicted" // Reel contredit ce claim
  | "unverifiable" // Aucune source disponible pour trancher
  | "partial";     // Partiellement soutenu

export interface FrameworkClaim {
  claim: string;          // "La distribution sera organique via SEO"
  derivedFrom: string;    // "Claim implicite du why-now slide + metrique CAC"
  status: ClaimStatus;
  evidence?: string;      // reference au fact-store / context-engine / benchmark
  concern?: string;       // pourquoi c'est fragile si status != supported
}

// ---------------------------------------------------------------------------
// Output d'une lunette framework (YC, Thiel, Angel Desk)
// ---------------------------------------------------------------------------
export type FrameworkLensAvailability =
  | "evaluated"
  | "degraded_schema_recovered"
  | "degraded_chain_exhausted";

export interface FrameworkLens {
  framework: "yc" | "thiel" | "angel-desk";
  availability?: FrameworkLensAvailability;
  verdict: ThesisVerdict;
  confidence: number;           // 0-100
  question: string;             // la question centrale que ce framework tranche
  claims: FrameworkClaim[];     // claims exposes par cette lunette
  failures: string[];           // points structurels qui font casser ce framework
  strengths: string[];          // points structurels qui soutiennent ce framework
  summary: string;              // 2-3 phrases de synthese
}

export function getFrameworkLensAvailability(
  lens: { availability?: FrameworkLensAvailability | null }
): FrameworkLensAvailability {
  // Backward compatibility: persisted theses created before V8 have no availability field.
  return lens.availability ?? "evaluated";
}

export function isFrameworkLensEvaluated(
  lens: { availability?: FrameworkLensAvailability | null }
): boolean {
  return getFrameworkLensAvailability(lens) === "evaluated";
}

export type ThesisAxisKey =
  | "thesis_quality"
  | "investor_profile_fit"
  | "deal_accessibility";

export interface ThesisAxisEvaluation {
  key: ThesisAxisKey;
  label: string;
  verdict: ThesisVerdict;
  confidence: number;
  summary: string;
  strengths: string[];
  failures: string[];
  claims: string[];
  sourceFrameworks: Array<FrameworkLens["framework"]>; // [] = axis unavailable / degraded
}

export function isThesisAxisUnavailable(
  axis: Pick<ThesisAxisEvaluation, "sourceFrameworks">
): boolean {
  return axis.sourceFrameworks.length === 0;
}

export interface NormalizedThesisEvaluation {
  thesisQuality: ThesisAxisEvaluation;
  investorProfileFit: ThesisAxisEvaluation;
  dealAccessibility: ThesisAxisEvaluation;
}

// ---------------------------------------------------------------------------
// Alert — point a surveiller pour le BA
// ---------------------------------------------------------------------------
export type ThesisAlertSeverity = "critical" | "high" | "medium" | "low";
export type ThesisAlertCategory =
  | "why_now"
  | "problem_reality"
  | "solution_fit"
  | "moat"
  | "unit_economics"
  | "path_to_exit"
  | "team_dependency"
  | "market_size"
  | "assumption_fragile";

export interface ThesisAlert {
  severity: ThesisAlertSeverity;
  category: ThesisAlertCategory;
  title: string;
  detail: string;
  linkedAssumptionId?: string; // ref vers loadBearing si applicable
  linkedClaim?: string;         // ref vers FrameworkClaim si applicable
}

// ---------------------------------------------------------------------------
// Output complet du thesis-extractor (Tier 0.5)
// ---------------------------------------------------------------------------
export interface ThesisExtractorOutput {
  reformulated: string;       // "Angel Desk parie que X en visant Y via Z" (3-5 phrases)
  problem: string;            // description structuree du probleme vise
  solution: string;           // description de la solution apportee
  whyNow: string;             // pourquoi cette these est pertinente maintenant
  moat: string | null;        // defensibilite durable (null si aucune claim credible)
  pathToExit: string | null;  // chemin d'exit envisage (null si indetermine)

  // Verdict consolide (worst-of-3 des 3 lunettes)
  verdict: ThesisVerdict;
  confidence: number;         // 0-100

  // Decomposition structurelle
  loadBearing: LoadBearingAssumption[]; // 3-5 hypotheses porteuses
  alerts: ThesisAlert[];                 // points d'alerte (pas limites a 3)

  // Les 3 lunettes (visibles via expand UI)
  ycLens: FrameworkLens;
  thielLens: FrameworkLens;
  angelDeskLens: FrameworkLens;

  // Traces meta (pour audit / debug)
  sourceDocumentIds: string[];
  sourceHash: string;
}

// ---------------------------------------------------------------------------
// Output du thesis-reconciler (Tier 3) — met a jour le verdict apres Tier 1/2
// ---------------------------------------------------------------------------
export interface ThesisReconcilerOutput {
  updatedVerdict: ThesisVerdict;
  updatedConfidence: number;
  verdictChanged: boolean;    // true si le verdict initial a change apres reconciliation

  // Red flags THESIS_VS_REALITY derives des contradictions detectees
  newRedFlags: Array<{
    category: "THESIS" | "THESIS_VS_REALITY";
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    sourceAgent: string;        // quel agent Tier 1/2 a revele la contradiction
    sourceClaim: string;        // quel claim de la these est contredit
    conflictingFinding: string; // le finding de l'agent qui contredit
  }>;

  // Notes de reconciliation pour la narrative UI
  reconciliationNotes: Array<{
    title: string;
    detail: string;
    impact: "confirms" | "challenges" | "neutral";
  }>;

  // Si le reconciler detecte des strengths inattendues (ex: un agent revele
  // un avantage non mentionne dans le deck), on les remonte ici
  hiddenStrengths: string[];
}

// ---------------------------------------------------------------------------
// Output du rebuttal-judge (action BA one-shot)
// ---------------------------------------------------------------------------
export interface RebuttalJudgeOutput {
  verdict: "valid" | "rejected";
  reasoning: string;      // explication courte pour le BA (2-3 phrases)
  regenerate: boolean;    // si true, declencher re-extraction de la these
  adjustedElements?: {    // si valid : quels elements de la these doivent etre revus
    problem?: string;
    solution?: string;
    whyNow?: string;
    moat?: string;
    pathToExit?: string;
  };
}

// ---------------------------------------------------------------------------
// Decision BA dans le modal bifurcation
// ---------------------------------------------------------------------------
export type ThesisDecision = "stop" | "continue" | "contest";

export const REBUTTAL_PER_DEAL_CAP = 3; // anti-abus

// ---------------------------------------------------------------------------
// 5 directives anti-hallucination — gate de preuve structuré (Phase A v12).
// Refonte slice A9-helpers (D4 verrouillé) : la directive historique de
// seuil d'auto-confiance est SUPPRIMÉE — elle reposait sur une auto-
// confiance déclarée du modèle, contraire à la doctrine §5 (CLAUDE.md,
// reference.yaml §19) et au gate de preuve structuré §6-bis du plan
// Phase A. Les directives 4 et 5 sont également refondues pour ne plus
// utiliser de seuils numériques d'auto-confiance historiques.
//
// Cette constante est injectée dans les prompts thesis (thesis-extractor +
// frameworks YC/Thiel/Angel Desk) — voir CLAUDE.md ANTI-HALLUCINATION
// (les 5 directives obligatoires sont désormais le gate de preuve structuré
// décrit ci-dessous, pas l'ancienne logique de scoring de confiance).
// ---------------------------------------------------------------------------
export const THESIS_ANTI_HALLUCINATION_DIRECTIVES = `
## REGLES ANTI-HALLUCINATION (obligatoires) — Evidence Gate

### 1. Evidence-Based Assertion
Do not assert anything that is not supported by either: (a) a cited source (doc, slide, benchmark, agent output, dataset), (b) a direct observation in the provided context, or (c) an inference explicitly marked as such.
Auto-confidence ("I am 90% sure", "I think this is correct") is NOT evidence. Every factual claim must be traceable to (a), (b), or (c).

### 2. Missing Evidence Handling
When evidence is missing, ambiguous, or contradictory, do NOT fabricate a confident answer.
Return a structured uncertainty marker: "unknown" / "missing_evidence" / "open_question" / "insufficient_data" (or the typed value the agent's schema expects), and tag affected claims with [UNCERTAIN] + a brief reason.
A typed unknown is the correct outcome. It is never penalised here.

### 3. Inference Marking
If a claim is not directly observed or sourced but inferred, mark it explicitly: [INFERRED] or "inferred from <X>". Name the basis (which source, which observation, which pattern).
Do not present inferences as direct observations or as sourced facts. The reader must distinguish "verified" from "reasoned from partial evidence".

### 4. Contradiction Surfacing
When sources, claims, or signals disagree (deck vs. founder declarations, two documents giving different numbers, two agents reaching opposite conclusions), do NOT silently pick one and present it as fact.
Surface the contradiction explicitly: name the disagreeing sources, describe the nature of the disagreement, let the consumer decide. Suppressing a contradiction to deliver a clean answer is a hallucination by omission.

### 5. Evidence Self-Audit
After your response, audit EVIDENCE QUALITY (not auto-confidence):
- Identify the 3 claims with the weakest evidence support (least direct source, most inference, most ambiguous data) and name what evidence is missing
- Confirm every inference is marked [INFERRED] and every uncertain claim is marked [UNCERTAIN]
- Confirm no contradiction in the input data was silently suppressed
The metric here is evidence quality, not declared self-confidence. Do not output any self-confidence score (no qualitative grade, no numeric percentage). Auto-confidence is not evidence.
`.trim();
