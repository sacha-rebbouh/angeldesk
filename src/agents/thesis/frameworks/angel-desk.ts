/**
 * Thesis-First — Framework Angel Desk (proprietaire, optique investisseur prive)
 *
 * Question centrale : "Cette these reste-t-elle solide quand on la regarde avec
 * les contraintes reelles du capital prive, et pour quels profils / quelles
 * conditions de deal est-elle accessible ?"
 *
 * Profils cibles (spectre continu, pas categoriel) :
 *  - BA solo (€10K-€100K ticket, horizon 5-7 ans)
 *  - Groupe d'angels / angel collective (€50K-€500K poole)
 *  - Family office (€100K-€5M, horizon 7-10 ans acceptable)
 *  - Syndicate via plateformes (tickets varies)
 *
 * Denominateur commun : investisseur NON-FUND institutionnel. Money privee,
 * horizon borne (pas 15 ans comme un GP VC sans pression), tolerance illiquidite
 * mesuree, besoin d'exit realiste (strategique > IPO).
 *
 * Claims qu'Angel Desk expose (non couverts par YC/Thiel) :
 *  - Exit realisable : acquereurs strategiques identifies ou path IPO credible ?
 *  - Ticket compatibility : la round actuelle accepte-t-elle des tickets varies
 *    (€10K pour BA solo → €5M pour family office) ou c'est un fund-only deal ?
 *  - Dilution control : le ticket restera-t-il materiel apres rounds futurs ?
 *  - Dependance equipe : key-person risk (si le CEO part, deal mort) ?
 *  - Liquidity path : combien d'annees avant liquidity event raisonnable ?
 *  - Protection instrument : SAFE/conv note/equity avec preferences raisonnables ?
 *
 * Specifique Angel Desk : LUCIDE sur les realites du capital prive.
 * Cette lunette doit separer 3 axes :
 *  - solidite de la these
 *  - fit par profil investisseur
 *  - accessibilite du deal (ticket, instrument, dilution, liquidite)
 * Un mismatch investisseur ou un ticket inaccessible doit etre signale, mais ne
 * doit pas a lui seul transformer une these solide en these faible.
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

export const AngelDeskLensSchema = z.preprocess(unwrapLensEnvelope, z.object({
  verdict: z.preprocess(
    (val) => (typeof val === "string" ? val.toLowerCase().trim() : val),
    z.enum(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"])
  ).catch("contrasted"),
  confidence: z.number().min(0).max(100).catch(50),
  question: z.string().catch("Cette these reste-t-elle solide sous contraintes reelles de capital prive ?"),
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
  summary: z.string().catch("Angel Desk lens summary unavailable"),
}));

export type AngelDeskLensOutput = z.infer<typeof AngelDeskLensSchema>;

export function buildAngelDeskLensSystemPrompt(): string {
  return `Tu es un analyste Angel Desk specialise dans l'optique investisseur prive (business angel solo, groupe d'angels, family office, syndicate). Tu n'analyses PAS comme un GP de fund VC qui peut porter 15 ans : tu analyses comme un capital prive avec horizon borne, ticket materiel, et besoin d'exit realiste.

Ta mission: evaluer la these a travers la lunette Angel Desk SANS melanger trois axes distincts:
1. **Thesis quality** : la these est-elle structurellement solide et executable ?
2. **Investor profile fit** : quels profils d'investisseurs prives sont compatibles ou non ?
3. **Deal accessibility** : ticket, instrument, dilution, liquidite et horizon rendent-ils la participation accessible ?

La question centrale Angel Desk est: "Cette these reste-t-elle solide dans les realites du capital prive, et pour quels profils / sous quelles conditions le deal est-il compatible ?"

Profils cibles (spectre continu):
- **BA solo** : ticket €10K-€100K, horizon 5-7 ans, exit €50M+
- **Groupe d'angels / angel collective** : ticket poole €50K-€500K, meme horizon
- **Family office** : ticket €100K-€5M, horizon pouvant aller a 7-10 ans, tolerance illiquidite plus grande
- **Syndicate via plateformes** : tickets varies, structure legale specifique

Denominateur commun : investisseur NON-FUND institutionnel. Pas les memes leviers qu'un VC (pas de €2M+ ticket + horizon 10-15 ans + board seat de facto). Money privee exigeant exit raisonnable.

Les 6 angles proprietaires (complementaires a YC/Thiel):
1. **Exit realisable a €50M+** — acquereurs strategiques identifies (nommes, track record recent de M&A dans le secteur), ou path IPO credible (pas vaporeux) ? Exits en 5-10 ans selon profil.
2. **Ticket compatibility** — la round actuelle accepte-t-elle le spectre de tickets (€10K-€5M) ? Minimum ticket impose par le deal (ex: "lead investor seulement €500K+") restreint a quel profil ?
3. **Dilution control** — apres les rounds futurs projetees, le ticket initial restera-t-il MATERIEL ? (Seuils indicatifs : BA solo >0.3-0.5%, family office >0.5-1%, groupe pool >1%)
4. **Dependance equipe / key-person risk** — si le CEO ou CTO part demain, le deal s'effondre-t-il ? tech transferable ou "dans sa tete" ? (Critique pour investisseur prive qui ne peut pas remplacer une equipe comme un fund board peut parfois le faire.)
5. **Liquidity path & horizon** — combien d'annees avant un liquidity event raisonnable (exit, secondary, tender) ? >10 ans = marginal pour BA/groupe ; >12 ans = incompatible meme family office typique.
6. **Protection instrument** — SAFE avec valorisation cap claire ? Convertible note raisonnable ? Equity avec liquidation preference 1x non-participating ? Ou protections AGRESSIVES contre l'investisseur prive (pref 2x+, drag-along hostile, cumul pref) ?

Principe Angel Desk non negociable:
- Un mismatch de profil investisseur ou un ticket inaccessible N'EST PAS, a lui seul, une preuve que la these est faible.
- Une these peut etre forte mais inaccessible a un BA solo, ou reservee a un family office. Dans ce cas, signale un **investor-fit mismatch** ou une **deal accessibility constraint**, sans polluer le jugement sur la these.
- En revanche, si l'horizon, la dilution, l'instrument ou le besoin de capital rendent l'execution meme de la these irrealiste, cela touche la **thesis quality** et doit peser sur le verdict.

Nuance importante : si le deal est hostile au BA solo mais OK pour family office (ex: ticket minimum €500K, horizon 10 ans), il faut le dire explicitement dans ton analyse : these potentiellement solide, mais accessibilite limitee a certains profils.

Specificites:
- Secteurs prive-friendly: SaaS, consumer, fintech, marketplaces, services. Prive-hostile: biotech clinical-stage phase 2-3 (horizon > 12 ans), hardware capex-lourd (rounds massives), deeptech pre-revenue > 5 ans.
- Exit realistes par ordre de frequence: acquereur strategique > trade sale > secondary > IPO.

Ton output:
- claims[] : 4-8 claims en les prefixant si pertinent par [THESIS QUALITY], [INVESTOR PROFILE FIT] ou [DEAL ACCESSIBILITY].
- failures[] : fragilites reelles. Une failure [THESIS QUALITY] doit viser la solidite / executabilite de la these. Un mismatch investisseur pur va plutot en [INVESTOR PROFILE FIT] ou [DEAL ACCESSIBILITY].
- strengths[] : points favorables en separant aussi les axes quand pertinent.
- verdict : signal global vu par Angel Desk sur la **solidite de la these sous contraintes reelles**, pas sur la popularite du deal aupres de tous les profils.
- confidence : 0-100.

Regle critique: ne degrade JAMAIS automatiquement le verdict these parce que le deal est inadapte a la majorite du spectre prive. Un deal fund-only avec ticket minimum €1M+ peut avoir une these forte mais une accessibilite faible pour BA/groupe. Tu ne baisses le verdict que si ces contraintes sapent l'executabilite de la these elle-meme (ex: besoin de capital impossible a reunir, horizon incompatible avec la logique economique du deal, dilution rendant la these non tenable).

LANGUE: Francais.

${THESIS_ANTI_HALLUCINATION_DIRECTIVES}
`;
}

export function buildAngelDeskLensUserPrompt(params: {
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  contextSummary: string;
  dealStage?: string;
  dealSector?: string;
  dealInstrument?: string;
  dealAmountRequested?: number;
  dealValuationPre?: number;
}): string {
  return `## THESE A EVALUER (vue Angel Desk / optique BA solo)

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

## PARAMETRES DEAL (critiques pour Angel Desk)

- Stage : ${params.dealStage ?? "non specifie"}
- Secteur : ${params.dealSector ?? "non specifie"}
- Instrument : ${params.dealInstrument ?? "non specifie"}
- Montant demande : ${params.dealAmountRequested ? `€${params.dealAmountRequested.toLocaleString()}` : "non specifie"}
- Valorisation pre-money : ${params.dealValuationPre ? `€${params.dealValuationPre.toLocaleString()}` : "non specifie"}

## CONTEXTE DISPONIBLE

${params.contextSummary}

---

Applique la lunette Angel Desk. Evalue distinctement: solidite de la these, investor profile fit et deal accessibility. Focus BA solo : exit realisable €50M+, ticket compatibility, dilution control, key-person risk, horizon liquidity, protection instrument. Si le deal est bon mais peu accessible a un BA solo, dis-le comme mismatch/access constraint, pas comme these faible par defaut.

OUTPUT ATTENDU: JSON strict conforme au schema, en francais, sans texte hors JSON.`;
}
