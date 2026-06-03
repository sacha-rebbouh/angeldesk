/**
 * Helpers de présentation user-facing pour analysis-v2.
 *
 * Doctrine : la vue ne doit JAMAIS exposer la machinerie (noms techniques
 * d'agents, jargon runtime, enums bruts). Ces helpers nettoient les chaînes
 * issues des sorties d'agents AVANT rendu. Fonctions PURES, testées isolément.
 *
 * Règle anti-faux-vernis : une source qui n'était QUE de la machinerie ne doit
 * pas être remplacée par un libellé rassurant fabriqué — on renvoie une mention
 * honnête de provenance manquante.
 */

import { AGENT_DEFINITIONS } from "./solidity-aggregator";

// Noms techniques d'agents bannis en surface. Tier 1 vient de AGENT_DEFINITIONS
// (source unique) ; on ajoute Tier 0 / Tier 3 ; les experts Tier 2 sont captés
// par le pattern `*-expert`.
const TIER0_TIER3_AGENT_KEYS = [
  // Tier 0
  "document-extractor",
  "fact-extractor",
  "red-flag-detector",
  "deal-scorer",
  "deck-coherence-checker",
  "thesis-extractor",
  // Tier 3
  "synthesis-deal-scorer",
  "contradiction-detector",
  "conditions-analyst",
  "devils-advocate",
  "memo-generator",
  "thesis-reconciler",
] as const;

export const AGENT_TECHNICAL_NAMES: ReadonlySet<string> = new Set<string>([
  ...AGENT_DEFINITIONS.map((d) => d.key),
  ...TIER0_TIER3_AGENT_KEYS,
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Scrub GLOBAL : retire toute occurrence d'un nom d'agent (segment complet OU
// embarqué dans une phrase, ex. "Analyse issue de market-intelligence") + tout
// `*-expert`. C'est le filet qui empêche une source phrase-like de fuiter.
const AGENT_SCRUB_REGEX = new RegExp(
  `\\b(?:${[...AGENT_TECHNICAL_NAMES].map(escapeRegex).join("|")}|[a-z0-9]+-expert)\\b`,
  "gi",
);

// Mots génériques/connecteurs : si le résidu n'est QUE ça, ce n'est pas une vraie
// provenance → fallback honnête (évite "Source", "Analyse issue de", etc.).
const GENERIC_ONLY = new Set([
  "source", "sources", "analyse", "analyses", "issue", "issu", "issus", "issue de",
  "de", "du", "des", "le", "la", "les", "données", "donnee", "donnees",
  "rapport", "rapports", "via", "par", "et", "depuis", "selon",
]);

// Réécritures de jargon runtime interne vers des libellés user-facing neutres.
// (Context Engine / Fact Store / Evidence Engine = machinerie sous le capot.)
const MACHINERY_REWRITES: Array<[RegExp, string]> = [
  [/rapport\s+context\s+engine/gi, "Recherche externe"],
  [/context\s+engine/gi, "Recherche externe"],
  [/\bfact\s+store\b/gi, "Base de faits interne"],
  [/evidence\s+engine/gi, "Couche evidence-first"],
];

const MISSING_SOURCE = "Provenance documentaire non disponible";
const INTERNAL_UNSOURCED = "Synthèse interne non sourcée";

function isGenericOnly(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC_ONLY.has(w));
}

/**
 * Nettoie une chaîne de "source" : réécrit le jargon machinerie, SCRUB tous les
 * noms d'agents (même embarqués dans une phrase), retire les résidus "outputs".
 * Conserve les vrais noms de documents (Pitch Deck, BP Excel, Mail du JJ/MM,
 * Data Room). Fallback honnête si la source était vide / uniquement machinerie
 * ou connecteurs génériques.
 */
export function sanitizeSourceLabel(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return MISSING_SOURCE;
  let s = raw.trim();
  for (const [re, repl] of MACHINERY_REWRITES) s = s.replace(re, repl);
  s = s.replace(AGENT_SCRUB_REGEX, " ");
  s = s.replace(/\b(?:outputs?|output)\b/gi, " ");

  // Séparateurs de provenance « · » et « & » uniquement — surtout PAS « / »
  // (les dates "24/02/2026" et chemins l'utilisent).
  const kept = s
    .split(/\s*[·&]\s*/)
    .map((t) => t.replace(/\s{2,}/g, " ").replace(/^[\s:,;.&·-]+|[\s:,;.&·-]+$/g, "").trim())
    .filter((t) => t.length > 0 && /[\p{L}\d]/u.test(t) && !isGenericOnly(t));

  const out = kept.join(" · ").replace(/\s{2,}/g, " ").trim();
  return out.length > 0 && !isGenericOnly(out) ? out : INTERNAL_UNSOURCED;
}

/**
 * Retire les noms d'agents techniques inline d'un texte libre (ex. une
 * `location` de contradiction "competitive-intel & market-intelligence
 * outputs"). Renvoie le fallback non-sourcé si tout est retiré.
 */
export function humanizeInlineAgentNames(text: string | null | undefined): string {
  if (!text || !text.trim()) return MISSING_SOURCE;
  return sanitizeSourceLabel(text);
}

/**
 * Majuscule du PREMIER caractère significatif uniquement (display-only).
 * Ne touche PAS aux autres phrases (évite de casser "vs.", acronymes, URLs,
 * emails). Pour #10 (textes thèse stockés en minuscule).
 */
export function capitalizeFirstMeaningfulChar(text: string | null | undefined): string {
  if (!text) return text ?? "";
  const idx = text.search(/\p{L}/u);
  if (idx === -1) return text;
  return text.slice(0, idx) + text.charAt(idx).toUpperCase() + text.slice(idx + 1);
}
