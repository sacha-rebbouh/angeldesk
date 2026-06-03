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
  "rapport", "rapports", "via", "par", "et", "depuis", "selon", "agent", "agents",
]);

// Préfixe-label générique en tête ("Source:", "Agent:", "Analyse:") — redondant
// ou résidu après scrub d'un nom d'agent. Retiré pour ne pas laisser "agent:".
const LEADING_LABEL_PREFIX = /^\s*(?:agents?|sources?|analyses?|rapports?|donn[ée]es?)\s*:\s*/i;

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
  s = s.replace(LEADING_LABEL_PREFIX, "");
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
 * Variante stricte : renvoie la source nettoyée seulement si c'est une VRAIE
 * provenance (document), sinon `null`. Utilisée par les indicateurs de
 * provenance (SourcePin) pour NE PAS afficher de pastille quand la "source"
 * n'était qu'un nom d'agent / machinerie (rien d'utile à montrer).
 */
export function presentableSource(raw: string | null | undefined): string | null {
  const label = sanitizeSourceLabel(raw);
  return label === MISSING_SOURCE || label === INTERNAL_UNSOURCED ? null : label;
}

/**
 * Scrub les noms d'agents d'un TEXTE LIBRE (phrase de preuve/détail) SANS
 * tokeniser sur `·`/`&` (préserve la ponctuation interne d'une phrase) et SANS
 * fabriquer de fallback. Retire aussi un préfixe "agent:" en tête. Renvoie ""
 * si rien d'utile ne reste.
 */
export function scrubAgentNamesFromText(text: string | null | undefined): string {
  if (!text) return "";
  let s = text;
  for (const [re, repl] of MACHINERY_REWRITES) s = s.replace(re, repl);
  s = s.replace(LEADING_LABEL_PREFIX, "");
  s = s.replace(AGENT_SCRUB_REGEX, " ");
  s = s.replace(/\b(?:outputs?|output)\b/gi, " ");
  s = s.replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[\s:,;.\-–—]+/, "").trim();
  return s;
}

