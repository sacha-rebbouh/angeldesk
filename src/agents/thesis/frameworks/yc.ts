/**
 * Thesis-First — Framework YC (Y Combinator lens)
 *
 * Question centrale : "Existe-t-il un chemin credible vers le Product-Market-Fit ?"
 *
 * Claims que YC expose typiquement :
 *  - Probleme realite : qui experience ce probleme aujourd'hui, combien payent deja ?
 *  - Solution fit : 10 customers > tepid enthusiasm ?
 *  - Distribution : comment acquerir un customer (CAC, canal, viral ?)
 *  - Retention/churn : les customers restent-ils ? (paywall vs stickiness)
 *  - Why-now : pourquoi ce timing, pas avant, pas dans 2 ans ?
 *  - Moat PMF-driven : effet reseau, lock-in, switching cost ?
 *
 * YC est plus indulgent sur la "grandeur" du marche (ils croient en le making
 * something people want), plus exigeant sur la preuve concrete et la traction.
 */

import { z } from "zod";
import type { ThesisVerdict, FrameworkClaim } from "../types";
import { THESIS_ANTI_HALLUCINATION_DIRECTIVES } from "../types";

export const YcLensSchema = z.object({
  verdict: z.enum(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"]),
  confidence: z.number().min(0).max(100),
  question: z.string(),
  claims: z.array(
    z.object({
      claim: z.string(),
      derivedFrom: z.string(),
      status: z.enum(["supported", "contradicted", "unverifiable", "partial"]),
      evidence: z.string().optional(),
      concern: z.string().optional(),
    })
  ),
  failures: z.array(z.string()),
  strengths: z.array(z.string()),
  summary: z.string(),
});

export type YcLensOutput = z.infer<typeof YcLensSchema>;

export function buildYcLensSystemPrompt(): string {
  return `Tu es un partner Y Combinator qui lit une these d'investissement d'une startup.

Ta mission: evaluer si cette these tient au regard du framework YC.

La question centrale de YC est: "Existe-t-il un chemin credible vers le Product-Market-Fit (PMF) ?"

Les 6 angles que tu dois interroger:
1. **Problem reality** — qui experience ce probleme aujourd'hui ? combien ? le font-ils deja payer quelqu'un pour une solution adjacente ?
2. **Solution fit** — les customers actuels sont-ils enthousiastes (make something people want) ou polis ?
3. **Distribution** — quel canal d'acquisition, quel CAC, est-ce scalable ?
4. **Retention & churn** — les customers restent-ils ? est-ce un produit auquel on revient ?
5. **Why-now** — pourquoi maintenant, pas il y a 3 ans, pas dans 3 ans ?
6. **Moat PMF-driven** — effet reseau, lock-in, switching cost structurel ?

Principe YC: on est INDULGENT sur la grandeur du marche (si les clients adorent, on peut toujours grandir), EXIGEANT sur la preuve concrete et la traction. Une these qui promet 10Bn TAM sans 10 customers actifs est une these YC-fragile.

Ton output:
- claims[] : 4-8 affirmations IMPLICITES de la these (ce que le fondateur DOIT croire pour que la these tienne), avec status (supported/contradicted/unverifiable/partial) base sur les donnees disponibles.
- failures[] : points structurels ou le framework YC casse (ex: "aucune traction mesuree", "distribution theorique", "retention non documentee").
- strengths[] : points structurels qui renforcent (ex: "10 customers actifs payants", "NPS 72", "retention 90 jours").
- verdict : le signal global de la these vue par la lunette YC.
- confidence : ta confiance dans ce verdict (0-100). Baisse si les sources sont minces.

Regle critique: un verdict VERY_FAVORABLE ou FAVORABLE exige des preuves concretes (traction mesuree). Sans traction, plafonne a CONTRASTED au mieux.

LANGUE: Francais.

${THESIS_ANTI_HALLUCINATION_DIRECTIVES}
`;
}

export function buildYcLensUserPrompt(params: {
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  contextSummary: string;
}): string {
  return `## THESE A EVALUER (vue YC)

**Reformulee (extraite de la societe) :**
${params.reformulated}

**Probleme vise :**
${params.problem}

**Solution proposee :**
${params.solution}

**Why-now :**
${params.whyNow}

**Moat revendique :**
${params.moat ?? "(non declare)"}

**Path to exit :**
${params.pathToExit ?? "(non declare)"}

## CONTEXTE DISPONIBLE (fact store + deck + context engine)

${params.contextSummary}

---

Applique la lunette YC. Expose les claims implicites, verifie-les contre les donnees, identifie les failures et les strengths structurels. Rends ton verdict honnete.

OUTPUT ATTENDU: JSON strict conforme au schema, en francais, sans aucun texte en dehors du JSON.`;
}
