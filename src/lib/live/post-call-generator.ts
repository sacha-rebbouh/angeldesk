// ============================================================================
// Post-Call Report Generator — Structured report after a live coaching session
// ============================================================================

import { prisma } from "@/lib/prisma";
import { compileDealContext, serializeContext } from "@/lib/live/context-compiler";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { recordSessionDuration } from "@/services/live-session-limits";
import type { PostCallReport } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// System prompt — enforces Rule N°1 (analytical tone, never prescriptive)
// ---------------------------------------------------------------------------

const POST_CALL_SYSTEM_PROMPT = `Tu es un analyste spécialisé dans la synthèse de calls entre Business Angels et fondateurs de startups.

RÈGLE ABSOLUE — TON ANALYTIQUE :
- Tu CONSTATES, tu ne DÉCIDES jamais.
- Tu ne dis JAMAIS "investir", "ne pas investir", "passer", "rejeter", "GO", "NO-GO".
- Tu rapportes des faits, des signaux, des comparaisons. Le Business Angel est le seul décideur.
- Chaque phrase doit pouvoir se terminer par "...à vous de décider" sans être absurde.
- Utilise des formulations analytiques : "Le fondateur a mentionné...", "Un écart a été observé entre...", "Cette information modifie le signal sur..."
- Pour les action items, décris l'action factuellement sans impliquer de décision d'investissement.

LANGUE : Français (sauf clés JSON, enums, acronymes techniques).

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.

FORMAT DE SORTIE : JSON strict conforme au schéma PostCallReport.
- executiveSummary : résumé analytique du call (3-5 phrases)
- keyPoints : points clés abordés avec citations verbatim
- actionItems : actions concrètes identifiées (owner: "ba" | "founder" | "shared")
- newInformation : faits nouveaux non présents dans l'analyse initiale
- contradictions : écarts entre claims du deck/analyse et propos du call
- questionsAsked : questions posées pendant le call (avec flag wasFromCoaching)
- remainingQuestions : questions prioritaires non abordées
- confidenceDelta : évolution du niveau de confiance (before/after/reason)
- sessionStats : statistiques de la session (remplies à partir des données brutes)`;

// ---------------------------------------------------------------------------
// generatePostCallReport
// ---------------------------------------------------------------------------