// ---------------------------------------------------------------------------
// Filet anti-prescriptif « décision » (doctrine — Angel Desk ne DÉCIDE JAMAIS)
// ---------------------------------------------------------------------------
// Un texte d'agent (hardcodé OU généré par LLM) ne doit JAMAIS présenter l'outil
// ou l'analyse comme le LIEU DE LA DÉCISION (« pas fiable pour prendre une
// décision », « baser une décision d'investissement », « capacité à prendre une
// décision éclairée »). On REFORMULE ces tournures en constats analytiques au
// rendu — défense en profondeur qui corrige AUSSI les analyses déjà persistées
// (rétroactif). Ne touche PAS « à vous de décider » / « la décision revient à
// l'investisseur » (qui RÉAFFIRMENT la doctrine), ni « décision d'investissement »
// employé pour désigner la décision de l'INVESTISSEUR.
const PRESCRIPTIVE_DECISION_REWRITES: Array<[RegExp, string]> = [
  // « (la) capacité à prendre une décision (éclairée) (sur ce deal) » → fiabilité des signaux
  [/(?:la\s+)?capacit[ée]\s+[àa]\s+prendre\s+(?:une|la|cette)\s+d[ée]cision(?:\s+[ée]clair[ée]e)?(?:\s+sur\s+ce\s+deal)?/gi, "la fiabilité des signaux"],
  // « ... pour prendre/baser une décision (d'investissement|éclairée) (sur ce deal) » → finalité décisionnelle retirée
  [/\s+pour\s+(?:prendre|baser)\s+(?:une|la|cette)\s+d[ée]cision(?:\s+d['’]investissement|\s+[ée]clair[ée]e)?(?:\s+sur\s+ce\s+deal)?/gi, ""],
  // « prendre une décision (d'investissement|éclairée) (sur ce deal) » résiduel → exploiter les signaux
  [/prendre\s+(?:une|la|cette)\s+d[ée]cision(?:\s+d['’]investissement|\s+[ée]clair[ée]e)?(?:\s+sur\s+ce\s+deal)?/gi, "exploiter les signaux"],
  // « fiable pour (la) décision » → fiable
  [/fiable\s+pour\s+(?:la\s+)?d[ée]cision\b/gi, "fiable"],
];

// La décision appartenant à l'INVESTISSEUR EST la doctrine (« à vous de décider »).
// Un segment qui attribue la décision à l'investisseur ne doit JAMAIS être reformulé
// (sinon « l'investisseur conserve la capacité à prendre une décision » serait mutilé).
const INVESTOR_DECISION_SUBJECT = /investisseur|business\s+angel|\bBA\b|d[ée]cideur|[àa]\s+vous|vous\s+(?:de\s+|d['’])?d[ée]cid/i;

/**
 * Reformule les tournures prescriptives « décision » d'un texte d'agent rendu
 * (doctrine — l'OUTIL/l'ANALYSE ne décide jamais). Traité par SEGMENT : un segment
 * qui attribue la décision à l'INVESTISSEUR est conforme → laissé intact (Codex P1).
 * On ne reformule que là où le sujet est l'outil / l'analyse / les données.
 */
export function scrubPrescriptiveDecisionLanguage(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return text
    .split(/(?<=[.;])\s+/)
    .map((segment) => {
      if (INVESTOR_DECISION_SUBJECT.test(segment)) return segment;
      let s = segment;
      for (const [re, repl] of PRESCRIPTIVE_DECISION_REWRITES) s = s.replace(re, repl);
      return s;
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
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

/**
 * Corrige l'artefact LLM « La société {Nom}. {minuscule}… » (faux point de phrase
 * après le nom de société, suivi d'une continuation en minuscule). Display-only,
 * TRÈS ciblé : ne fire que sur « société {Capitale}… . {minuscule} » — n'altère
 * jamais un vrai point de fin de phrase (continuation en majuscule = non touchée).
 * Le fix de fond reste au thesis-extractor (génération) ; ceci corrige l'affichage.
 */
export function fixFalseSentencePeriod(text: string | null | undefined): string {
  if (!text) return text ?? "";
  // Le nom est borné à 1-3 tokens capitalisés ACCOLÉS au point (Codex P1) → ne
  // fusionne jamais une vraie phrase (« société X opère en France. elle… » : après
  // « X » vient un mot minuscule, donc pas de match).
  return text.replace(
    /(\bsoci[ée]t[ée]\s+[A-ZÀ-Ý][\p{L}\d&'’-]*(?:\s+[A-ZÀ-Ý0-9][\p{L}\d&'’-]*){0,2})\.\s+(?=\p{Ll})/u,
    "$1 ",
  );
}

// ---------------------------------------------------------------------------
// Couverture légale / registre officiel — reframe doctrine (#6, Phase 8a)
// ---------------------------------------------------------------------------
// Un red flag dont la CAUSE est « notre outil n'a pas pu interroger le registre
// officiel » (Pappers/K-bis indisponible) N'EST PAS un risque société critique :
// c'est une LIMITE DE COUVERTURE. On le reclasse en « couverture légale à
// vérifier » plutôt que de le présenter comme un risque avéré.
//
// Détection par SIGNATURE EXPLICITE (résolution Codex), JAMAIS une heuristique
// floue. Il faut À LA FOIS :
//  (1) un token de CONNECTEUR/REGISTRE = l'OUTIL interrogé (Pappers, registre
//      officiel/du commerce, greffe, Societe.com, Companies House…). PAS un simple
//      DOCUMENT : « K-bis » est EXCLU des sources, car « K-bis indisponible / non
//      fourni / non vérifié » désigne un document manquant côté fondateur = vrai
//      item de diligence, pas une limite de l'outil.
//  (2) un token explicite d'ÉCHEC OUTIL : le connecteur n'a pu être interrogé
//      (indisponible / impossible de vérifier|interroger|consulter / pas pu …).
// La conjonction « le CONNECTEUR/REGISTRE est indisponible » isole l'échec outil
// sans jamais déclasser un vrai risque (litige, requalification, procédure
// collective au greffe, doc manquant). Volontairement EXCLUS (resserrements
// Codex) : « non vérifié(s) », « absence de vérification », « n'a pas pu » non
// contraint — états ambigus (côté fondateur possible). En cas de doute → on ne
// reclasse pas.
const LEGAL_REGISTRY_CONNECTOR =
  /(pappers|registre\s+(?:officiel|du\s+commerce|national|des\s+soci[ée]t[ée]s)|greffe|infogreffe|companies\s+house|soci[ée]t[ée]\.com)/i;
const REGISTRY_UNAVAILABLE =
  /(indisponible|non\s+disponible|impossible\s+(?:de\s+)?(?:v[ée]rifi|interrog|consult)|pas\s+pu\s+(?:[êe]tre\s+)?(?:v[ée]rifi|interrog|consult))/i;

/**
 * Vrai SI le texte porte la signature explicite « registre officiel indisponible »
 * (token source registre ET token indisponibilité, les deux requis). Sert à
 * reclasser un faux risque critique en « couverture légale à vérifier ».
 */
export function isLegalRegistryUnavailableSignal(text: string | null | undefined): boolean {
  if (!text) return false;
  return LEGAL_REGISTRY_CONNECTOR.test(text) && REGISTRY_UNAVAILABLE.test(text);
}

/** Libellés honnêtes de la notice « couverture légale à vérifier » (#6). */
export const LEGAL_COVERAGE_GAP_TITLE = "Couverture légale à vérifier";
export const LEGAL_COVERAGE_GAP_DETAIL =
  "Le registre officiel des sociétés n'a pas pu être interrogé automatiquement pour ce dossier : la vérification du K-bis et des dirigeants reste à effectuer. Ceci reflète une limite de couverture de l'outil, pas un risque avéré sur la société.";
