import type { CurrentFact, DataReliability } from './types';

/**
 * Reliability levels ordered from most to least reliable.
 */
const RELIABILITY_ORDER: readonly DataReliability[] = [
  'AUDITED', 'VERIFIED', 'DECLARED', 'PROJECTED', 'ESTIMATED', 'UNVERIFIABLE'
] as const;

/**
 * Filter facts based on minimum reliability level.
 */
export function filterFactsByReliability(
  facts: CurrentFact[],
  minReliability: DataReliability = 'DECLARED'
): CurrentFact[] {
  const minIndex = RELIABILITY_ORDER.indexOf(minReliability);

  return facts.filter(fact => {
    const factReliability = getFactReliability(fact);
    const factIndex = RELIABILITY_ORDER.indexOf(factReliability);
    return factIndex <= minIndex;
  });
}

/**
 * Replace PROJECTED/UNVERIFIABLE facts with placeholder markers
 * so agents see that data exists but cannot use the values.
 */
export function replaceUnreliableWithPlaceholders(
  facts: CurrentFact[]
): CurrentFact[] {
  return facts.map(fact => {
    const reliability = getFactReliability(fact);

    if (reliability === 'PROJECTED' || reliability === 'UNVERIFIABLE') {
      return {
        ...fact,
        currentValue: null,
        currentDisplayValue: `[${reliability}] Valeur non injectable - ${fact.currentDisplayValue}`,
      };
    }
    return fact;
  });
}

/**
 * Format facts for agents with appropriate handling per reliability level.
 *
 * - AUDITED/VERIFIED: full value, presented as fact
 * - DECLARED: full value, presented with caveat
 * - PROJECTED: value shown but marked as NON-INJECTABLE in scoring
 * - ESTIMATED: value shown with calculation note
 * - UNVERIFIABLE: value hidden, only mention exists
 */
export function formatFactsForScoringAgents(
  facts: CurrentFact[]
): string {
  const sections: Record<string, string[]> = {
    verified: [],
    declared: [],
    projected: [],
    unreliable: [],
  };

  for (const fact of facts) {
    const reliability = getFactReliability(fact);

    switch (reliability) {
      case 'AUDITED':
      case 'VERIFIED':
        sections.verified.push(
          `- **${fact.factKey}**: ${fact.currentDisplayValue} [${reliability}]`
        );
        break;
      case 'DECLARED':
        sections.declared.push(
          `- **${fact.factKey}**: ${fact.currentDisplayValue} [DECLARED - non verifie]`
        );
        break;
      case 'PROJECTED':
      case 'ESTIMATED':
        sections.projected.push(
          `- **${fact.factKey}**: [PROJECTION - NE PAS UTILISER POUR LE SCORING] ` +
          `Valeur declaree: ${fact.currentDisplayValue}`
        );
        break;
      case 'UNVERIFIABLE':
        sections.unreliable.push(
          `- **${fact.factKey}**: [UNVERIFIABLE - IGNORE POUR L'ANALYSE]`
        );
        break;
    }
  }

  let output = '';

  if (sections.verified.length > 0) {
    output += `### Donnees verifiees (utilisables comme faits)\n${sections.verified.join('\n')}\n\n`;
  }
  if (sections.declared.length > 0) {
    output += `### Donnees declarees (a prendre avec prudence)\n${sections.declared.join('\n')}\n\n`;
  }
  if (sections.projected.length > 0) {
    output += `### Projections (NE PAS SCORER COMME DES FAITS)\n${sections.projected.join('\n')}\n\n`;
  }
  if (sections.unreliable.length > 0) {
    output += `### Non verifiable (IGNORE)\n${sections.unreliable.join('\n')}\n\n`;
  }

  return output;
}

function getFactReliability(fact: CurrentFact): DataReliability {
  if (fact.reliability?.reliability) {
    const r = fact.reliability.reliability;
    if (RELIABILITY_ORDER.includes(r)) {
      return r;
    }
  }
  return 'DECLARED';
}
