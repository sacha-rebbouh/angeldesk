/**
 * Tier 1 Agents - Investigation
 *
 * 12 agents actifs analysent un deal sous tous les angles.
 * Chaque agent reçoit le contexte enrichi par le Context Engine.
 */

// Agents critiques (dependances sur document-extractor)
export { financialAuditor } from "./financial-auditor";
export { deckForensics } from "./deck-forensics";
export { capTableAuditor } from "./cap-table-auditor";
export { techStackDD } from "./tech-stack-dd"; // Tech Stack + Scalabilité + Dette Technique
export { techOpsDD } from "./tech-ops-dd"; // Maturité Produit + Équipe Tech + Sécurité + IP

// Agents independants (pas de dependance sur document-extractor)
export { teamInvestigator } from "./team-investigator";
export { competitiveIntel } from "./competitive-intel";
export { marketIntelligence } from "./market-intelligence";
export { legalRegulatory } from "./legal-regulatory";
export { gtmAnalyst } from "./gtm-analyst";
export { customerIntel } from "./customer-intel";

// Agent de synthese (peut utiliser les resultats des autres)
export { questionMaster } from "./question-master";
