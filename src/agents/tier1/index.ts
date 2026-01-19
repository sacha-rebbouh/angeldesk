/**
 * Tier 1 Agents - Investigation
 *
 * 12 agents qui s'executent en parallele pour analyser un deal sous tous les angles.
 * Chaque agent reçoit le contexte enrichi par le Context Engine.
 */

// Agents critiques (dependances sur document-extractor)
export { financialAuditor } from "./financial-auditor";
export { deckForensics } from "./deck-forensics";
export { capTableAuditor } from "./cap-table-auditor";
export { technicalDD } from "./technical-dd";

// Agents independants (pas de dependance sur document-extractor)
export { teamInvestigator } from "./team-investigator";
export { competitiveIntel } from "./competitive-intel";
export { marketIntelligence } from "./market-intelligence";
export { legalRegulatory } from "./legal-regulatory";
export { gtmAnalyst } from "./gtm-analyst";
export { customerIntel } from "./customer-intel";
export { exitStrategist } from "./exit-strategist";

// Agent de synthese (peut utiliser les resultats des autres)
export { questionMaster } from "./question-master";
