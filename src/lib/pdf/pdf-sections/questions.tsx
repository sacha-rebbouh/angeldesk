/**
 * Questions for Founder Section — Question Master aggregated
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles as gs } from "../pdf-theme";
import {
  PdfPage,
  SectionTitle,
  SubsectionTitle,
  H3,
  BulletList,
  LabelValue,
  PdfTable,
  Spacer,
  BodyText,
} from "../pdf-components";
import { s, priorityOrder } from "../pdf-helpers";
import { AGENT_DISPLAY_NAMES } from "@/lib/format-utils";
import type { AgentResult, FounderResponse } from "../generate-analysis-pdf";

export function QuestionsSection({
  results,
  dealName,
}: {
  results: Record<string, AgentResult>;
  dealName: string;
}) {
  const qmResult = results["question-master"];
  if (!qmResult?.success || !qmResult.data) return null;

  const data = qmResult.data as Record<string, unknown>;
  const findings = data.findings as Record<string, unknown> | undefined;
  const questions = (findings?.founderQuestions ?? []) as Array<{
    id?: string;
    question: string;
    category: string;
    priority: string;
    context?: {
      sourceAgent?: string;
      redFlagId?: string;
      triggerData?: string;
      whyItMatters?: string;
      reasoning?: string;
    };
    evaluation?: {
      goodAnswer?: string;
      badAnswer?: string;
      redFlagIfBadAnswer?: string;
      followUpIfBad?: string;
    };
    evaluationGuidance?: string;
    timing?: string;
  }>;

  const sorted = [...questions].sort(
    (a, b) => priorityOrder(a.priority) - priorityOrder(b.priority)
  );

  const refChecks = findings?.referenceChecks as Array<{
    targetType?: string;
    priority?: string;
    targetProfile?:
      | { description?: string; idealPerson?: string; howToFind?: string }
      | string;
    questions?: Array<
      { question?: string; whatToLookFor?: string; redFlagAnswer?: string } | string
    >;
    rationale?: string;
  }> | undefined;

  const dealbreakers = findings?.dealbreakers as Array<{
    description?: string;
    severity?: string;
    resolvability?: string;
  }> | undefined;

  const priorities = findings?.topPriorities as Array<{
    action?: string;
    rationale?: string;
  }> | undefined;

  const checklistRaw = findings?.diligenceChecklist;

  return (
    <PdfPage dealName={dealName}>
      <View>
      <SectionTitle>Questions pour le Fondateur</SectionTitle>

      {sorted.length > 0 && (
        <>
          <PdfTable
            columns={[
              { header: "#", width: 5 },
              { header: "Priorité", width: 13 },
              { header: "Catégorie", width: 15 },
              { header: "Question", width: 67 },
            ]}
            rows={sorted.map((q, i) => [
              String(i + 1),
              q.priority.replace(/_/g, " "),
              q.category,
              q.question,
            ])}
          />

          {/* Detailed critical questions */}
          {(() => {
            const critical = sorted.filter((q) =>
              ["CRITICAL", "MUST_ASK"].includes(q.priority)
            );
            if (critical.length === 0) return null;
            return (
              <>
                <SubsectionTitle>
                  Détail des questions critiques
                </SubsectionTitle>
                {critical.slice(0, 10).map((q, i) => (
                  <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                    <Text style={gs.bodyBold}>Q: {q.question}</Text>
                    {q.context?.sourceAgent && (
                      <LabelValue
                        label="Agent source"
                        value={
                          AGENT_DISPLAY_NAMES[q.context.sourceAgent] ??
                          q.context.sourceAgent
                        }
                      />
                    )}
                    {q.context?.triggerData && (
                      <LabelValue
                        label="Déclencheur"
                        value={q.context.triggerData}
                      />
                    )}
                    {(q.context?.whyItMatters || q.context?.reasoning) && (
                      <BodyText>
                        {q.context.whyItMatters ?? q.context.reasoning ?? ""}
                      </BodyText>
                    )}
                    {q.evaluation ? (
                      <>
                        {q.evaluation.goodAnswer && (
                          <LabelValue
                            label="Bonne réponse"
                            value={q.evaluation.goodAnswer}
                          />
                        )}
                        {q.evaluation.badAnswer && (
                          <LabelValue
                            label="Mauvaise réponse"
                            value={q.evaluation.badAnswer}
                          />
                        )}
                        {q.evaluation.redFlagIfBadAnswer && (
                          <LabelValue
                            label="Signal d'alerte si mauvaise réponse"
                            value={q.evaluation.redFlagIfBadAnswer}
                          />
                        )}
                        {q.evaluation.followUpIfBad && (
                          <LabelValue
                            label="Suivi"
                            value={q.evaluation.followUpIfBad}
                          />
                        )}
                      </>
                    ) : q.evaluationGuidance ? (
                      <LabelValue
                        label="Guide d'évaluation"
                        value={q.evaluationGuidance}
                      />
                    ) : null}
                    {q.timing && (
                      <LabelValue
                        label="Timing"
                        value={q.timing.replace(/_/g, " ")}
                      />
                    )}
                  </View>
                ))}
              </>
            );
          })()}
        </>
      )}

      {/* Reference checks */}
      {refChecks && refChecks.length > 0 && (
        <>
          <SubsectionTitle>Vérifications de références</SubsectionTitle>
          {refChecks.slice(0, 6).map((ref, i) => {
            const header =
              typeof ref.targetProfile === "object" && ref.targetProfile
                ? ref.targetProfile.description ?? "Reference"
                : s(ref.targetProfile);
            return (
              <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                <H3>
                  {header}
                  {ref.targetType
                    ? ` (${ref.targetType.replace(/_/g, " ")})`
                    : ""}
                  {ref.priority ? ` [${ref.priority}]` : ""}
                </H3>
                {typeof ref.targetProfile === "object" &&
                  ref.targetProfile && (
                    <>
                      {ref.targetProfile.idealPerson && (
                        <LabelValue
                          label="Personne idéale"
                          value={ref.targetProfile.idealPerson}
                        />
                      )}
                      {ref.targetProfile.howToFind && (
                        <LabelValue
                          label="Comment trouver"
                          value={ref.targetProfile.howToFind}
                        />
                      )}
                    </>
                  )}
                {ref.rationale && <BodyText>{ref.rationale}</BodyText>}
                {ref.questions && ref.questions.length > 0 && (
                  <BulletList
                    items={ref.questions.slice(0, 5).map((q) => {
                      if (typeof q === "string") return q;
                      return `${s(q.question)}${q.whatToLookFor ? ` → A surveiller: ${q.whatToLookFor}` : ""}${q.redFlagAnswer ? ` [Red flag: ${q.redFlagAnswer}]` : ""}`;
                    })}
                  />
                )}
              </View>
            );
          })}
        </>
      )}

      {/* Dealbreakers */}
      {dealbreakers && dealbreakers.length > 0 && (
        <>
          <SubsectionTitle>Risques critiques identifiés</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Risque critique", width: 50 },
              { header: "Sévérité", width: 25 },
              { header: "Résolvabilité", width: 25 },
            ]}
            rows={dealbreakers
              .slice(0, 8)
              .map((d) => [
                s(d.description),
                s(d.severity),
                s(d.resolvability),
              ])}
          />
        </>
      )}

      {/* Top priorities */}
      {priorities && priorities.length > 0 && (
        <>
          <SubsectionTitle>Actions prioritaires</SubsectionTitle>
          <BulletList
            items={priorities
              .slice(0, 5)
              .map((p) => `${s(p.action)} — ${s(p.rationale)}`)}
          />
        </>
      )}

      {/* DD checklist */}
      {!!checklistRaw && (
        <>
          <SubsectionTitle>Checklist Due Diligence</SubsectionTitle>
          {(() => {
            let items: Array<Record<string, unknown>> = [];
            if (
              typeof checklistRaw === "object" &&
              !Array.isArray(checklistRaw)
            ) {
              const cl = checklistRaw as {
                totalItems?: number;
                doneItems?: number;
                blockedItems?: number;
                criticalPathItems?: number;
                items?: Array<Record<string, unknown>>;
              };
              if (cl.totalItems !== undefined) {
                return (
                  <>
                    <LabelValue
                      label="Total éléments"
                      value={`${cl.doneItems ?? 0}/${cl.totalItems} complétés`}
                    />
                    {cl.blockedItems ? (
                      <LabelValue
                        label="Éléments bloqués"
                        value={String(cl.blockedItems)}
                      />
                    ) : null}
                    {cl.items && cl.items.length > 0 && (
                      <PdfTable
                        columns={[
                          { header: "Élément", width: 50 },
                          { header: "Statut", width: 25 },
                          { header: "Criticité", width: 25 },
                        ]}
                        rows={cl.items
                          .slice(0, 15)
                          .map((c) => [
                            s(c.item ?? c.description),
                            s(c.status),
                            s(c.criticality ?? c.priority),
                          ])}
                      />
                    )}
                  </>
                );
              }
              items = cl.items ?? [];
            } else if (Array.isArray(checklistRaw)) {
              items = checklistRaw as Array<Record<string, unknown>>;
            }
            if (items.length === 0) return null;
            return (
              <PdfTable
                columns={[
                  { header: "Élément", width: 50 },
                  { header: "Statut", width: 25 },
                  { header: "Criticité", width: 25 },
                ]}
                rows={items
                  .slice(0, 15)
                  .map((c) => [
                    s(c.item ?? c.description),
                    s(c.status),
                    s(c.criticality ?? c.priority),
                  ])}
              />
            );
          })()}
        </>
      )}
      </View>
    </PdfPage>
  );
}

// --- Founder Responses Section ---

export function FounderResponsesSection({
  responses,
  dealName,
}: {
  responses: FounderResponse[];
  dealName: string;
}) {
  if (responses.length === 0) return null;

  const byCategory = new Map<string, FounderResponse[]>();
  for (const r of responses) {
    const cat = r.category || "AUTRE";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Réponses du Fondateur</SectionTitle>
      <BodyText>
        {responses.length} réponse(s) enregistrée(s) suite aux questions de
        l&apos;analyse.
      </BodyText>
      <Spacer />

      {Array.from(byCategory).map(([category, items]) => (
        <View key={category}>
          <SubsectionTitle>{category}</SubsectionTitle>
          {items.map((item, i) => (
            <View key={i} style={{ marginBottom: 8 }} wrap={false}>
              <Text style={gs.bodyBold}>Q: {item.question}</Text>
              <BodyText>R: {item.answer}</BodyText>
            </View>
          ))}
        </View>
      ))}
    </PdfPage>
  );
}