export async function generatePostCallReport(sessionId: string): Promise<PostCallReport> {
  // Fetch session data in parallel
  const [session, transcriptChunks, coachingCards, screenCaptures] = await Promise.all([
    prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { deal: { select: { id: true, companyName: true, name: true } } },
    }),
    prisma.transcriptChunk.findMany({
      where: { sessionId, isFinal: true },
      orderBy: { timestampStart: "asc" },
    }),
    prisma.coachingCard.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.screenCapture.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
      select: {
        timestamp: true,
        contentType: true,
        description: true,
        keyData: true,
        contradictions: true,
        newInsights: true,
        suggestedQuestion: true,
      },
    }),
  ]);

  if (!session) {
    throw new Error(`LiveSession ${sessionId} not found`);
  }

  // Compile deal context if a deal is attached.
  // ARC-LIGHT Phase 1 soft-gate: if the deal's corpus is not yet verified,
  // we do NOT 409 this live-triggered flow. Instead we degrade to a
  // transcript-only report (no pre-call context enrichment) and log the skip.
  let dealContextText = "";
  if (session.dealId) {
    const { evaluateDealCorpusReadinessSoft } = await import(
      "@/services/documents/readiness-gate"
    );
    const readiness = await evaluateDealCorpusReadinessSoft(session.dealId);
    if (readiness.ready) {
      const dealContext = await compileDealContext(session.dealId);
      dealContextText = serializeContext(dealContext);
    } else {
      console.warn(
        "[extraction.post_call.skipped_enrichment]",
        JSON.stringify({
          sessionId,
          dealId: session.dealId,
          reasonCode: readiness.reasonCode,
        })
      );
    }
  }

  // Build transcription text (truncate if too long for LLM context)
  const MAX_TRANSCRIPT_CHARS = 80_000; // ~20K tokens, safe for Sonnet context
  let transcription = transcriptChunks
    .map((chunk) => `[${chunk.speaker} (${chunk.speakerRole})] ${chunk.text}`)
    .join("\n");

  if (transcription.length > MAX_TRANSCRIPT_CHARS) {
    // Keep first 30% + last 70% to capture intro and key discussion points
    const headLen = Math.floor(MAX_TRANSCRIPT_CHARS * 0.3);
    const tailLen = MAX_TRANSCRIPT_CHARS - headLen - 200; // 200 chars for separator
    transcription =
      transcription.slice(0, headLen) +
      "\n\n[...TRANSCRIPTION TRONQUÉE — " +
      `${transcriptChunks.length} interventions totales, ${Math.round(transcription.length / 1000)}K chars...]\n\n` +
      transcription.slice(-tailLen);
  }

  // Coaching cards summary
  const coachingCardsSummary = coachingCards.map((card) => ({
    type: card.type,
    priority: card.priority,
    content: card.content,
    status: card.status,
    suggestedQuestion: card.suggestedQuestion,
  }));

  const coachingCardsAddressed = coachingCards.filter(
    (c) => c.status === "addressed"
  ).length;

  // Session duration
  const durationMinutes =
    session.startedAt && session.endedAt
      ? Math.round(
          (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
        )
      : 0;

  // Screen capture analysis summary
  let visualSection = "";
  if (screenCaptures.length > 0) {
    const visualLines = [`## Analyse visuelle (${screenCaptures.length} captures analysées)`];
    for (const sc of screenCaptures) {
      const mins = Math.floor(sc.timestamp / 60);
      const secs = Math.round(sc.timestamp % 60);
      visualLines.push(`\n### [${mins}:${String(secs).padStart(2, "0")}] ${sc.contentType} — ${sc.description}`);
      const keyData = sc.keyData as Array<{ dataPoint: string; category: string; relevance: string }>;
      if (Array.isArray(keyData) && keyData.length > 0) {
        visualLines.push("Données extraites :");
        for (const d of keyData) {
          visualLines.push(`- [${d.category}/${d.relevance}] ${d.dataPoint}`);
        }
      }
      const contradictions = sc.contradictions as Array<{ visualClaim: string; analysisClaim: string; severity: string }>;
      if (Array.isArray(contradictions) && contradictions.length > 0) {
        visualLines.push("Contradictions visuelles :");
        for (const c of contradictions) {
          visualLines.push(`- [${c.severity}] Slide: "${c.visualClaim}" vs Analyse: "${c.analysisClaim}"`);
        }
      }
      const insights = sc.newInsights as string[];
      if (Array.isArray(insights) && insights.length > 0) {
        visualLines.push("Nouveaux insights :");
        for (const i of insights) {
          visualLines.push(`- ${i}`);
        }
      }
      if (sc.suggestedQuestion) {
        visualLines.push(`Question suggérée : ${sc.suggestedQuestion}`);
      }
    }
    visualSection = visualLines.join("\n") + "\n\n";
  }

  // Build the prompt
  const prompt = `Analyse cette transcription de call entre un Business Angel et un(e) fondateur(rice) et génère un compte-rendu structuré.

${dealContextText ? `## Contexte du deal (analyse pré-call)\n${dealContextText}\n\n` : "## Aucun deal rattaché — analyse le call sans contexte préalable.\n\n"}## Transcription complète du call
${transcription}

${visualSection}## Coaching cards générées pendant le call
${JSON.stringify(coachingCardsSummary, null, 2)}

## Données de session
- Durée : ${durationMinutes} minutes
- Nombre d'utterances : ${transcriptChunks.length}
- Coaching cards générées : ${coachingCards.length}
- Coaching cards adressées : ${coachingCardsAddressed}
- Captures d'écran analysées : ${screenCaptures.length}

Génère le rapport post-call en JSON. Pour sessionStats, utilise les valeurs fournies ci-dessus.
Pour confidenceDelta, estime l'évolution de confiance basée sur les informations nouvelles et contradictions identifiées (before = score pré-call si disponible, after = score ajusté, reason = justification).
Pour wasFromCoaching dans questionsAsked, identifie si la question posée correspond à une suggestion de coaching card.
${screenCaptures.length > 0 ? "Intègre les findings visuels (données extraites des slides, contradictions visuelles) dans les sections correspondantes du rapport (newInformation, contradictions, etc.)." : ""}`;

  const { data: rawReport } = await runWithLLMContext(
    { agentName: "post-call-report" },
    () =>
      completeJSON<PostCallReport>(prompt, {
        model: "SONNET",
        maxTokens: 4000,
        systemPrompt: POST_CALL_SYSTEM_PROMPT,
      })
  );

  // Sanitize: LLM may return undefined for optional array fields → default to []
  const report: PostCallReport = {
    executiveSummary: rawReport.executiveSummary ?? "",
    keyPoints: Array.isArray(rawReport.keyPoints) ? rawReport.keyPoints : [],
    actionItems: Array.isArray(rawReport.actionItems) ? rawReport.actionItems : [],
    newInformation: Array.isArray(rawReport.newInformation) ? rawReport.newInformation : [],
    contradictions: Array.isArray(rawReport.contradictions) ? rawReport.contradictions : [],
    questionsAsked: Array.isArray(rawReport.questionsAsked) ? rawReport.questionsAsked : [],
    remainingQuestions: Array.isArray(rawReport.remainingQuestions) ? rawReport.remainingQuestions : [],
    confidenceDelta: rawReport.confidenceDelta ?? { before: 0, after: 0, reason: "" },
    sessionStats: {
      duration: durationMinutes,
      totalUtterances: transcriptChunks.length,
      coachingCardsGenerated: coachingCards.length,
      coachingCardsAddressed: coachingCardsAddressed,
      screenCapturesAnalyzed: screenCaptures.length,
      topicsChecklist: rawReport.sessionStats?.topicsChecklist ?? {
        total: 0,
        covered: 0,
      },
    },
  };

  return report;
}

// ---------------------------------------------------------------------------
// generateMarkdownReport — converts PostCallReport to formatted Markdown
// ---------------------------------------------------------------------------

export function generateMarkdownReport(
  report: PostCallReport,
  sessionMeta: {
    dealName?: string;
    date: string;
    duration: number;
    platform: string;
  }
): string {
  const lines: string[] = [];

  // Header
  const title = sessionMeta.dealName ?? "Startup";
  lines.push(`# Compte-rendu — Call ${title} — ${sessionMeta.date}`);
  lines.push("");
  lines.push(
    `> Plateforme : ${sessionMeta.platform} | Durée : ${sessionMeta.duration} min | ${report.sessionStats.totalUtterances} interventions`
  );
  lines.push("");

  // Executive Summary
  lines.push("## Résumé");
  lines.push("");
  lines.push(report.executiveSummary);
  lines.push("");

  // Key Points
  if (report.keyPoints?.length > 0) {
    lines.push("## Points clés");
    lines.push("");
    for (const kp of report.keyPoints) {
      lines.push(`### ${kp.topic ?? "Point"}`);
      lines.push("");
      lines.push(kp.summary ?? "");
      const quotes = Array.isArray(kp.speakerQuotes) ? kp.speakerQuotes : [];
      if (quotes.length > 0) {
        lines.push("");
        for (const quote of quotes) {
          lines.push(`> ${quote}`);
        }
      }
      lines.push("");
    }
  }

  // New Information
  if (report.newInformation?.length > 0) {
    lines.push("## Informations nouvelles");
    lines.push("");
    for (const info of report.newInformation) {
      const agents = Array.isArray(info.agentsAffected) ? info.agentsAffected.join(", ") : "";
      lines.push(
        `- **${info.fact ?? ""}** — Impact : ${info.impact ?? ""}${agents ? ` (agents concernés : ${agents})` : ""}`
      );
    }
    lines.push("");
  }

  // Contradictions
  if (report.contradictions?.length > 0) {
    lines.push("## Contradictions identifiées");
    lines.push("");
    lines.push("| Claim (deck/analyse) | Claim (call) | Sévérité |");
    lines.push("|---|---|---|");
    for (const c of report.contradictions) {
      lines.push(`| ${c.claimInDeck ?? ""} | ${c.claimInCall ?? ""} | ${c.severity ?? ""} |`);
    }
    lines.push("");
  }

  // Questions Asked
  if (report.questionsAsked?.length > 0) {
    lines.push("## Questions posées");
    lines.push("");
    for (const q of report.questionsAsked) {
      const coachingTag = q.wasFromCoaching ? " *(coaching)*" : "";
      lines.push(`- **Q :** ${q.question ?? ""}${coachingTag}`);
      lines.push(`  **R :** ${q.answer ?? ""}`);
    }
    lines.push("");
  }

  // Remaining Questions
  if (report.remainingQuestions?.length > 0) {
    lines.push("## Questions restantes");
    lines.push("");
    for (const q of report.remainingQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  // Action Items
  if (report.actionItems?.length > 0) {
    lines.push("## Actions à suivre");
    lines.push("");
    const ownerLabels: Record<string, string> = {
      ba: "Business Angel",
      founder: "Fondateur",
      shared: "Partagé",
    };
    for (const ai of report.actionItems) {
      const owner = ownerLabels[ai.owner] ?? ai.owner;
      const deadline = ai.deadline ? ` (échéance : ${ai.deadline})` : "";
      lines.push(`- [${owner}] ${ai.description}${deadline}`);
    }
    lines.push("");
  }

  // Confidence Delta
  if (report.confidenceDelta) {
    lines.push("## Évolution de la confiance");
    lines.push("");
    lines.push(
      `- Avant le call : ${report.confidenceDelta.before}/100`
    );
    lines.push(
      `- Après le call : ${report.confidenceDelta.after}/100`
    );
    lines.push(`- Raison : ${report.confidenceDelta.reason}`);
    lines.push("");
  }

  // Visual Analysis note — shown if screen captures were present
  // (the visual findings are integrated into contradictions/newInformation by the LLM)
  if (report.sessionStats.screenCapturesAnalyzed && report.sessionStats.screenCapturesAnalyzed > 0) {
    lines.push("## Analyse visuelle");
    lines.push("");
    lines.push(
      `${report.sessionStats.screenCapturesAnalyzed} capture(s) d'écran analysée(s). Les données visuelles et contradictions détectées sont intégrées dans les sections correspondantes ci-dessus.`
    );
    lines.push("");
  }

  // Session Stats
  lines.push("## Statistiques de session");
  lines.push("");
  lines.push(`- Durée : ${report.sessionStats.duration} min`);
  lines.push(
    `- Interventions : ${report.sessionStats.totalUtterances}`
  );
  lines.push(
    `- Coaching cards : ${report.sessionStats.coachingCardsGenerated} générées, ${report.sessionStats.coachingCardsAddressed} adressées`
  );
  if (report.sessionStats.topicsChecklist.total > 0) {
    lines.push(
      `- Sujets couverts : ${report.sessionStats.topicsChecklist.covered}/${report.sessionStats.topicsChecklist.total}`
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// saveReport — persists report to DB in a transaction
// ---------------------------------------------------------------------------

export async function saveReport(
  sessionId: string,
  report: PostCallReport,
  markdown: string
): Promise<void> {
  // Fetch session to get deal info for document naming
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      deal: { select: { id: true, companyName: true, name: true } },
    },
  });

  if (!session) {
    throw new Error(`LiveSession ${sessionId} not found`);
  }

  const dealName =
    session.deal?.companyName ?? session.deal?.name ?? "Startup";
  const dateStr = (session.startedAt ?? session.createdAt)
    .toISOString()
    .split("T")[0];
  const durationMin = report.sessionStats.duration;
  const docName = `Call-${dateStr}-${dealName}-${durationMin}min.md`;

  await prisma.$transaction(async (tx) => {
    // 1. Create SessionSummary
    await tx.sessionSummary.create({
      data: {
        sessionId,
        executiveSummary: report.executiveSummary,
        keyPoints: report.keyPoints,
        actionItems: report.actionItems,
        newInformation: report.newInformation,
        contradictions: report.contradictions,
        questionsAsked: report.questionsAsked,
        remainingQuestions: report.remainingQuestions,
        confidenceDelta: report.confidenceDelta,
        sessionStats: report.sessionStats,
        markdownReport: markdown,
      },
    });

    // 2. Create Document record (only if deal exists)
    if (session.dealId) {
      const document = await tx.document.create({
        data: {
          dealId: session.dealId,
          name: docName,
          type: "CALL_TRANSCRIPT",
          storagePath: `live-sessions/${sessionId}/report.md`,
          mimeType: "text/markdown",
          sizeBytes: Buffer.byteLength(markdown, "utf-8"),
          processingStatus: "COMPLETED",
          extractedText: markdown,
        },
      });

      // 3. Link document to session
      await tx.liveSession.update({
        where: { id: sessionId },
        data: { documentId: document.id },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// generateAndSavePostCallReport — Main entry point: generate, persist, notify
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full post-call pipeline:
 * 1. Generate structured report via LLM
 * 2. Convert to markdown
 * 3. Persist to DB (SessionSummary + Document)
 * 4. Update session status to "completed"
 * 5. Notify client via Ably
 *
 * On failure: updates session status to "failed" and publishes error.
 */
export async function generateAndSavePostCallReport(
  sessionId: string
): Promise<void> {
  try {
    // Idempotency guard: skip if a report already exists (prevents double execution
    // from stop + recall webhook race condition)
    const existingSummary = await prisma.sessionSummary.findUnique({
      where: { sessionId },
      select: { id: true },
    });
    if (existingSummary) {
      console.log(
        `[post-call-generator] Report already exists for session ${sessionId}, skipping.`
      );
      return;
    }

    // 1. Generate the structured report
    const report = await generatePostCallReport(sessionId);

    // 2. Fetch session metadata for markdown header
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        deal: { select: { companyName: true, name: true } },
      },
    });

    if (!session) {
      throw new Error(`LiveSession ${sessionId} not found`);
    }

    const dealName =
      session.deal?.companyName ?? session.deal?.name ?? "Startup";
    const platform = session.meetingPlatform ?? "unknown";
    const durationMinutes =
      session.startedAt && session.endedAt
        ? Math.round(
            (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
          )
        : report.sessionStats.duration;
    const dateStr = (session.startedAt ?? session.createdAt)
      .toISOString()
      .split("T")[0];

    // 3. Generate markdown
    const markdown = generateMarkdownReport(report, {
      dealName,
      date: dateStr,
      duration: durationMinutes,
      platform,
    });

    // 4. Persist report + document
    await saveReport(sessionId, report, markdown);

    // 5. Generate condensed transcript intelligence (for future coaching + agent injection)
    try {
      const { generateCondensedIntel, enrichDocumentText } = await import(
        "@/lib/live/transcript-condenser"
      );
      const condensedIntel = await generateCondensedIntel(sessionId, report);

      // Persist condensed intel to SessionSummary
      await prisma.sessionSummary.update({
        where: { sessionId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { condensedIntel: condensedIntel as any },
      });

      // Enrich the CALL_TRANSCRIPT document with structured intelligence
      if (session.dealId) {
        const enrichedText = enrichDocumentText(markdown, condensedIntel);
        await prisma.document.updateMany({
          where: {
            dealId: session.dealId,
            type: "CALL_TRANSCRIPT",
            storagePath: `live-sessions/${sessionId}/report.md`,
          },
          data: { extractedText: enrichedText },
        });
      }

      console.log(
        `[post-call-generator] Condensed intel generated for session ${sessionId}: ` +
          `${condensedIntel.keyFacts.length} facts, ${condensedIntel.financialDataPoints.length} financials`
      );
    } catch (condenserError) {
      // Non-fatal: condensation failure should not block the main report
      console.warn(
        `[post-call-generator] Condensation failed for session ${sessionId}:`,
        condenserError
      );
    }

    // 6. Trigger targeted reanalysis (fire-and-forget, non-blocking)
    if (session.dealId) {
      try {
        const { identifyImpactedAgents, triggerTargetedReanalysis } =
          await import("@/lib/live/post-call-reanalyzer");

        const impactedAgents = identifyImpactedAgents(report);

        if (impactedAgents.length > 0) {
          // Fire and forget: doesn't block session completion
          triggerTargetedReanalysis(
            session.dealId,
            impactedAgents,
            sessionId
          ).catch((err) => {
            console.error(
              `[post-call-generator] Reanalysis trigger failed for deal ${session.dealId}:`,
              err
            );
          });
        }
      } catch (reanalysisError) {
        console.warn(
          `[post-call-generator] Reanalysis skipped for session ${sessionId}:`,
          reanalysisError
        );
      }
    }

    // 7. Record session duration and cost estimate
    if (durationMinutes > 0) {
      await recordSessionDuration(sessionId, durationMinutes).catch((err) => {
        console.warn(`[post-call-generator] Failed to record duration for session ${sessionId}:`, err);
      });
    }

    // 8. Update session status to completed (only if still processing — guards against reinvite race)
    const completionResult = await prisma.liveSession.updateMany({
      where: { id: sessionId, status: "processing" },
      data: { status: "completed" },
    });
    if (completionResult.count === 0) {
      console.warn(`[post-call-generator] Session ${sessionId} no longer in processing — skipping completion (likely reinvited)`);
      return;
    }

    // 9. Notify client via Ably
    await publishSessionStatus(sessionId, {
      status: "completed",
      message: "Rapport prêt",
    });
  } catch (error) {
    console.error(
      `[post-call-generator] Failed for session ${sessionId}:`,
      error
    );

    // Update session status to failed
    try {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await prisma.liveSession.update({
        where: { id: sessionId },
        data: {
          status: "failed",
          errorMessage: errorMessage.slice(0, 500),
        },
      });

      await publishSessionStatus(sessionId, {
        status: "failed",
        message: `Erreur lors de la génération du rapport : ${errorMessage.slice(0, 200)}`,
      });
    } catch (statusError) {
      console.error(
        `[post-call-generator] Failed to update status for session ${sessionId}:`,
        statusError
      );
    }
  }
}
