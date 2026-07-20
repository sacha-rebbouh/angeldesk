/**
 * Competitor Omission Guard — règle d'élévation des red flags « omission de
 * concurrent » (audit HelloCoco 2026-07-20, chantier 2).
 *
 * Le LLM de competitive-intel peut inventer des « concurrents manqués »
 * depuis ses connaissances d'entraînement (Jasper, Anthropic…) et porter un
 * red flag CRITICAL sur cette base, même quand l'entité n'est ni vérifiée en
 * Funding DB ni présente dans la liste Context Engine jugée. Règle : un red
 * flag « omission » ne peut être CRITICAL que si la pertinence de l'entité
 * est établie ET sourcée ; sinon downgrade ou suppression (zéro faux positif
 * > exhaustivité).
 */

type Severity = "CRITICAL" | "HIGH" | "MEDIUM";

interface MissedCompetitorLike {
  name: string;
  whyRelevant: string;
  severity: Severity;
}

interface RedFlagLike {
  category: string;
  severity: Severity;
  title: string;
  description: string;
  evidence?: string;
}

/**
 * Filtre `competitorsMissedInDeck` : une entité n'est gardée que si elle est
 * présente dans la liste Context Engine JUGÉE (seule source où la pertinence
 * catégorie est établie, justifiée et sourcée). Une vérification Funding DB
 * ne suffit PAS : elle établit l'existence de l'entité, pas son overlap
 * catégorie (Mistral AI existe en DB sans être un concurrent de catégorie).
 */
export function filterMissedCompetitors<T extends MissedCompetitorLike>(
  missed: T[],
  contextEngineCompetitorNames: string[]
): { kept: T[]; dropped: T[] } {
  const ceNames = new Set(contextEngineCompetitorNames.map((n) => n.toLowerCase().trim()));

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const entry of missed) {
    if (ceNames.has(entry.name.toLowerCase().trim())) {
      kept.push(entry);
    } else {
      dropped.push(entry);
    }
  }
  return { kept, dropped };
}

const OMISSION_THEME =
  /omission|omis\b|manqu|non[\s-]mentionn|absent|missed|cach[ée]/i;
const COMPETITOR_THEME = /concurren|competitor|competition/i;

function isOmissionFlag(flag: RedFlagLike): boolean {
  const text = `${flag.title} ${flag.description} ${flag.evidence ?? ""}`;
  const isCompetitionScoped =
    flag.category === "competition" || COMPETITOR_THEME.test(flag.title);
  return isCompetitionScoped && OMISSION_THEME.test(text) && COMPETITOR_THEME.test(text);
}

const SEVERITY_RANK: Record<Severity, number> = { MEDIUM: 0, HIGH: 1, CRITICAL: 2 };

/**
 * Garde d'élévation : la sévérité d'un red flag « omission de concurrent »
 * est plafonnée par la sévérité maximale des omissions vérifiées restantes.
 * Aucune omission vérifiée → suppression du flag.
 */
export function applyOmissionRedFlagGuard<F extends RedFlagLike>(
  redFlags: F[],
  survivingMissed: MissedCompetitorLike[]
): { flags: F[]; guardNotes: string[] } {
  const guardNotes: string[] = [];

  const maxSurvivingSeverity: Severity | null = survivingMissed.reduce<Severity | null>(
    (max, entry) =>
      max === null || SEVERITY_RANK[entry.severity] > SEVERITY_RANK[max]
        ? entry.severity
        : max,
    null
  );

  const flags: F[] = [];
  for (const flag of redFlags) {
    if (!isOmissionFlag(flag)) {
      flags.push(flag);
      continue;
    }

    if (maxSurvivingSeverity === null) {
      guardNotes.push(
        `Red flag « ${flag.title} » retiré : aucune omission de concurrent vérifiée (Funding DB / Context Engine) ne le soutient.`
      );
      continue;
    }

    if (SEVERITY_RANK[flag.severity] > SEVERITY_RANK[maxSurvivingSeverity]) {
      guardNotes.push(
        `Red flag « ${flag.title} » plafonné ${flag.severity} → ${maxSurvivingSeverity} : sévérité limitée par les omissions vérifiées restantes.`
      );
      flags.push({ ...flag, severity: maxSurvivingSeverity });
      continue;
    }

    flags.push(flag);
  }

  return { flags, guardNotes };
}
