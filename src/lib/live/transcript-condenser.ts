// ============================================================================
// Transcript Condenser — Extracts structured intelligence from a call transcript
// ============================================================================
// Called after generatePostCallReport() to produce a token-efficient, structured
// intelligence extract. This condensed intel is:
// 1. Stored in SessionSummary.condensedIntel (for future coaching sessions)
// 2. Appended to the CALL_TRANSCRIPT document (for agent consumption on re-run)
//
// Cost: ~$0.07/session (1 Sonnet call, ~20K input, ~1.5K output)
// ============================================================================

import { prisma } from "@/lib/prisma";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import { compileDealContext, serializeContext } from "@/lib/live/context-compiler";
import type { CondensedTranscriptIntel, PostCallReport } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// System prompt — extraction factuelle dense
// ---------------------------------------------------------------------------

const CONDENSER_SYSTEM_PROMPT = `Tu es un analyste qui extrait l'intelligence structurée d'un call entre un Business Angel et un fondateur de startup.

OBJECTIF : Produire un condensé FACTUEL et DENSE de toutes les informations exploitables du call.
Ce condensé sera injecté dans de futurs appels LLM (agents d'analyse, coaching sessions).
Il doit être le plus compact possible tout en ne perdant aucun fait, chiffre ou engagement.

RÈGLE ABSOLUE — TON ANALYTIQUE :
- Tu CONSTATES, tu ne DÉCIDES jamais.
- Tu ne dis JAMAIS "investir", "ne pas investir", "passer", "rejeter".
- Tu rapportes des faits et des signaux uniquement.

LANGUE : Français (sauf clés JSON, enums, acronymes techniques).
FORMAT : JSON strict conforme au schéma CondensedTranscriptIntel.

PRIORITÉS D'EXTRACTION :
1. Tout chiffre mentionné (revenue, metrics, dates, montants)
2. Engagements/promesses du fondateur avec deadlines
3. Insights concurrentiels (noms, stratégies, différenciation)
4. Mouvements d'équipe (recrutements, départs, réorganisation)
5. Contradictions avec l'analyse pré-existante
6. Données visuelles extraites de slides/démos partagées
7. Réponses obtenues aux questions posées
8. Actions à suivre

CONTRAINTE DE TAILLE : Maximum 1500 tokens de sortie. Sois dense et factuel.`;

// ---------------------------------------------------------------------------
// generateCondensedIntel
// ---------------------------------------------------------------------------

export async function generateCondensedIntel(
  sessionId: string,
  report: PostCallReport
): Promise<CondensedTranscriptIntel> {
  const [session, transcriptChunks, screenCaptures] = await Promise.all([
    prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { deal: { select: { id: true } } },
    }),
    prisma.transcriptChunk.findMany({
      where: { sessionId, isFinal: true },
      orderBy: { timestampStart: "asc" },
    }),
    prisma.screenCapture.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
      select: {
        contentType: true,
        description: true,
        keyData: true,
        newInsights: true,
      },
    }),
  ]);

  if (!session) throw new Error(`LiveSession ${sessionId} not found`);

  // Build transcript text (truncated for LLM context)
  const MAX_TRANSCRIPT = 40_000;
  let transcript = transcriptChunks
    .map((c) => `[${c.speaker}/${c.speakerRole}] ${c.text}`)
    .join("\n");
  if (transcript.length > MAX_TRANSCRIPT) {
    const headLen = Math.floor(MAX_TRANSCRIPT * 0.3);
    const tailLen = MAX_TRANSCRIPT - headLen - 100;
    transcript =
      transcript.slice(0, headLen) +
      "\n[...TRONQUÉ...]\n" +
      transcript.slice(-tailLen);
  }

  // Compile deal context for comparison
  let dealContextText = "";
  if (session.dealId) {
    const ctx = await compileDealContext(session.dealId);
    dealContextText = serializeContext(ctx);
  }

  // Visual data summary
  let visualSummary = "";
  if (screenCaptures.length > 0) {
    const lines = screenCaptures.map((sc) => {
      const kd = sc.keyData as Array<{ dataPoint: string }> | null;
      const ins = sc.newInsights as string[] | null;
      return `[${sc.contentType}] ${sc.description}${
        Array.isArray(kd) ? " | " + kd.map((d) => d.dataPoint).join("; ") : ""
      }${Array.isArray(ins) && ins.length > 0 ? " | Insights: " + ins.join("; ") : ""}`;
    });
    visualSummary = `\n## Données visuelles (${screenCaptures.length} captures)\n${lines.join("\n")}`;
  }

  // PostCallReport summary (already generated, use as guide)
  const reportSummary = `## Résumé post-call (déjà généré)
- Points clés: ${report.keyPoints.map((kp) => kp.topic).join(", ") || "aucun"}
- Infos nouvelles: ${report.newInformation.length}
- Contradictions: ${report.contradictions.length}
- Questions posées: ${report.questionsAsked.length}
- Questions restantes: ${report.remainingQuestions.length}
- Confidence: ${report.confidenceDelta.before} → ${report.confidenceDelta.after}`;

  const prompt = `Extrais l'intelligence structurée de ce call.

${dealContextText ? `## Contexte deal (analyse pré-call)\n${dealContextText}\n` : "## Aucun deal rattaché.\n"}
${reportSummary}
${visualSummary}

## Transcription du call
${transcript}

