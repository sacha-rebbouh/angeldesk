import { describe, expect, it } from "vitest";

import { AGENT_TECHNICAL_NAMES, isLegalRegistryUnavailableSignal, sanitizeSourceLabel } from "../lib/presentation";
import { thesisAlertCategoryLabel, DECK_COHERENCE_LABELS, DECK_COHERENCE_VALUES } from "@/lib/ui-configs";
import { inferRedFlagTopic } from "@/services/red-flag-dedup/dedup";
import {
  buildAnalysisV2ViewModel,
  buildDecisionSectionModel,
  buildDecisionStripModel,
  buildEvidenceSectionModel,
  buildMemoSectionModel,
  buildSignalsSectionModel,
  buildThesisSectionModel,
} from "../lib/selectors";
import { HOSTILE_CATEGORIES, HOSTILE_MEMO_VERDICT, HOSTILE_RESULTS, HOSTILE_SOURCE_STRINGS, HOSTILE_THESIS } from "./fixtures/hostile-results";

// Tournures « verdict » prescriptives bannies en surface (doctrine). Les test
// files ne sont PAS scannés par doctrine-guard → littéraux autorisés ici.
function expectNoVerdict(value: string) {
  expect(value, `"${value}" : « investissable »`).not.toMatch(/investissable/i);
  expect(value, `"${value}" : verdict rédhibitoire`).not.toMatch(/deal[\s_-]?breaker/i);
  expect(value, `"${value}" : abstention impérative`).not.toMatch(/\bne\s+pas\s+investir\b/i);
  expect(value, `"${value}" : impératif « il faut investir »`).not.toMatch(/\bil\s+faut\s+investir\b/i);
  expect(value, `"${value}" : go/no-go`).not.toMatch(/\bgo\s*\/\s*no[\s_-]*go\b/i);
  expect(value, `"${value}" : rejet impératif d'un deal`).not.toMatch(/\brejet(?:er|ez)\s+(?:ce\s+|le\s+|la\s+|l['’]|cette\s+)?(?:deal|dossier|opportunit|soci[ée]t)/i);
  expect(value, `"${value}" : passer ce deal`).not.toMatch(/\bpasser\s+ce\s+deal\b/i);
}

/**
 * Guard doctrine RUNTIME (data-driven) — complète le source-scan de
 * `doctrine-guard.test.ts` (qui ne voit que les littéraux hardcodés).
 *
 * Phase 0b : on verrouille que les HELPERS neutralisent les fuites des shapes
 * de données réelles (fixture hostile). Les assertions « view-model complet
 * propre » (`buildAnalysisV2ViewModel(HOSTILE_*)`) sont activées dans les phases
 * qui câblent la sanitization dans les sélecteurs/atoms (catégories → Phase 2,
 * sources → Phase 4, mémo → Phase 7) puis consolidées au guard final.
 */

function expectNoAgentName(value: string) {
  const lower = value.toLowerCase();
  for (const name of AGENT_TECHNICAL_NAMES) {
    expect(lower, `"${value}" contient le nom d'agent "${name}"`).not.toContain(name);
  }
  expect(lower, `"${value}" contient un "*-expert"`).not.toMatch(/-expert\b/);
}

describe("doctrine runtime guard — helpers neutralisent les fuites du fixture hostile", () => {
  it("sanitizeSourceLabel nettoie toutes les sources/locations piégées", () => {
    for (const raw of HOSTILE_SOURCE_STRINGS) {
      expectNoAgentName(sanitizeSourceLabel(raw));
    }
  });

  it("thesisAlertCategoryLabel ne rend jamais l'enum brut", () => {
    for (const cat of HOSTILE_CATEGORIES) {
      const label = thesisAlertCategoryLabel(cat);
      expect(label).not.toBeNull();
      expect(label!).not.toMatch(/_/); // pas d'underscore
      expect(label!).not.toBe(cat.toUpperCase()); // pas l'enum brut
    }
  });

  // Phase 2 : le view-model thèse expose la catégorie en LABEL, jamais l'enum brut.
  it("buildThesisSectionModel.alerts[].category est un label, pas un enum brut", () => {
    const model = buildThesisSectionModel(HOSTILE_THESIS, HOSTILE_RESULTS, "full_analysis");
    expect(model.alerts.length).toBeGreaterThan(0);
    for (const alert of model.alerts) {
      if (alert.category == null) continue;
      expect(alert.category).not.toMatch(/_/);
      expect(alert.category).not.toMatch(/^[A-Z_]+$/); // pas un enum SCREAMING_CASE
    }
  });

  // Phase 4 : les risques rangés n'exposent aucun nom d'agent (source/tags/preuve)
  // et ne retombent pas sur "Risque identifié" quand du contenu existe (#5).
  it("buildDecisionSectionModel.ranks : zéro nom d'agent, pas de titre générique quand contenu existe", () => {
    const model = buildDecisionSectionModel(HOSTILE_RESULTS);
    expect(model.ranks.length).toBeGreaterThan(0);
    for (const r of model.ranks) {
      if (r.source) expectNoAgentName(r.source);
      for (const t of r.tags ?? []) expectNoAgentName(t.label);
      if (r.evidence) expectNoAgentName(r.evidence);
      if (r.description) expectNoAgentName(r.description);
      expectNoAgentName(r.title); // un title runtime peut contenir un nom d'agent → doit être scrubé
      // le red flag du fixture a un `impact` mais pas de `title` → titre dérivé, pas générique
      expect(r.title).not.toBe("Risque identifié");
    }
  });

  // Phase 5 : les cartes signaux (étaye/alerte) ne contiennent aucun nom d'agent.
  it("buildSignalsSectionModel.cards : oneLiner/supports/concerns sans nom d'agent ni score /100", () => {
    const model = buildSignalsSectionModel(HOSTILE_RESULTS);
    expect(model.cards.length).toBeGreaterThan(0);
    for (const c of model.cards) {
      const strings = [c.oneLiner ?? "", ...c.supports, ...c.concerns];
      for (const s of strings) {
        expectNoAgentName(s);
        expect(s, `"${s}" expose un score /100`).not.toMatch(/\/\s*100/); // #16 : pas de score chiffré dans le texte
      }
    }
  });

  // Phase 7 : les ranks consolidés sont dédupliqués par topic (#21 « sans doublons »).
  it("buildDecisionSectionModel.ranks : déduplication par topic (2 flags valorisation → 1)", () => {
    const model = buildDecisionSectionModel(HOSTILE_RESULTS);
    const topics = model.ranks.map((r) => inferRedFlagTopic(r.title));
    expect(new Set(topics).size, `topics dupliqués: ${topics.join(", ")}`).toBe(topics.length);
    // les 2 flags de topic « valuation » du fixture doivent être fusionnés en 1 rank
    expect(topics.filter((t) => t === "valuation").length).toBeLessThanOrEqual(1);
  });

  // Phase 7 : le mémo expose le total de risques critiques (pour « voir les N »)
  // et les priorités d'investigation sont scrubées sur TOUS les champs rendus.
  it("buildMemoSectionModel expose totalCriticalRisks + priorités scrubées (#21/#22)", () => {
    const memo = buildMemoSectionModel(HOSTILE_RESULTS);
    expect(typeof memo.totalCriticalRisks).toBe("number");
    expect(memo.totalCriticalRisks).toBeGreaterThan(0);
    expect(memo.topPriorities.length).toBeGreaterThan(0);
    for (const p of memo.topPriorities) {
      expectNoAgentName(p.action);
      if (p.rationale) expectNoAgentName(p.rationale);
      if (p.deadline) expectNoAgentName(p.deadline);
    }
  });

  // Phase 6 : la table de preuves (claim/source/note) ne contient aucun nom d'agent.
  it("buildEvidenceSectionModel : claim/source/note sans nom d'agent", () => {
    const rows = buildEvidenceSectionModel(HOSTILE_RESULTS);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expectNoAgentName(row.claim);
      expectNoAgentName(row.source);
      if (row.sourceDetail) expectNoAgentName(row.sourceDetail);
      if (row.note) expectNoAgentName(row.note);
      // Pas de fausse provenance : "Recoupement de sources" seulement si une source
      // inline réelle (« Doc : … ») est présente dans le claim.
      if (row.source === "Recoupement de sources") {
        expect(row.claim, `"${row.claim}" annonce un recoupement sans source inline`).toMatch(/ : «/);
      }
    }
  });

  // Phase 8a (#6) : un flag « registre officiel indisponible » est reclassé en
  // notice « couverture légale à vérifier » (hors risques société) ; les vrais
  // risques légaux (procédure collective, équipe non vérifiée) restent critiques.
  it("buildDecisionSectionModel : registre indisponible reclassé en notice, vrais risques préservés", () => {
    const model = buildDecisionSectionModel(HOSTILE_RESULTS);
    // (a) la notice « couverture légale à vérifier » est levée
    expect(model.legalCoverageGap).toBe(true);
    // (b) aucun risque rangé ne porte la signature « registre indisponible »
    for (const r of model.ranks) {
      const blob = [r.title, r.description ?? "", r.evidence ?? ""].join(" ");
      expect(isLegalRegistryUnavailableSignal(blob), `le rank "${r.title}" aurait dû être reclassé`).toBe(false);
    }
    // (c) les décoys (vrais risques) restent présents (jamais déclassés)
    const titles = model.ranks.map((r) => r.title.toLowerCase());
    expect(titles.some((t) => t.includes("procédure collective")), "procédure collective manquante").toBe(true);
    expect(titles.some((t) => t.includes("équipe dirigeante non vérifiée")), "équipe non vérifiée manquante").toBe(true);
  });

  // Phase 8a (#6) : la carte d'une dimension ne présente PAS le « registre
  // indisponible » comme alerte (porté par la notice), sans masquer les vrais risques.
  it("buildSignalsSectionModel : concern « registre indisponible » filtré des cartes", () => {
    const model = buildSignalsSectionModel(HOSTILE_RESULTS);
    let kept = 0;
    for (const c of model.cards) {
      for (const concern of c.concerns) {
        expect(isLegalRegistryUnavailableSignal(concern), `le concern "${concern}" aurait dû être filtré`).toBe(false);
        if (concern.toLowerCase().includes("procédure collective")) kept += 1;
      }
    }
    expect(kept, "le vrai risque légal aurait dû rester en concern").toBeGreaterThan(0);
  });

  // Doctrine (l'outil ne DÉCIDE jamais) : AUCUNE chaîne rendue du view-model complet
  // ne présente l'outil/l'analyse comme le LIEU DE LA DÉCISION. Le fixture ne contient
  // QUE des tournures à sujet OUTIL/DONNÉES (la préservation du sujet INVESTISSEUR est
  // couverte par le unit test) → walk-all = zéro fuite attendue sur toutes les surfaces.
  it("VM complet : zéro tournure prescriptive « décision » sur TOUTES les surfaces rendues", () => {
    const vm = buildAnalysisV2ViewModel({
      deal: { id: "d", name: "avekapeti" },
      analysis: { results: HOSTILE_RESULTS, mode: "full_analysis" },
      thesis: HOSTILE_THESIS,
    });
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(vm);
    for (const s of strings) {
      expect(s, `"${s}" présente l'outil comme décideur`).not.toMatch(/pour\s+(?:prendre|baser)\s+(?:une|la|cette)\s+d[ée]cision/i);
      expect(s).not.toMatch(/capacit[ée]\s+[àa]\s+prendre\s+(?:une|la|cette)\s+d[ée]cision/i);
      expect(s).not.toMatch(/fiable\s+pour\s+(?:la\s+)?d[ée]cision\b/i);
      expect(s).not.toMatch(/baser\s+(?:une|la|cette)\s+d[ée]cision/i);
      // Défense en profondeur : la classe « verdict » est aussi proscrite sur le VM complet.
      expectNoVerdict(s);
    }
    // les ranks piégés restent VISIBLES (reformulés, pas filtrés silencieusement)
    expect(vm.decisionSection.ranks.some((r) => /consistance/i.test(r.title))).toBe(true);
    // la preuve prescriptive (deck-coherence) est bien présente, reformulée
    expect(vm.evidenceSection.length).toBeGreaterThan(0);
  });

  // Phase 9c (#11) : la réconciliation déterministe (synthèse LLM indisponible) est
  // surfacée honnêtement via le marqueur STRUCTURÉ `synthesisDegraded` (pas une
  // heuristique texte) ; jamais quand l'agent a échoué ou tourné en mode LLM normal.
  it("buildThesisSectionModel : reconciliationDegraded reflète le marqueur structuré synthesisDegraded", () => {
    const degraded = buildThesisSectionModel(
      HOSTILE_THESIS,
      { "thesis-reconciler": { success: true, data: { synthesisDegraded: true } } },
      "full_analysis",
    );
    expect(degraded.reconciled).toBe(true);
    expect(degraded.reconciliationDegraded).toBe(true);

    const normal = buildThesisSectionModel(
      HOSTILE_THESIS,
      { "thesis-reconciler": { success: true, data: { synthesisDegraded: false } } },
      "full_analysis",
    );
    expect(normal.reconciled).toBe(true);
    expect(normal.reconciliationDegraded).toBe(false);

    const failed = buildThesisSectionModel(
      HOSTILE_THESIS,
      { "thesis-reconciler": { success: false, error: "timed out" } },
      "full_analysis",
    );
    expect(failed.reconciled).toBe(false);
    expect(failed.reconciliationDegraded).toBe(false);
  });

  // Phase 5 (finding Codex 5a) : la synthèse financière du mémo généré scrube
  // le LABEL des métriques (clé `currentMetrics` issue du LLM) — une clé piégée
  // « financial-auditor ARR » ne doit pas fuiter ; la métrique propre survit.
  it("buildMemoSectionModel (generated) : labels financialSummary scrubés", () => {
    const memo = buildMemoSectionModel({
      "memo-generator": {
        success: true,
        data: {
          financialSummary: {
            currentMetrics: { "financial-auditor ARR": "1M€", Croissance: "120%" },
          },
        },
      },
    });
    expect(memo.kind).toBe("generated");
    if (memo.kind !== "generated") return;
    const metrics = memo.financialSummary?.metrics ?? [];
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expectNoAgentName(m.label);
      expect(m.value.length).toBeGreaterThan(0);
    }
    // la métrique propre reste présente, le nom d'agent est retiré du label piégé
    expect(metrics.some((m) => m.label === "Croissance")).toBe(true);
    expect(metrics.some((m) => /arr/i.test(m.label))).toBe(true);
  });

  // Phase 5b : un mémo GÉNÉRÉ truffé de tournures « verdict » prescriptives est
  // scrubé sur TOUTES les surfaces rendues (oneLiner, keyPoints, overview, thèse,
  // highlights, keyRisks, financialSummary, dealTerms, dueDiligence, criticalRisks,
  // nextSteps). Non-vacuous : les champs riches sont peuplés (les verdicts ont bien
  // transité par le scrub) — sinon l'assertion ne prouverait rien.
  it("buildMemoSectionModel (generated) : zéro tournure « verdict » sur toutes les surfaces", () => {
    const memo = buildMemoSectionModel(HOSTILE_MEMO_VERDICT);
    expect(memo.kind).toBe("generated");
    if (memo.kind !== "generated") return;
    // Non-vacuous : les blocs riches ont bien été construits depuis le fixture hostile.
    expect(memo.keyRisks.length).toBeGreaterThan(0);
    expect(memo.companyOverview).toBeTruthy();
    expect(memo.dealTerms).toBeTruthy();

    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(memo);
    expect(strings.length).toBeGreaterThan(5);
    for (const s of strings) {
      expectNoAgentName(s);
      expectNoVerdict(s);
    }
  });

  // Phase 4 (finding Codex) : le mémo reconstitué ne fabrique pas de provenance
  // factice ("Tier 1") ni de nom d'agent dans la source des risques critiques.
  it("buildMemoSectionModel : pas de provenance factice dans les risques critiques", () => {
    const memo = buildMemoSectionModel(HOSTILE_RESULTS);
    if (memo.kind === "reconstituted") {
      for (const r of memo.criticalRisks) {
        if (r.source) {
          expect(r.source).not.toBe("Tier 1");
          expectNoAgentName(r.source);
        }
      }
    }
  });

  // Dé-scorisation P3-b : la cohérence du deck est restituée en BANDE VERBALE,
  // jamais en note /100. Le modèle n'expose plus de `coherenceScore` numérique ;
  // le libellé restitué est verbal (aucun chiffre).
  it("buildDecisionStripModel : cohérence du deck verbale, aucune note /100", () => {
    const model = buildDecisionStripModel({ id: "d1" }, { results: HOSTILE_RESULTS }, null);
    expect(model).not.toHaveProperty("coherenceScore");
    // hostile fixture : coherenceScore 29 → bande la plus basse, dérivée sans nombre rendu
    expect(model.coherenceBand).toBe("incoherent");
    expect(DECK_COHERENCE_VALUES).toContain(model.coherenceBand);
    const label = model.coherenceBand ? DECK_COHERENCE_LABELS[model.coherenceBand] : "";
    expect(label).not.toMatch(/\/\s*100/);
    expect(label).not.toMatch(/\d/);
  });

  it("buildDecisionStripModel : aucune cohérence inventée quand le score est absent", () => {
    const model = buildDecisionStripModel({ id: "d1" }, { results: {} }, null);
    expect(model.coherenceBand).toBeNull();
  });
});
