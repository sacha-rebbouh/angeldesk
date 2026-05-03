/**
 * Thesis-First — Framework Thiel (Zero to One lens)
 *
 * Question centrale : "Existe-t-il un chemin credible vers le monopoly
 * ou au minimum une position contrarian defensible ?"
 *
 * Claims que Thiel expose typiquement :
 *  - Contrarian truth : quelle verite importante tres peu de gens partagent ?
 *  - 10x better : le produit est-il 10x meilleur que les alternatives sur UN axe ?
 *  - Proprietary tech : technologie/donnee/IP que le concurrent ne peut pas copier ?
 *  - Network/scale effects : chaque user/data-point rend le produit plus puissant ?
 *  - Monopoly path : le marche a-t-il une structure qui permet une position dominante ?
 *  - Timing (anti-consensus) : le marche est-il encore nascent, bureaucratise, ou ouvert ?
 *
 * Thiel est EXIGEANT sur la defensibilite structurelle, biaise vers les deals
 * power-law. Une execution solide sur un marche competitif ne suffit pas.
 */

import { z } from "zod";
import { THESIS_ANTI_HALLUCINATION_DIRECTIVES } from "../types";

function unwrapLensEnvelope(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const meta = record.meta;
  if (!meta || typeof meta !== "object") {
    return raw;
  }

  const metaRecord = meta as Record<string, unknown>;
  return {
    ...record,
    verdict: record.verdict ?? metaRecord.verdict,
    confidence: record.confidence ?? metaRecord.confidence,
    question: record.question ?? metaRecord.question,
    failures: record.failures ?? metaRecord.failures,
    strengths: record.strengths ?? metaRecord.strengths,
    summary: record.summary ?? metaRecord.summary,
  };
}

export const ThielLensSchema = z.preprocess(unwrapLensEnvelope, z.object({
  verdict: z.preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase().trim() : val),
    z.enum(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"])
  ).catch("contrasted"),
  confidence: z.number().min(0).max(100).catch(50),
  question: z.string().catch("Existe-t-il un chemin vers le monopoly ou une position contrarian defensible ?"),
  claims: z.array(
    z.object({
      claim: z.string().catch("Claim"),
      derivedFrom: z.string().catch("Source non structuree"),
      status: z.preprocess(
        (val) => (typeof val === "string" ? val.toLowerCase().trim() : val),
        z.enum(["supported", "contradicted", "unverifiable", "partial"])
      ).catch("unverifiable"),
      evidence: z.string().nullish(),
      concern: z.string().nullish(),
    })
  ).catch([]),
  failures: z.array(z.string()).catch([]),
  strengths: z.array(z.string()).catch([]),
  summary: z.string().catch("Thiel lens summary unavailable"),
}));

export type ThielLensOutput = z.infer<typeof ThielLensSchema>;

export function buildThielLensSystemPrompt(): string {
  return `Tu es un investisseur Founders Fund (Thiel) qui lit une these d'investissement d'une startup.

Ta mission: evaluer si cette these tient au regard du framework Thiel (Zero to One).

La question centrale de Thiel est: "Existe-t-il un chemin credible vers le monopoly ou au minimum une position contrarian defensible qui durera ?"

Les 6 angles que tu dois interroger:
1. **Contrarian truth** — quelle verite importante tres peu de gens partagent ? le fondateur voit-il quelque chose que le marche ne voit pas ?
2. **10x better** — le produit est-il 10x meilleur que les alternatives sur UN axe clair ? ou juste 2x-3x (insuffisant pour briser l'inertie des incumbents) ?
3. **Proprietary tech / data / IP** — que possede la societe que le concurrent ne peut pas copier en 12 mois ?
4. **Network / scale effects** — chaque user, chaque data-point, chaque transaction rend-elle le produit plus puissant (lock-in structurel) ?
5. **Monopoly path** — la structure du marche permet-elle une position dominante (fragmented & winner-takes-most) ou est-ce un marche commoditise ?
6. **Timing anti-consensus** — le marche est-il nascent (personne n'y croit encore), bureaucratise (incumbents lents), ou deja consensus (trop tard) ?

Principe Thiel: l'execution SEULE ne suffit pas. Un marche competitif (meme avec une bonne equipe) n'aboutit pas. Il faut une asymetrie structurelle OU un timing anti-consensus fort. Thiel est BIAISE vers les deals power-law (1 winner prend tout).

Ton output:
- claims[] : 4-8 affirmations IMPLICITES de la these vues par la lunette Thiel (ex: "ce marche est fragmente et permet winner-takes-most", "notre tech est proprietaire de 3 ans"), avec status.
- failures[] : points structurels ou le framework Thiel casse (ex: "pas de 10x better demontre", "marche deja consensus", "aucun effet reseau").
- strengths[] : points structurels qui renforcent (ex: "effet reseau demontre 40% de rachat referral", "brevet X couvrant la tech core").
- verdict : le signal global de la these vue par la lunette Thiel.
- confidence : ta confiance dans ce verdict (0-100).

Regle critique: Thiel refuse VERY_FAVORABLE sans preuve structurelle de defensibilite (moat reel, pas "execution"). Un deal avec equipe exceptionnelle mais sans moat = CONTRASTED au mieux. Une these "we'll outexecute incumbents" sans asymetrie = VIGILANCE.

LANGUE: Francais.

${THESIS_ANTI_HALLUCINATION_DIRECTIVES}
`;
}

export function buildThielLensUserPrompt(params: {
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  contextSummary: string;
}): string {
  return `## THESE A EVALUER (vue Thiel)

**Reformulee :**
${params.reformulated}

**Probleme :**
${params.problem}

**Solution :**
${params.solution}

**Why-now :**
${params.whyNow}

**Moat revendique :**
${params.moat ?? "(non declare)"}

**Path to exit :**
${params.pathToExit ?? "(non declare)"}

## CONTEXTE DISPONIBLE

${params.contextSummary}

---

Applique la lunette Thiel. Cherche la verite contrarian, le 10x, le moat proprietaire, les network effects, la structure monopoly, le timing anti-consensus. Ne valide rien qui repose uniquement sur "execution".

OUTPUT ATTENDU: JSON strict conforme au schema, en francais, sans texte hors JSON.`;
}
