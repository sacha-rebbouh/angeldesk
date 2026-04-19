/**
 * Downstream LLM quality benchmark — old (VLM-only) vs new (Google DocAI + VLM) stack.
 *
 * Pourquoi ce protocole :
 *  - Pas de juge LLM (tautologique, fragile, cher).
 *  - Pas de self-scoring (un LLM ne peut pas noter honnêtement sa propre sortie).
 *  - 1 seul appel LLM par stack, questions fixes senior-BA.
 *  - Grading 100% déterministe : on vérifie si chaque `quote` cité par le LLM
 *    existe littéralement dans l'extract (normalisé). Pas de citation => hallucination.
 *  - Faux-abstention croisé : si un stack dit "NOT_IN_DOCUMENT" et l'autre trouve
 *    une citation grounded, le premier a perdu l'info.
 *
 * Métriques par stack :
 *  - coverage              : # questions avec réponse (non NOT_IN_DOCUMENT) / total
 *  - strict_grounding_rate : # literal grounded / # réponses
 *  - semantic_grounding_rate : # semantically grounded / # réponses
 *  - hallucination_rate    : # quotes introuvables / # réponses
 *  - false_abstention_rate : # NOT_IN_DOCUMENT alors que l'autre stack a grounded
 *  - useful_grounded       : # questions avec réponse grounded (signal principal)
 *
 * Verdict :
 *  - NEW ≫ OLD si (useful_grounded_new > useful_grounded_old) et
 *    hallucination_rate_new <= hallucination_rate_old + 0.05
 *  - OLD ≫ NEW si inversion stricte
 *  - TIE sinon (avec breakdown)
 */

import fs from "node:fs/promises";

import { smartExtract } from "../src/services/pdf";
import { buildGoldenAuditSnapshot } from "../src/services/pdf/golden-corpus";
import { MODELS, type ModelKey } from "../src/services/openrouter/client";
import { completeJSON, ensureLLMContext } from "../src/services/openrouter/router";

// ---------------------------------------------------------------------------
// Question set — senior BA diligence staples. Volontairement générique pour
// être réutilisable sur tout deck / memo. 12 questions = output JSON compact.
// ---------------------------------------------------------------------------