Produis un CondensedTranscriptIntel JSON. Concentre-toi sur les FAITS, CHIFFRES et ENGAGEMENTS.
Schéma attendu :
{
  "keyFacts": [{ "fact": "...", "category": "financial"|"team"|"market"|"tech"|"legal"|"competitive"|"product", "confidence": "verbatim"|"inferred" }],
  "founderCommitments": [{ "commitment": "...", "deadline": "..." }],
  "financialDataPoints": [{ "metric": "...", "value": "...", "context": "..." }],
  "competitiveInsights": ["..."],
  "teamRevelations": ["..."],
  "contradictionsWithAnalysis": [{ "analysisClaim": "...", "callClaim": "...", "severity": "high"|"medium"|"low" }],
  "visualDataPoints": ["..."],
  "answersObtained": [{ "topic": "...", "answer": "..." }],
  "actionItems": [{ "item": "...", "owner": "ba"|"founder"|"shared" }],
  "confidenceDelta": { "direction": "up"|"down"|"stable", "reason": "..." }
}`;

  const { data } = await runWithLLMContext(
    { agentName: "transcript-condenser" },
    () =>
      completeJSON<CondensedTranscriptIntel>(prompt, {
        model: "SONNET",
        maxTokens: 1500,
        systemPrompt: CONDENSER_SYSTEM_PROMPT,
        temperature: 0.2,
      })
  );

  // Sanitize: ensure all arrays are present (LLM may omit empty arrays)
  return {
    keyFacts: Array.isArray(data.keyFacts) ? data.keyFacts : [],
    founderCommitments: Array.isArray(data.founderCommitments)
      ? data.founderCommitments
      : [],
    financialDataPoints: Array.isArray(data.financialDataPoints)
      ? data.financialDataPoints
      : [],
    competitiveInsights: Array.isArray(data.competitiveInsights)
      ? data.competitiveInsights
      : [],
    teamRevelations: Array.isArray(data.teamRevelations)
      ? data.teamRevelations
      : [],
    contradictionsWithAnalysis: Array.isArray(data.contradictionsWithAnalysis)
      ? data.contradictionsWithAnalysis
      : [],
    visualDataPoints: Array.isArray(data.visualDataPoints)
      ? data.visualDataPoints
      : [],
    answersObtained: Array.isArray(data.answersObtained)
      ? data.answersObtained
      : [],
    actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
    confidenceDelta: data.confidenceDelta ?? {
      direction: "stable",
      reason: "",
    },
  };
}

// ---------------------------------------------------------------------------
// enrichDocumentText — appends structured intel section to markdown report
// ---------------------------------------------------------------------------

export function enrichDocumentText(
  markdown: string,
  intel: CondensedTranscriptIntel
): string {
  const sections: string[] = [
    "\n\n---\n## Intelligence structurée (extraction automatique)\n",
  ];

  if (intel.keyFacts.length > 0) {
    sections.push("### Faits clés");
    for (const f of intel.keyFacts) {
      sections.push(`- [${f.category}/${f.confidence}] ${f.fact}`);
    }
    sections.push("");
  }

  if (intel.financialDataPoints.length > 0) {
    sections.push("### Données financières");
    for (const f of intel.financialDataPoints) {
      sections.push(`- ${f.metric}: ${f.value} (${f.context})`);
    }
    sections.push("");
  }

  if (intel.founderCommitments.length > 0) {
    sections.push("### Engagements fondateur");
    for (const c of intel.founderCommitments) {
      sections.push(
        `- ${c.commitment}${c.deadline ? ` (échéance: ${c.deadline})` : ""}`
      );
    }
    sections.push("");
  }

  if (intel.competitiveInsights.length > 0) {
    sections.push("### Insights concurrentiels");
    for (const i of intel.competitiveInsights) {
      sections.push(`- ${i}`);
    }
    sections.push("");
  }

  if (intel.teamRevelations.length > 0) {
    sections.push("### Mouvements équipe");
    for (const t of intel.teamRevelations) {
      sections.push(`- ${t}`);
    }
    sections.push("");
  }

  if (intel.visualDataPoints.length > 0) {
    sections.push("### Données visuelles");
    for (const v of intel.visualDataPoints) {
      sections.push(`- ${v}`);
    }
    sections.push("");
  }

  if (intel.contradictionsWithAnalysis.length > 0) {
    sections.push("### Contradictions avec l'analyse");
    for (const c of intel.contradictionsWithAnalysis) {
      sections.push(
        `- [${c.severity}] Analyse: "${c.analysisClaim}" vs Call: "${c.callClaim}"`
      );
    }
    sections.push("");
  }

  if (intel.answersObtained.length > 0) {
    sections.push("### Réponses obtenues");
    for (const a of intel.answersObtained) {
      sections.push(`- **${a.topic}** : ${a.answer}`);
    }
    sections.push("");
  }

  if (intel.actionItems.length > 0) {
    const ownerLabels: Record<string, string> = {
      ba: "BA",
      founder: "Fondateur",
      shared: "Partagé",
    };
    sections.push("### Actions à suivre");
    for (const a of intel.actionItems) {
      sections.push(`- [${ownerLabels[a.owner] ?? a.owner}] ${a.item}`);
    }
    sections.push("");
  }

  if (intel.confidenceDelta) {
    sections.push(
      `### Confiance\n- Direction: ${intel.confidenceDelta.direction} — ${intel.confidenceDelta.reason}\n`
    );
  }

  return markdown + sections.join("\n");
}
