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
export interface FrameworkLens {
  framework: "yc" | "thiel" | "angel-desk";
  verdict: ThesisVerdict;
  confidence: number;           // 0-100
  question: string;             // la question centrale que ce framework tranche
  claims: FrameworkClaim[];     // claims exposes par cette lunette
  failures: string[];           // points structurels qui font casser ce framework
  strengths: string[];          // points structurels qui soutiennent ce framework
  summary: string;              // 2-3 phrases de synthese
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
// 5 directives anti-hallucination — CLAUDE.md impose leur presence dans TOUS
// les prompts system. FIX (audit P0 #11) : thesis-extractor + 3 frameworks les
// ratent (base-agent les injecte pour Tier 0/1/3 mais pas pour les helpers
// framework-level). Injectees via cette constante pour eviter duplication.
// ---------------------------------------------------------------------------
export const THESIS_ANTI_HALLUCINATION_DIRECTIVES = `
## REGLES ANTI-HALLUCINATION (obligatoires)

### 1. Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

### 2. Abstention Permission
It is perfectly acceptable (and preferred) to say "I don't know" or "I'm not confident enough to answer this." Flag uncertain parts with [UNCERTAIN]. Uncertainty is valued here, not penalised.

### 3. Citation Demand
For every factual claim: cite a specific, verifiable source (doc, slide, benchmark, agent). If no source, mark [UNVERIFIED] and explain why you believe it. Do not present unverified information as established fact.

### 4. Self-Audit
After your response, identify the 3 claims you are LEAST confident about, explain what could be wrong, and rate overall confidence HIGH / MEDIUM / LOW.

### 5. Structured Uncertainty
Structure claims in three buckets:
- **CONFIDENT** (>90% : strong evidence)
- **PROBABLE** (50-90% : likely correct, some uncertainty)
- **SPECULATIVE** (<50% : inferences, pattern-matching, gaps filled)
Do not present speculative claims as confident.
`.trim();