const QUESTIONS: Array<{ id: string; question: string }> = [
  { id: "thesis",       question: "Quelle est la thèse d'investissement centrale du document (en 1-2 phrases) ?" },
  { id: "business",     question: "Quel est précisément le modèle d'affaires / comment la société génère du revenu ?" },
  { id: "traction",     question: "Quels chiffres de traction concrets sont présentés (ARR/MRR, clients, GMV, unités, occupancy, etc.) ? Citer le chiffre exact." },
  { id: "financials",   question: "Quelles projections financières clés sont données (revenus futurs, EBITDA, marges) avec les horizons temporels ?" },
  { id: "valuation",    question: "Quelle valorisation / prix d'entrée / taille de round est évoquée ? Montant exact." },
  { id: "use_of_funds", question: "Comment les fonds levés seront-ils utilisés (répartition) ?" },
  { id: "unit_econ",    question: "Quels unit economics sont donnés (CAC, LTV, payback, yield par unité, marge brute unitaire) ?" },
  { id: "market",       question: "Quelle est la taille de marché revendiquée (TAM/SAM/SOM ou équivalent sectoriel) avec les chiffres ?" },
  { id: "competition",  question: "Quels concurrents directs sont nommés et quel est l'angle différenciant ?" },
  { id: "team",         question: "Qui est l'équipe fondatrice/dirigeante et quels sont leurs backgrounds concrets ?" },
  { id: "risks",        question: "Quels sont les 2-3 risques les plus explicitement mentionnés dans le document ?" },
  { id: "asks_ic",      question: "Quelles sont les 3 questions critiques qu'un comité d'investissement poserait mais auxquelles le document NE RÉPOND PAS clairement ?" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const GOOGLE_ENV_KEYS = [
  "GOOGLE_DOCUMENT_AI_PROCESSOR_NAME",
  "GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_BASE64",
  "GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON",
  "GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_FILE",
  "GOOGLE_DOCUMENT_AI_CLIENT_EMAIL",
  "GOOGLE_DOCUMENT_AI_PRIVATE_KEY",
  "GOOGLE_DOCUMENT_AI_ACCESS_TOKEN",
  "GOOGLE_DOCUMENT_AI_USE_METADATA_AUTH",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

const AZURE_ENV_KEYS = [
  "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
  "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
  "AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID",
  "AZURE_DOCUMENT_INTELLIGENCE_API_VERSION",
];

type StackLabel = "old" | "new";

interface ExtractRun {
  label: StackLabel;
  text: string;
  method: "text" | "ocr" | "hybrid";
  quality: number;
  pagesOCRd: number;
  estimatedCost: number;
  snapshot: ReturnType<typeof buildGoldenAuditSnapshot>;
}

interface LlmAnswer {
  id: string;
  status: "answered" | "not_in_document";
  answer: string;
  /** Array of literal, contiguous spans from the extract proving the answer. Each span is graded separately. */
  evidence: string[];
  page_hint: number | null;
  confidence: "high" | "medium" | "low";
}

interface LlmResponse {
  answers: LlmAnswer[];
  _wasTruncated?: boolean;
}

interface GradedAnswer extends LlmAnswer {
  /** Per-span grounding results. */
  evidence_strict_grounded: boolean[];
  evidence_semantic_grounded: boolean[];
  /** Strict = every span is a literal contiguous substring after normalization. */
  strict_grounded: boolean;
  /** Semantic = every span passes tolerant lexical+numeric grounding after token normalization. */
  semantic_grounded: boolean;
  false_abstention: boolean;       // said NOT_IN_DOC but other stack grounded
  useful_grounded: boolean;         // answered + semantic_grounded
}

interface StackReport {
  label: StackLabel;
  coverage: number;
  strict_grounding_rate: number;
  semantic_grounding_rate: number;
  hallucination_rate: number;
  false_abstention_rate: number;
  useful_grounded: number;
  useful_grounded_rate: number;
  answered: number;
  abstained: number;
  graded: GradedAnswer[];
  extract: {
    method: ExtractRun["method"];
    quality: number;
    pagesOCRd: number;
    estimatedCost: number;
    blockerCount: number;
    inspectionCount: number;
    textChars: number;
  };
  llm: {
    model: string;
    cost: number;
    truncated: boolean;
    inputTokens?: number;
    outputTokens?: number;
  };
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

async function withProvidersDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const backup = new Map<string, string | undefined>();
  for (const key of [...GOOGLE_ENV_KEYS, ...AZURE_ENV_KEYS]) {
    backup.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of backup.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function runExtraction(file: string, label: StackLabel): Promise<ExtractRun> {
  const buffer = await fs.readFile(file);
  const execute = async (): Promise<ExtractRun> => {
    const result = await smartExtract(buffer, {
      qualityThreshold: 40,
      maxOCRPages: Number.POSITIVE_INFINITY,
      autoOCR: true,
      strict: true,
    });
    return {
      label,
      text: result.text,
      method: result.method,
      quality: result.quality,
      pagesOCRd: result.pagesOCRd,
      estimatedCost: result.estimatedCost,
      snapshot: buildGoldenAuditSnapshot(result.manifest),
    };
  };
  return label === "old" ? withProvidersDisabled(execute) : execute();
}

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

function buildQaPrompt(extractText: string): string {
  const questionList = QUESTIONS.map((q, i) => `${i + 1}. [id=${q.id}] ${q.question}`).join("\n");

  return [
    "Tu es un analyste d'investissement senior. Tu dois répondre UNIQUEMENT à partir du texte de l'extract fourni.",
    "",
    "RÈGLES IMPÉRATIVES :",
    "- Ne JAMAIS inventer. Si l'information n'est pas littéralement dans l'extract, status = \"not_in_document\".",
    "- Pour chaque réponse qui n'est pas NOT_IN_DOCUMENT, tu DOIS fournir un tableau `evidence` de 1 à 3 spans LITTÉRAUX issus de l'extract.",
    "- Chaque span DOIT être une copie/colle EXACTE et CONTIGUË (aucun \"...\", aucun \"|\", aucune ellipse, aucun rewrite). 6 à 25 mots par span, extrait tel quel avec la ponctuation originale.",
    "- Chaque span est vérifié programmatiquement comme substring littérale. S'il ne matche pas, ta réponse est comptée comme hallucination.",
    "- Pour citer plusieurs endroits du document, fournis PLUSIEURS spans dans le tableau — ne les concatène JAMAIS en un seul avec \"...\" ou \"|\".",
    "- `answer` : réponse synthétique courte et factuelle en français (max 40 mots). Les evidence spans peuvent rester dans la langue originale du document.",
    "- `page_hint` : numéro de page (entier) si détectable via les marqueurs \"[Page N]\", sinon null.",
    "- `confidence` : \"high\" si les spans prouvent directement l'answer, \"medium\" si partiel, \"low\" si inférentiel (préfère alors NOT_IN_DOCUMENT).",
    "- Output JSON UNIQUEMENT, aucun texte avant ou après.",
    "",
    "Format de sortie STRICT :",
    '{"answers":[{"id":"<id>","status":"answered"|"not_in_document","answer":"<string>","evidence":["<literal_span_1>","<literal_span_2>"],"page_hint":<int|null>,"confidence":"high"|"medium"|"low"}, ...]}',
    "",
    "Exemple d'evidence CORRECT : [\"Revenue 164.1 EBITDA 118.8 in Year 5\", \"Adj. EBITDA Margin 72.4%\"]",
    "Exemple d'evidence INCORRECT (ne pas faire) : [\"Revenue 164.1 ... Adj. EBITDA Margin 72.4%\"] ou [\"Revenue 164.1 | EBITDA 118.8\"]",
    "",
    `Questions (${QUESTIONS.length}) :`,
    questionList,
    "",
    "EXTRACT :",
    "```",
    extractText,
    "```",
    "",
    "Réponds maintenant avec le JSON.",
  ].join("\n");
}

async function runQa(run: ExtractRun, model: ModelKey): Promise<{
  data: LlmResponse;
  cost: number;
  modelId: string;
  truncated: boolean;
  inputTokens?: number;
  outputTokens?: number;
}> {
  return ensureLLMContext("pdf-downstream-bench", async () => {
    const prompt = buildQaPrompt(run.text);
    const result = await completeJSON<LlmResponse>(prompt, {
      model,
      maxTokens: 8000,
      temperature: 0,
      systemPrompt:
        "Analyste IC rigoureux. Ne réponds que ce qui est littéralement dans le document. Tu seras pénalisé 9 pts pour chaque réponse inventée, 0 pt pour 'not_in_document', 1 pt pour réponse grounded. Format JSON uniquement.",
    });
    return {
      data: result.data,
      cost: result.cost,
      modelId: result.model ?? MODELS[model].id,
      truncated: Boolean((result.data as { _wasTruncated?: boolean })._wasTruncated),
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
  });
}

// ---------------------------------------------------------------------------
// Deterministic grading
// ---------------------------------------------------------------------------

/** Normalize text for robust substring matching : lower, collapse whitespace, strip punctuation spacing. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeNumericToken(token: string): string | null {
  const trimmed = token
    .toLowerCase()
    .replace(/^[^\d(+-]+/, "")
    .replace(/[^\d%a-z]+$/i, "");

  if (!/\d/.test(trimmed)) return null;

  const percent = trimmed.includes("%");
  const suffixMatch = trimmed.match(/([kmb]|mn|bn)$/i);
  const suffix = suffixMatch ? suffixMatch[1].toLowerCase() : "";

  let core = trimmed
    .replace(/[%€$£]/g, "")
    .replace(/([kmb]|mn|bn)$/i, "");

  const hasComma = core.includes(",");
  const hasDot = core.includes(".");
  const hasSpace = /\s/.test(core);
  const hasApostrophe = /'/.test(core);

  if (hasSpace || hasApostrophe) {
    core = core.replace(/[\s']/g, "");
  }

  if (hasComma && hasDot) {
    const lastComma = core.lastIndexOf(",");
    const lastDot = core.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const groupingSep = decimalSep === "," ? "." : ",";
    core = core.replace(new RegExp(`\\${groupingSep}`, "g"), "");
    if (decimalSep === ",") {
      core = core.replace(/,/g, ".");
    }
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = core.split(sep);
    const last = parts[parts.length - 1] ?? "";
    const looksThousands = parts.length > 1 && last.length === 3 && parts.slice(0, -1).every((part) => part.length >= 1 && part.length <= 3);
    if (looksThousands) {
      core = parts.join("");
    } else if (sep === ",") {
      core = parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
    }
  }

  core = core.replace(/^\+/, "");
  if (!/\d/.test(core)) return null;

  return `${core}${suffix}${percent ? "%" : ""}`;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "was", "were",
  "been", "but", "not", "any", "all", "its", "our", "your", "their", "they", "them", "she",
  "him", "his", "her", "its", "which", "when", "where", "what", "who", "how", "why", "will",
  "would", "could", "should", "may", "might", "must", "can", "una", "uno", "por", "con",
  "les", "des", "dans", "par", "pour", "aux", "est", "une", "qui", "que", "sur", "aux",
  "sont", "avec", "par", "plus", "moins", "sans", "ainsi", "alors",
]);

/** Extract significant lexical tokens: len >= 4 and not stop-words. Numeric tokens are handled separately. */
function significantTokens(s: string): string[] {
  const raw = s.toLowerCase().split(/[^a-z0-9àâäéèêëïîôöùûüÿçñ]+/).filter(Boolean);
  return raw
    .filter((t) => {
      if (t.length < 4) return false;
      if (STOP_WORDS.has(t)) return false;
      return true;
    });
}

function extractNumericTokens(s: string): string[] {
  const matches = s.match(/[$€£]?\(?[+-]?\d[\d\s,.'%]*\)?(?:[kmb]|mn|bn)?%?/gi) ?? [];
  const normalized = matches
    .map((token) => normalizeNumericToken(token))
    .filter((token): token is string => Boolean(token));
  return [...new Set(normalized)];
}

function buildLexicalSet(s: string): Set<string> {
  return new Set(significantTokens(s));
}

function hasContiguousNormalizedMatch(quote: string, normalizedExtract: string): boolean {
  const cleaned = quote.trim();
  if (cleaned.length < 6) return false;
  return normalizedExtract.includes(normalize(cleaned));
}

function isSemanticallyGrounded(
  quote: string,
  extractLexicalTokens: Set<string>,
  extractNumericSet: Set<string>
): boolean {
  const cleaned = quote.trim();
  if (cleaned.length < 6) return false;

  const lexical = significantTokens(cleaned);
  if (lexical.length > 0) {
    const lexicalMatches = lexical.filter((token) => extractLexicalTokens.has(token));
    if (lexicalMatches.length / lexical.length < 0.8) return false;
  }

  const numbers = extractNumericTokens(cleaned);
  if (numbers.length > 0) {
    const matchedNumbers = numbers.filter((token) => extractNumericSet.has(token));
    if (matchedNumbers.length / numbers.length < 0.8) return false;
  }

  return lexical.length > 0 || numbers.length > 0;
}

function gradeStack(params: {
  run: ExtractRun;
  llm: Awaited<ReturnType<typeof runQa>>;
  otherGroundedIds: Set<string>; // ids where the OTHER stack gave a grounded answer
}): StackReport {
  const normalizedExtract = normalize(params.run.text);
  const extractLexicalTokens = buildLexicalSet(params.run.text);
  const extractNumericSet = new Set(extractNumericTokens(params.run.text));

  // Map LLM answers by id, filling missing ids with explicit abstention
  const byId = new Map<string, LlmAnswer>();
  for (const a of params.llm.data.answers ?? []) {
    if (typeof a?.id === "string") byId.set(a.id, a);
  }

  const graded: GradedAnswer[] = QUESTIONS.map((q) => {
    const raw = byId.get(q.id) ?? {
      id: q.id,
      status: "not_in_document" as const,
      answer: "",
      evidence: [] as string[],
      page_hint: null,
      confidence: "low" as const,
    };

    const answered = raw.status === "answered";
    const evidence = Array.isArray(raw.evidence) ? raw.evidence.filter((s) => typeof s === "string" && s.trim().length > 0) : [];

    const evidence_strict_grounded = evidence.map((span) => hasContiguousNormalizedMatch(span, normalizedExtract));
    const evidence_semantic_grounded = evidence.map((span, index) =>
      evidence_strict_grounded[index] || isSemanticallyGrounded(span, extractLexicalTokens, extractNumericSet)
    );
    const strict_grounded = answered && evidence.length > 0 && evidence_strict_grounded.every(Boolean);
    const semantic_grounded = answered && evidence.length > 0 && evidence_semantic_grounded.every(Boolean);

    const false_abstention = !answered && params.otherGroundedIds.has(q.id);
    const useful_grounded = answered && semantic_grounded;

    return {
      ...raw,
      id: q.id,
      evidence,
      evidence_strict_grounded,
      evidence_semantic_grounded,
      strict_grounded,
      semantic_grounded,
      false_abstention,
      useful_grounded,
    };
  });

  const total = QUESTIONS.length;
  const answered = graded.filter((g) => g.status === "answered").length;
  const abstained = total - answered;
  const grounded = graded.filter((g) => g.useful_grounded).length;
  const strictGrounded = graded.filter((g) => g.status === "answered" && g.strict_grounded).length;
  const hallucinated = graded.filter((g) => g.status === "answered" && !g.semantic_grounded).length;
  const falseAbst = graded.filter((g) => g.false_abstention).length;

  return {
    label: params.run.label,
    coverage: answered / total,
    strict_grounding_rate: answered > 0 ? strictGrounded / answered : 0,
    semantic_grounding_rate: answered > 0 ? grounded / answered : 0,
    hallucination_rate: answered > 0 ? hallucinated / answered : 0,
    false_abstention_rate: abstained > 0 ? falseAbst / abstained : 0,
    useful_grounded: grounded,
    useful_grounded_rate: grounded / total,
    answered,
    abstained,
    graded,
    extract: {
      method: params.run.method,
      quality: params.run.quality,
      pagesOCRd: params.run.pagesOCRd,
      estimatedCost: params.run.estimatedCost,
      blockerCount: params.run.snapshot.summary.blockerCount,
      inspectionCount: params.run.snapshot.summary.inspectionCount,
      textChars: params.run.text.length,
    },
    llm: {
      model: params.llm.modelId,
      cost: params.llm.cost,
      truncated: params.llm.truncated,
      inputTokens: params.llm.inputTokens,
      outputTokens: params.llm.outputTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

interface Verdict {
  winner: "new" | "old" | "tie";
  confidence: "high" | "medium" | "low";
  reasons: string[];
  delta: {
    useful_grounded: number;
    coverage: number;
    hallucination_rate: number;
    false_abstention_rate: number;
  };
}

function computeVerdict(oldR: StackReport, newR: StackReport): Verdict {
  const delta = {
    useful_grounded: newR.useful_grounded - oldR.useful_grounded,
    coverage: newR.coverage - oldR.coverage,
    hallucination_rate: newR.hallucination_rate - oldR.hallucination_rate,
    false_abstention_rate: newR.false_abstention_rate - oldR.false_abstention_rate,
  };

  const reasons: string[] = [];
  let newScore = 0;
  let oldScore = 0;

  // Primary axis : useful grounded answers.
  if (delta.useful_grounded >= 2) {
    newScore += 2;
    reasons.push(`NEW a ${delta.useful_grounded} réponses grounded de plus qu'OLD sur ${QUESTIONS.length} questions.`);
  } else if (delta.useful_grounded >= 1) {
    newScore += 1;
    reasons.push(`NEW a ${delta.useful_grounded} réponse grounded de plus.`);
  } else if (delta.useful_grounded <= -2) {
    oldScore += 2;
    reasons.push(`OLD a ${-delta.useful_grounded} réponses grounded de plus que NEW.`);
  } else if (delta.useful_grounded <= -1) {
    oldScore += 1;
    reasons.push(`OLD a ${-delta.useful_grounded} réponse grounded de plus.`);
  }

  // Hallucination guard : halve or cancel NEW's advantage if it hallucinates more.
  if (delta.hallucination_rate > 0.10) {
    reasons.push(`NEW hallucine plus (Δ hallucination_rate = +${(delta.hallucination_rate * 100).toFixed(0)} pts).`);
    oldScore += 2;
  } else if (delta.hallucination_rate < -0.10) {
    reasons.push(`NEW hallucine moins (Δ hallucination_rate = ${(delta.hallucination_rate * 100).toFixed(0)} pts).`);
    newScore += 1;
  }

  // False abstention (stack perdu de l'info)
  const oldFalseAbst = oldR.graded.filter((g) => g.false_abstention).length;
  const newFalseAbst = newR.graded.filter((g) => g.false_abstention).length;
  if (oldFalseAbst - newFalseAbst >= 2) {
    newScore += 1;
    reasons.push(`OLD a ${oldFalseAbst} faux-abstentions (info accessible à NEW mais perdue par OLD).`);
  } else if (newFalseAbst - oldFalseAbst >= 2) {
    oldScore += 1;
    reasons.push(`NEW a ${newFalseAbst} faux-abstentions (info accessible à OLD mais perdue par NEW).`);
  }

  let winner: Verdict["winner"] = "tie";
  if (newScore > oldScore) winner = "new";
  else if (oldScore > newScore) winner = "old";

  const spread = Math.abs(newScore - oldScore);
  const confidence: Verdict["confidence"] = spread >= 3 ? "high" : spread >= 2 ? "medium" : "low";

  if (reasons.length === 0) reasons.push("Aucune différence matérielle détectée.");

  return { winner, confidence, reasons, delta };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const file = process.argv[2];
  const modelArg = (process.argv[3] as ModelKey | undefined) ?? "CLAUDE_SONNET_45";
  const outputPath = process.argv[4];

  if (!file) {
    console.error(
      "Usage: npx dotenv -e .env.local -- npx tsx scripts/compare-pdf-downstream-quality.ts <pdf-path> [MODEL_KEY] [OUTPUT_JSON]"
    );
    console.error("  MODEL_KEY default: CLAUDE_SONNET_45 (stable benchmark default)");
    process.exit(1);
  }

  const t0 = Date.now();
  console.error(`[bench] extract OLD (VLM-only) …`);
  const oldRun = await runExtraction(file, "old");
  console.error(`[bench] extract OLD done (method=${oldRun.method}, pagesOCRd=${oldRun.pagesOCRd}, chars=${oldRun.text.length})`);

  console.error(`[bench] extract NEW (Google DocAI + VLM) …`);
  const newRun = await runExtraction(file, "new");
  console.error(`[bench] extract NEW done (method=${newRun.method}, pagesOCRd=${newRun.pagesOCRd}, chars=${newRun.text.length})`);

  // Run both QA calls in parallel — same model, same prompt, same questions.
  console.error(`[bench] QA pass OLD + NEW in parallel (model=${modelArg}) …`);
  const [oldLlm, newLlm] = await Promise.all([
    runQa(oldRun, modelArg),
    runQa(newRun, modelArg),
  ]);
  console.error(`[bench] QA done (old: $${oldLlm.cost.toFixed(4)} / new: $${newLlm.cost.toFixed(4)})`);

  // First pass grading WITHOUT cross-abstention knowledge, to find which ids each stack grounded.
  const oldPrelim = gradeStack({ run: oldRun, llm: oldLlm, otherGroundedIds: new Set() });
  const newPrelim = gradeStack({ run: newRun, llm: newLlm, otherGroundedIds: new Set() });

  const oldGroundedIds = new Set(oldPrelim.graded.filter((g) => g.useful_grounded).map((g) => g.id));
  const newGroundedIds = new Set(newPrelim.graded.filter((g) => g.useful_grounded).map((g) => g.id));

  // Second pass with cross-abstention computation.
  const oldReport = gradeStack({ run: oldRun, llm: oldLlm, otherGroundedIds: newGroundedIds });
  const newReport = gradeStack({ run: newRun, llm: newLlm, otherGroundedIds: oldGroundedIds });

  const verdict = computeVerdict(oldReport, newReport);

  // Per-question diff for human audit
  const diff = QUESTIONS.map((q) => {
    const o = oldReport.graded.find((g) => g.id === q.id)!;
    const n = newReport.graded.find((g) => g.id === q.id)!;
    return {
      id: q.id,
      question: q.question,
      old: {
        status: o.status,
        strict_grounded: o.strict_grounded,
        semantic_grounded: o.semantic_grounded,
        false_abstention: o.false_abstention,
        answer: o.answer,
        evidence: o.evidence.map((span, i) => ({
          span: span.slice(0, 200),
          strict_grounded: o.evidence_strict_grounded[i] ?? false,
          semantic_grounded: o.evidence_semantic_grounded[i] ?? false,
        })),
      },
      new: {
        status: n.status,
        strict_grounded: n.strict_grounded,
        semantic_grounded: n.semantic_grounded,
        false_abstention: n.false_abstention,
        answer: n.answer,
        evidence: n.evidence.map((span, i) => ({
          span: span.slice(0, 200),
          strict_grounded: n.evidence_strict_grounded[i] ?? false,
          semantic_grounded: n.evidence_semantic_grounded[i] ?? false,
        })),
      },
    };
  });

  const payload = {
    file,
    model: modelArg,
    durationMs: Date.now() - t0,
    questionCount: QUESTIONS.length,
    old: oldReport,
    new: newReport,
    verdict,
    diff,
  };

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath) {
    await fs.writeFile(outputPath, serialized, "utf8");
    console.error(`[bench] wrote ${outputPath}`);
  } else {
    console.log(serialized);
  }

  // Human-readable summary on stderr
  console.error("\n=== SUMMARY ===");
  console.error(`File             : ${file}`);
  console.error(`Model            : ${modelArg} (${MODELS[modelArg].id})`);
  console.error(`Cost             : old $${oldReport.llm.cost.toFixed(4)} + new $${newReport.llm.cost.toFixed(4)} = $${(oldReport.llm.cost + newReport.llm.cost).toFixed(4)}`);
  console.error(`OLD  useful_grounded=${oldReport.useful_grounded}/${QUESTIONS.length}  strict=${(oldReport.strict_grounding_rate * 100).toFixed(0)}%  semantic=${(oldReport.semantic_grounding_rate * 100).toFixed(0)}%  halluc=${(oldReport.hallucination_rate * 100).toFixed(0)}%  false_abst=${oldReport.graded.filter((g) => g.false_abstention).length}`);
  console.error(`NEW  useful_grounded=${newReport.useful_grounded}/${QUESTIONS.length}  strict=${(newReport.strict_grounding_rate * 100).toFixed(0)}%  semantic=${(newReport.semantic_grounding_rate * 100).toFixed(0)}%  halluc=${(newReport.hallucination_rate * 100).toFixed(0)}%  false_abst=${newReport.graded.filter((g) => g.false_abstention).length}`);
  console.error(`VERDICT          : ${verdict.winner.toUpperCase()} (confidence=${verdict.confidence})`);
  for (const r of verdict.reasons) console.error(`  • ${r}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
