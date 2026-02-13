/**
 * STAGE CALIBRATION MATRICES
 *
 * Source de vérité pour les attentes calibrées par stage et par dimension.
 * Compilé à partir de 3 agents de recherche spécialisés:
 * - Pre-Seed & Seed Expert (Carta 2024, France Digitale, First Round, OpenView, Bessemer)
 * - Series A, B & Later Expert (PitchBook 2024, a16z, Index Ventures)
 * - Cross-Stage Validator (tables de transition graduelles, invariants)
 *
 * Chaque agent Tier 1 reçoit UNIQUEMENT la calibration pour SA dimension.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CalibrationSeverity = "NORMAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "N_A";

export interface CalibrationEntry {
  situation: string;
  severity: CalibrationSeverity;
  justification: string;
}

export type CalibrationDimension =
  | "financial"
  | "team"
  | "legal"
  | "product_tech"
  | "gtm_traction"
  | "competitive"
  | "exit"
  | "cap_table";

export type CalibrationStage =
  | "PRE_SEED"
  | "SEED"
  | "SERIES_A"
  | "SERIES_B"
  | "LATER";

// ─── Agent → Dimension Mapping ──────────────────────────────────────────────

const AGENT_DIMENSION_MAP: Record<string, CalibrationDimension[]> = {
  "financial-auditor": ["financial"],
  "team-investigator": ["team"],
  "legal-regulatory": ["legal"],
  "tech-stack-dd": ["product_tech"],
  "tech-ops-dd": ["product_tech"],
  "deck-forensics": ["financial", "product_tech"],
  "gtm-analyst": ["gtm_traction"],
  "customer-intel": ["gtm_traction"],
  "competitive-intel": ["competitive"],
  "exit-strategist": ["exit"],
  "cap-table-auditor": ["cap_table"],
  "market-intelligence": ["competitive", "gtm_traction"],
  "question-master": [],
  "conditions-analyst": ["cap_table", "financial"],
};

// ─── Calibration Data ───────────────────────────────────────────────────────

const CALIBRATION: Record<CalibrationStage, Record<CalibrationDimension, CalibrationEntry[]>> = {
  // ═══════════════════════════════════════════════════════════════════════
  // PRE-SEED
  // ═══════════════════════════════════════════════════════════════════════
  PRE_SEED: {
    financial: [
      { situation: "0 EUR de revenu (pre-revenue)", severity: "NORMAL", justification: "80%+ des pre-seeds sont pre-revenue. L'évaluation repose sur l'équipe et la vision." },
      { situation: "Aucune unit economics (pas de LTV/CAC)", severity: "NORMAL", justification: "Trop tôt pour avoir des unit economics fiables." },
      { situation: "Pas de modèle financier détaillé", severity: "NORMAL", justification: "Un back-of-the-envelope suffit en pre-seed." },
      { situation: "Burn rate 20-50K EUR/mois (équipe 2-4)", severity: "NORMAL", justification: "Burn typique pre-seed en France." },
      { situation: "Burn rate 50-100K EUR/mois sans revenu", severity: "MEDIUM", justification: "Élevé pour le stade. Justifié si deeptech/biotech." },
      { situation: "Burn rate >100K EUR/mois sans revenu", severity: "HIGH", justification: "Anormalement élevé. Risque d'épuisement rapide." },
      { situation: "Runway <6 mois post-levée", severity: "HIGH", justification: "Le tour doit financer 12-18 mois minimum." },
      { situation: "Runway 12-18 mois post-levée", severity: "NORMAL", justification: "Standard pre-seed (médiane 14 mois, Carta 2024)." },
      { situation: "Valorisation pre-money 1-3M EUR", severity: "NORMAL", justification: "Range standard pre-seed France 2024. Médiane ~2M." },
      { situation: "Valorisation pre-money 5-8M EUR", severity: "MEDIUM", justification: "Agressive pour du pre-seed FR sauf fondateurs serial." },
      { situation: "Valorisation pre-money >8M EUR", severity: "HIGH", justification: "Très agressive. Questionner fortement." },
      { situation: "Données financières incohérentes", severity: "HIGH", justification: "Signal de manque de rigueur ou malhonnêteté." },
      { situation: "Projections >x50 en 24 mois sans explication", severity: "HIGH", justification: "Déconnexion de la réalité." },
      { situation: "Churn sur <10 clients", severity: "N_A", justification: "Pas statistiquement significatif en pre-seed." },
    ],
    team: [
      { situation: "Fondateur solo", severity: "LOW", justification: "35% des pre-seeds sont solo (First Round 2024). Surveiller capacité à recruter." },
      { situation: "First-time founders", severity: "NORMAL", justification: "Majorité des pre-seeds. Évaluer les compétences transversales." },
      { situation: "Pas de CTO/technique (produit tech)", severity: "MEDIUM", justification: "Risque si produit tech, acceptable si CTO prévu." },
      { situation: "Équipe 1-3 personnes", severity: "NORMAL", justification: "Taille standard pre-seed." },
      { situation: "Pas de vesting en place", severity: "LOW", justification: "En France, le vesting n'est PAS systématique en pre-seed. Recommandation, pas red flag." },
      { situation: "Key person risk élevé", severity: "MEDIUM", justification: "Inhérent au pre-seed. Signaler et recommander mitigation." },
      { situation: "Fondateurs à temps partiel", severity: "LOW", justification: "Courant en pre-seed FR. Vérifier date de transition." },
      { situation: "Claims de CV faux ou exagérés", severity: "CRITICAL", justification: "Deal-breaker quel que soit le stage." },
      { situation: "Background fondateur non vérifiable", severity: "MEDIUM", justification: "Signal d'alerte. Demander des références." },
    ],
    legal: [
      { situation: "SAS comme structure juridique", severity: "NORMAL", justification: "Standard 90%+ des startups tech en France." },
      { situation: "Pas de pacte d'actionnaires", severity: "LOW", justification: "Courant en pre-seed FR. Le pacte vient avec le premier investisseur." },
      { situation: "Pas de vesting fondateur formalisé", severity: "NORMAL", justification: "Le vesting formel n'est pas standard en pre-seed FR." },
      { situation: "IP non transférée à la société", severity: "MEDIUM", justification: "Courant mais risqué. Recommander transfert avant close." },
      { situation: "IP développée pendant emploi précédent", severity: "HIGH", justification: "Risque légal réel. Vérifier clauses d'IP assignment." },
      { situation: "Pas de RGPD en place", severity: "LOW", justification: "Normal si pas encore de données utilisateurs significatives." },
      { situation: "Auto-entrepreneur / micro-entreprise", severity: "MEDIUM", justification: "Structure inadaptée pour une levée." },
    ],
    product_tech: [
      { situation: "Pas de produit (concept/maquettes)", severity: "NORMAL", justification: "Définition même du pre-seed." },
      { situation: "Prototype / POC fonctionnel", severity: "NORMAL", justification: "Signal positif. Bonus au scoring." },
      { situation: "No-code / low-code pour le MVP", severity: "NORMAL", justification: "Stratégie valide pour valider le marché." },
      { situation: "Pas de tests automatisés", severity: "NORMAL", justification: "Normal en pre-seed." },
      { situation: "Architecture monolithique", severity: "NORMAL", justification: "Parfaitement adapté. Les microservices seraient de l'over-engineering." },
      { situation: "Code spaghetti / dette technique", severity: "LOW", justification: "Normal pour un prototype rapide." },
      { situation: "Pas de scalabilité pensée", severity: "NORMAL", justification: "Prématuré. 'Do things that don't scale' (Paul Graham)." },
      { situation: "Pas d'équipe technique (fondateurs non-tech)", severity: "MEDIUM", justification: "Risque si produit tech. Le pre-seed doit financer le recrutement." },
    ],
    gtm_traction: [
      { situation: "0 client (pré-lancement)", severity: "NORMAL", justification: "Standard pre-seed." },
      { situation: "1-5 clients beta/pilotes (gratuits)", severity: "NORMAL", justification: "Excellent signal de validation précoce." },
      { situation: "Pas de canal d'acquisition identifié", severity: "NORMAL", justification: "Trop tôt pour une stratégie structurée." },
      { situation: "Aucun signal de PMF", severity: "NORMAL", justification: "Par définition, le pre-seed est pré-PMF." },
      { situation: "Growth rate non mesurable", severity: "NORMAL", justification: "Standard pre-seed." },
      { situation: "Aucune validation marché (pas d'interviews)", severity: "MEDIUM", justification: "Même en pre-seed, un minimum de customer discovery est attendu." },
    ],
    competitive: [
      { situation: "0 concurrent identifié par le fondateur", severity: "LOW", justification: "Rare qu'il n'y ait aucun concurrent. Vérifier avec la DB." },
      { situation: "1-3 concurrents directs identifiés", severity: "NORMAL", justification: "Signe de maturité. Un marché sans concurrent n'existe souvent pas." },
      { situation: "Fondateur affirme 'pas de concurrent' mais DB en trouve", severity: "MEDIUM", justification: "Signal de méconnaissance du marché." },
      { situation: "Pas de moat clair", severity: "NORMAL", justification: "Normal en pre-seed. Le moat se construit avec le temps." },
      { situation: "5+ concurrents bien financés", severity: "LOW", justification: "Marché encombré mais pas deal-breaker si niche différente." },
    ],
    exit: [
      { situation: "Aucun scénario de sortie défini", severity: "NORMAL", justification: "Normal en pre-seed. Focus sur la construction." },
      { situation: "Vision de sortie vague", severity: "NORMAL", justification: "Suffisant en pre-seed." },
      { situation: "Pas de comparables d'exit dans le secteur", severity: "LOW", justification: "Beaucoup de secteurs pre-seed n'ont pas d'historique." },
      { situation: "Fondateur ne veut pas vendre", severity: "LOW", justification: "Incompatible avec BA si pas de plan de liquidité." },
      { situation: "Time to exit estimé 5-7 ans", severity: "NORMAL", justification: "Range standard BA (France Angels)." },
    ],
    cap_table: [
      { situation: "Fondateurs détiennent 100% pre-round", severity: "NORMAL", justification: "Standard pre-seed." },
      { situation: "Fondateurs détiennent <70% pre-round", severity: "MEDIUM", justification: "Dilution précoce importante. Qui détient le reste ?" },
      { situation: "Fondateurs détiennent <50% pre-round", severity: "HIGH", justification: "Fondateurs ont déjà cédé le contrôle." },
      { situation: "Dilution du round 15-25%", severity: "NORMAL", justification: "Range standard pre-seed France (médiane 20-22%)." },
      { situation: "Dilution du round >35%", severity: "MEDIUM", justification: "Trop de dilution. Fondateurs auront du mal à garder assez." },
      { situation: "Pas d'ESOP", severity: "NORMAL", justification: "Normal en pre-seed FR. ESOP créé au Seed." },
      { situation: "BSA AIR", severity: "NORMAL", justification: "Instrument standard pre-seed France." },
      { situation: "Investisseur avec droits excessifs", severity: "MEDIUM", justification: "Droits doivent être proportionnés au ticket." },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SEED
  // ═══════════════════════════════════════════════════════════════════════
  SEED: {
    financial: [
      { situation: "0 EUR de revenu", severity: "MEDIUM", justification: "60-70% des Seed ont un début de revenu. Justification requise si pré-revenue." },
      { situation: "ARR 0-50K EUR", severity: "NORMAL", justification: "Traction précoce. Plupart des Seed FR dans ce range (OpenVC 2024)." },
      { situation: "ARR 50-200K EUR", severity: "NORMAL", justification: "Bonne traction. Range P50-P75 Carta 2024." },
      { situation: "Churn mensuel 3-5%", severity: "NORMAL", justification: "Norme Seed (médiane ~3.5% OpenView 2024). PMF en cours." },
      { situation: "Churn mensuel 5-8%", severity: "LOW", justification: "Au-dessus de la médiane mais acceptable en Seed." },
      { situation: "Churn mensuel 8-12%", severity: "MEDIUM", justification: "Élevé même pour du Seed. Questionner la rétention." },
      { situation: "Churn mensuel >12%", severity: "HIGH", justification: "Pas de PMF évident. Red flag structurel." },
      { situation: "LTV/CAC non calculé", severity: "LOW", justification: "Acceptable en early Seed." },
      { situation: "LTV/CAC 1.5-3x", severity: "NORMAL", justification: "Range acceptable Seed (médiane ~2.5x OpenVC)." },
      { situation: "Burn rate 30-80K EUR/mois", severity: "NORMAL", justification: "Range standard Seed France (5-10 personnes)." },
      { situation: "Burn rate >150K EUR/mois", severity: "MEDIUM", justification: "Très élevé. Exiger justification détaillée." },
      { situation: "Runway <6 mois post-levée", severity: "CRITICAL", justification: "Le Seed doit financer 18-24 mois." },
      { situation: "Runway 6-12 mois", severity: "HIGH", justification: "Insuffisant. Fondateur en fundraising perpétuel." },
      { situation: "Runway 12-18 mois", severity: "NORMAL", justification: "Acceptable (médiane Seed = 18 mois)." },
      { situation: "Valorisation 3-6M EUR pre-money", severity: "NORMAL", justification: "Standard Seed France 2024. Médiane ~4.5M." },
      { situation: "Valorisation 10-15M EUR", severity: "MEDIUM", justification: "Agressive pour la France. Exiger justification solide." },
      { situation: "Valorisation >15M EUR", severity: "HIGH", justification: "Très agressive pour un Seed FR." },
      { situation: "Inconsistance métriques deck vs modèle", severity: "HIGH", justification: "Les chiffres doivent être cohérents. Signal de négligence/manipulation." },
      { situation: "Données financières falsifiées", severity: "CRITICAL", justification: "Deal-breaker absolu." },
    ],
    team: [
      { situation: "Fondateur solo", severity: "MEDIUM", justification: "Plus préoccupant qu'en pre-seed. Questionner pourquoi." },
      { situation: "2 co-fondateurs complémentaires", severity: "NORMAL", justification: "Configuration standard et idéale." },
      { situation: "First-time founders", severity: "NORMAL", justification: "Toujours acceptable en Seed FR." },
      { situation: "Équipe 3-8 personnes", severity: "NORMAL", justification: "Taille attendue au Seed." },
      { situation: "Pas de CTO/technique (produit tech)", severity: "HIGH", justification: "Le produit doit être en construction. Pas de tech leader = risque majeur." },
      { situation: "Pas de vesting en place", severity: "MEDIUM", justification: "En Seed, le vesting devrait être en place. Best practice à exiger." },
      { situation: "Vesting standard 4 ans / 1 an cliff", severity: "NORMAL", justification: "Best practice. Alignement des intérêts." },
      { situation: "Fondateurs à temps partiel", severity: "MEDIUM", justification: "Au Seed, les fondateurs doivent être à 100%." },
      { situation: "Un fondateur a quitté entre pre-seed et seed", severity: "HIGH", justification: "Signal d'alerte fort. Exiger explications détaillées." },
      { situation: "Conflits fondateurs visibles", severity: "HIGH", justification: "1ère cause d'échec en early stage." },
      { situation: "Background fondateur faux", severity: "CRITICAL", justification: "Deal-breaker absolu." },
    ],
    legal: [
      { situation: "SAS avec statuts adaptés", severity: "NORMAL", justification: "Standard et attendu." },
      { situation: "Pacte d'actionnaires absent malgré investisseurs", severity: "MEDIUM", justification: "Devrait être en place au Seed." },
      { situation: "Clauses liquidation pref 1x non-participating", severity: "NORMAL", justification: "Standard France (France Digitale)." },
      { situation: "Liquidation pref >2x", severity: "HIGH", justification: "Très agressif. Problème pour tours suivants." },
      { situation: "Vesting fondateurs en place (BSPCE/BSA)", severity: "NORMAL", justification: "Attendu au Seed FR." },
      { situation: "Vesting fondateurs absent", severity: "MEDIUM", justification: "Recommander fortement comme condition du round." },
      { situation: "IP non assignée au Seed", severity: "HIGH", justification: "Au Seed, le produit est en développement actif. IP doit être dans la société." },
      { situation: "RGPD rien en place malgré données personnelles", severity: "MEDIUM", justification: "Risque légal réel post-2018." },
      { situation: "Contentieux en cours", severity: "HIGH", justification: "À évaluer au cas par cas." },
    ],
    product_tech: [
      { situation: "MVP fonctionnel en production", severity: "NORMAL", justification: "Attendu au Seed." },
      { situation: "Produit encore en beta fermée", severity: "LOW", justification: "Acceptable en early Seed." },
      { situation: "Pas de produit (concept seulement)", severity: "HIGH", justification: "Anormal pour un Seed sauf deeptech." },
      { situation: "No-code en production avec clients payants", severity: "MEDIUM", justification: "Plan de migration vers code custom doit exister." },
      { situation: "Tests automatisés basiques (<30% coverage)", severity: "NORMAL", justification: "Suffisant pour du Seed." },
      { situation: "Architecture monolithique", severity: "NORMAL", justification: "Parfaitement adapté au Seed." },
      { situation: "Dette technique modérée", severity: "NORMAL", justification: "Inhérent au développement rapide en startup." },
      { situation: "Dette technique majeure (archi à revoir)", severity: "MEDIUM", justification: "Peut impacter la capacité à scaler." },
      { situation: "Pas de CTO ou lead technique", severity: "HIGH", justification: "Au Seed, un leadership technique est nécessaire." },
      { situation: "Faille de sécurité connue non corrigée", severity: "HIGH", justification: "Red flag indépendamment du stage." },
    ],
    gtm_traction: [
      { situation: "0 client", severity: "MEDIUM", justification: "Inhabituel en Seed sauf deeptech. Justification requise." },
      { situation: "1-10 clients (mix gratuit/payant)", severity: "NORMAL", justification: "Range standard early Seed." },
      { situation: "10-50 clients", severity: "NORMAL", justification: "Bonne traction. PMF en construction." },
      { situation: "50-200 clients", severity: "NORMAL", justification: "Excellent. Strong PMF signal." },
      { situation: "Canal principal = outbound/réseau", severity: "NORMAL", justification: "Standard en Seed B2B." },
      { situation: "Signaux de PMF clairs (retention, NPS >40)", severity: "NORMAL", justification: "Ce que tout investisseur Seed recherche." },
      { situation: "Aucun signal de PMF au Seed", severity: "MEDIUM", justification: "Préoccupant si produit lancé depuis >6 mois." },
      { situation: "Top client >80% du revenu", severity: "MEDIUM", justification: "Dépendance forte. Questionner diversification." },
      { situation: "Growth rate MoM 5-10%", severity: "NORMAL", justification: "Bon pour du Seed." },
      { situation: "Décroissance des métriques clés", severity: "MEDIUM", justification: "Signal d'alerte. Le produit perd de la traction." },
    ],
    competitive: [
      { situation: "0 concurrent identifié par fondateur", severity: "MEDIUM", justification: "Au Seed, le fondateur doit connaître son marché." },
      { situation: "Fondateur affirme 'pas de concurrent' mais DB en trouve 3+", severity: "HIGH", justification: "Malhonnêteté ou ignorance grave. Cross-ref DB obligatoire." },
      { situation: "1-5 concurrents bien analysés", severity: "NORMAL", justification: "Maturité concurrentielle attendue." },
      { situation: "Marché très encombré (>10 concurrents)", severity: "MEDIUM", justification: "Execution risk élevé. Angle spécifique requis." },
      { situation: "Moat en construction", severity: "NORMAL", justification: "Signal positif. Stratégie doit être claire." },
      { situation: "Pas de moat identifiable", severity: "LOW", justification: "En Seed, le moat est souvent la vitesse d'exécution." },
      { situation: "Concurrent Big Tech lance produit similaire", severity: "MEDIUM", justification: "Signal sérieux mais Big Tech échoue souvent dans les niches." },
    ],
    exit: [
      { situation: "Pas de réflexion sur la sortie", severity: "LOW", justification: "Moins acceptable qu'en pre-seed. Fondateur doit avoir identifié des acquéreurs." },
      { situation: "Scénario de sortie articulé avec comparables", severity: "NORMAL", justification: "Attendu en Seed." },
      { situation: "Secteur avec 5+ exits >100M en 3 ans", severity: "NORMAL", justification: "Marché liquide. Très positif." },
      { situation: "Secteur avec 0 exit connu", severity: "MEDIUM", justification: "Risque de liquidité pour l'investisseur." },
      { situation: "Time to exit 4-6 ans", severity: "NORMAL", justification: "Range standard Seed (PitchBook 2024)." },
      { situation: "Time to exit >10 ans", severity: "MEDIUM", justification: "Très long. Impact significatif sur le TRI." },
      { situation: "Multiple de sortie attendu <5x", severity: "LOW", justification: "Faible retour. BA vise 10x+." },
    ],
    cap_table: [
      { situation: "Fondateurs détiennent 60-80% post-round", severity: "NORMAL", justification: "Range sain après pre-seed + seed." },
      { situation: "Fondateurs détiennent 40-50% post-round", severity: "MEDIUM", justification: "Dilution forte. Risque de démotivation." },
      { situation: "Fondateurs détiennent <40% post-round", severity: "HIGH", justification: "Cap table polluée. Fondateurs risquent de perdre motivation." },
      { situation: "Dilution Seed 15-25%", severity: "NORMAL", justification: "Standard France (médiane 18-20%, France Digitale)." },
      { situation: "Dilution Seed >30%", severity: "MEDIUM", justification: "Dilution excessive. Questionner les conditions." },
      { situation: "ESOP 10-15%", severity: "NORMAL", justification: "Standard Seed France." },
      { situation: "Pas d'ESOP en Seed", severity: "MEDIUM", justification: "Devrait être en place. Premiers employés doivent être incentivisés." },
      { situation: "Liquidation pref 1x non-participating", severity: "NORMAL", justification: "Standard France (France Digitale, AFIC)." },
      { situation: "Anti-dilution full ratchet", severity: "HIGH", justification: "Très agressif. Pénalise fortement les fondateurs en down round." },
      { situation: "Dead equity (anciens fondateurs avec equity)", severity: "MEDIUM", justification: "Dilution inutile. Vérifier mécanisme de récupération." },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SERIES A
  // ═══════════════════════════════════════════════════════════════════════
  SERIES_A: {
    financial: [
      { situation: "Pas de revenue", severity: "HIGH", justification: "Anormal en Series A sauf deeptech/biotech." },
      { situation: "ARR 500K-2M EUR", severity: "NORMAL", justification: "Range standard Series A France." },
      { situation: "ARR >2M EUR", severity: "NORMAL", justification: "Excellente traction." },
      { situation: "Churn mensuel <3%", severity: "NORMAL", justification: "PMF prouvé." },
      { situation: "Churn mensuel 3-5%", severity: "MEDIUM", justification: "Au-dessus de la norme Series A. PMF à renforcer." },
      { situation: "Churn mensuel >5%", severity: "HIGH", justification: "PMF non prouvé en Series A." },
      { situation: "NRR >110%", severity: "NORMAL", justification: "Bon expansion revenue." },
      { situation: "NRR <100%", severity: "HIGH", justification: "Doit être >100% en Series A." },
      { situation: "Burn multiple >5x", severity: "HIGH", justification: "Inefficience inacceptable en Series A." },
      { situation: "Runway <12 mois", severity: "HIGH", justification: "Series A doit financer >18 mois." },
      { situation: "Valorisation 8-15M pre-money", severity: "NORMAL", justification: "Range standard Series A France." },
      { situation: "Valorisation >30M pre-money", severity: "HIGH", justification: "Très agressive sauf croissance >100% YoY." },
      { situation: "Inconsistance métriques", severity: "CRITICAL", justification: "Inacceptable en Series A." },
    ],
    team: [
      { situation: "Fondateur solo", severity: "HIGH", justification: "Risque élevé de ne pas scaler. Management team requise." },
      { situation: "C-suite incomplète (pas de VP Sales/Product)", severity: "MEDIUM", justification: "Devrait être en recrutement actif." },
      { situation: "Pas de CTO", severity: "CRITICAL", justification: "Inacceptable pour un produit tech en Series A." },
      { situation: "Pas de vesting", severity: "CRITICAL", justification: "Inacceptable en Series A. Must-have absolu." },
      { situation: "Fondateurs à temps partiel", severity: "CRITICAL", justification: "Inacceptable en Series A." },
      { situation: "Turnover >30%/an", severity: "CRITICAL", justification: "Red flag management." },
      { situation: "10-25 employés", severity: "NORMAL", justification: "Taille attendue Series A." },
      { situation: "Board formalisé", severity: "NORMAL", justification: "Attendu en Series A." },
    ],
    legal: [
      { situation: "Pas de pacte d'actionnaires", severity: "CRITICAL", justification: "Inacceptable en Series A." },
      { situation: "IP non sécurisée", severity: "HIGH", justification: "IP doit être protégée en Series A." },
      { situation: "RGPD non assuré", severity: "HIGH", justification: "Obligation légale. Risque réel." },
      { situation: "Secteur réglementé sans licence", severity: "CRITICAL", justification: "Impossible d'opérer sans licence." },
      { situation: "Litige en cours", severity: "HIGH", justification: "Évaluer impact potentiel." },
      { situation: "Code/IP détenue par un tiers", severity: "CRITICAL", justification: "Deal-breaker absolu." },
    ],
    product_tech: [
      { situation: "Pas de MVP", severity: "CRITICAL", justification: "Inacceptable en Series A." },
      { situation: "Pas de PMF", severity: "CRITICAL", justification: "PMF doit être prouvé (NPS, retention, cohortes)." },
      { situation: "Architecture solide et scalable", severity: "NORMAL", justification: "Attendu en Series A." },
      { situation: "Dette technique significative", severity: "HIGH", justification: "Peut impacter le scaling." },
      { situation: "Pas de moat technologique", severity: "HIGH", justification: "Doit exister en Series A." },
      { situation: "Dépendance à une seule API tierce", severity: "HIGH", justification: "Risque critique avec la croissance." },
    ],
    gtm_traction: [
      { situation: "Pas de stratégie GTM", severity: "HIGH", justification: "GTM doit être prouvé en Series A." },
      { situation: "CAC non mesuré", severity: "HIGH", justification: "Métriques d'acquisition requises." },
      { situation: "Pipeline structuré", severity: "NORMAL", justification: "Attendu." },
      { situation: "Aucun signal de PMF", severity: "CRITICAL", justification: "PMF doit être démontré." },
      { situation: "Growth MoM >10%", severity: "NORMAL", justification: "Bonne croissance Series A." },
      { situation: "Top 10 clients >50% revenu", severity: "HIGH", justification: "Diversification requise en Series A." },
    ],
    competitive: [
      { situation: "'Pas de concurrent' (faux)", severity: "CRITICAL", justification: "Soit c'est faux, soit y'a pas de marché." },
      { situation: "Pas de différenciation claire", severity: "HIGH", justification: "Must-have en Series A." },
      { situation: "Concurrent levé >50M", severity: "HIGH", justification: "Hard to compete head-on." },
      { situation: "Moat fort et vérifiable", severity: "NORMAL", justification: "Excellent." },
      { situation: "Marché en contraction", severity: "CRITICAL", justification: "Signal très négatif." },
    ],
    exit: [
      { situation: "Pas de scénario d'exit", severity: "HIGH", justification: "Doit être articulé en Series A." },
      { situation: "Secteur sans exit récent", severity: "HIGH", justification: "Risque de liquidité élevé." },
      { situation: "Secteur illiquide (>10 ans)", severity: "HIGH", justification: "BA veut retour en 5-7 ans." },
      { situation: "Acquéreurs stratégiques identifiés", severity: "NORMAL", justification: "Bonne pratique." },
    ],
    cap_table: [
      { situation: "Fondateurs <50% ownership", severity: "CRITICAL", justification: "Fondateurs doivent garder le contrôle avant Series A." },
      { situation: "Pas d'ESOP", severity: "HIGH", justification: "Doit exister en Series A." },
      { situation: "Liquidation pref >1x", severity: "CRITICAL", justification: "Toxique pour un BA." },
      { situation: "Full ratchet anti-dilution", severity: "CRITICAL", justification: "Toxique à tout stage." },
      { situation: "Participating preferred", severity: "CRITICAL", justification: "Double-dip = toxique." },
      { situation: "ESOP 12-18%", severity: "NORMAL", justification: "Bien dimensionné pour Series A." },
      { situation: "Pro-rata supprimé", severity: "HIGH", justification: "BA dilué sans recours." },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SERIES B
  // ═══════════════════════════════════════════════════════════════════════
  SERIES_B: {
    financial: [
      { situation: "ARR 3-10M EUR, croissance >50% YoY", severity: "NORMAL", justification: "Standard Series B Europe." },
      { situation: "ARR <2M EUR", severity: "HIGH", justification: "Sous les milestones attendus." },
      { situation: "NRR >120%", severity: "NORMAL", justification: "Excellent expansion." },
      { situation: "NRR <100%", severity: "CRITICAL", justification: "Le modèle ne scale pas." },
      { situation: "Churn mensuel >3%", severity: "CRITICAL", justification: "Après 3+ ans, le churn doit être résolu." },
      { situation: "Burn multiple >3x", severity: "HIGH", justification: "Inefficience en Series B." },
      { situation: "Gross margin >70% (SaaS)", severity: "NORMAL", justification: "Standard SaaS mature." },
      { situation: "Pas de path to profitability", severity: "HIGH", justification: "Le modèle doit montrer un chemin vers la rentabilité." },
    ],
    team: [
      { situation: "25-80 employés, management structuré", severity: "NORMAL", justification: "Organisation attendue." },
      { situation: "CFO en place ou en recrutement", severity: "NORMAL", justification: "Attendu en Series B." },
      { situation: "Pas de CFO", severity: "MEDIUM", justification: "Devrait être priorité." },
      { situation: "Turnover élevé (>30%)", severity: "CRITICAL", justification: "Signal de management faible." },
      { situation: "Culture non documentée", severity: "MEDIUM", justification: "Fonctionnel mais ne scale pas." },
    ],
    legal: [
      { situation: "Compliance ESG basique en place", severity: "NORMAL", justification: "De plus en plus requis par les fonds européens." },
      { situation: "IP portfolio solide (brevets, marques)", severity: "NORMAL", justification: "L'IP est un actif valorisé pour l'exit." },
      { situation: "Litiges majeurs non-disclosed", severity: "CRITICAL", justification: "Fraude par omission. Deal-breaker." },
      { situation: "Structure juridique clean (holding, filiales)", severity: "NORMAL", justification: "Standard pour l'internationalisation." },
    ],
    product_tech: [
      { situation: "Plateforme scalable, CI/CD, monitoring", severity: "NORMAL", justification: "Standard Series B." },
      { situation: "Architecture legacy qui ne scale plus", severity: "HIGH", justification: "Tech cliff. La réécriture va ralentir la croissance." },
      { situation: "SOC2 Type II en place ou en cours", severity: "NORMAL", justification: "Requis pour les clients enterprise." },
      { situation: "Pas de certifications sécurité", severity: "MEDIUM", justification: "Peut limiter les deals enterprise." },
      { situation: "Équipe tech 15-40 personnes", severity: "NORMAL", justification: "Standard Series B." },
    ],
    gtm_traction: [
      { situation: "Machine de vente prévisible", severity: "NORMAL", justification: "Le pipeline doit être mesurable et prédictible." },
      { situation: "Revenue imprévisible", severity: "HIGH", justification: "Incompatible avec les attentes Series B." },
      { situation: "Multi-market (2+ pays)", severity: "NORMAL", justification: "Internationalisation attendue." },
      { situation: "Mono-market malgré le funding", severity: "MEDIUM", justification: "Questionner la capacité d'internationalisation." },
      { situation: "Top 10 clients >40% revenu", severity: "HIGH", justification: "Concentration risquée pour Series B." },
    ],
    competitive: [
      { situation: "Top 3 du marché", severity: "NORMAL", justification: "Position attendue en Series B." },
      { situation: "Position faible, pas de moat", severity: "HIGH", justification: "Après 3+ rounds, devrait être leader." },
      { situation: "Écosystème de partenaires solide", severity: "NORMAL", justification: "Switching costs + distribution." },
    ],
    exit: [
      { situation: "Préparation exit en cours (auditeur, CFO)", severity: "NORMAL", justification: "Préparation attendue." },
      { situation: "Aucune préparation de sortie", severity: "MEDIUM", justification: "Décalage entre fonds levés et trajectoire." },
      { situation: "Valorisation compatible marché public", severity: "NORMAL", justification: "Transition privé/public sans discount." },
    ],
    cap_table: [
      { situation: "Fondateurs 25-50%", severity: "NORMAL", justification: "Dilution naturelle mais fondateurs engagés." },
      { situation: "Fondateurs <20%", severity: "MEDIUM", justification: "Fondateur quasi-employé. Risque de départ." },
      { situation: "ESOP 10-15% rafraîchi", severity: "NORMAL", justification: "Suffisant pour les recrutements clés." },
      { situation: "ESOP <5%", severity: "HIGH", justification: "Impossible d'attirer des talents senior." },
      { situation: "Préférences liquidatives toxiques empilées", severity: "CRITICAL", justification: "Fondateurs et ESOP ne touchent rien sauf méga-exit." },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LATER (Series C+)
  // ═══════════════════════════════════════════════════════════════════════
  LATER: {
    financial: [
      { situation: "ARR >20M EUR, croissance >50% YoY", severity: "NORMAL", justification: "Business prouvé. Question = scale to IPO ou profitability." },
      { situation: "ARR <15M EUR", severity: "CRITICAL", justification: "Pas le profil d'une Series C. Milestones non atteints." },
      { situation: "NRR >130%", severity: "NORMAL", justification: "Best-in-class (Bessemer 'Amazing')." },
      { situation: "NRR <110%", severity: "CRITICAL", justification: "Modèle structurellement limité." },
      { situation: "Gross churn >2%/mois", severity: "CRITICAL", justification: "Problème structurel non résolu après 4-5+ ans." },
      { situation: "Burn multiple >2x", severity: "CRITICAL", justification: "Inefficience inacceptable à ce stade." },
      { situation: "Rule of 40 <25", severity: "CRITICAL", justification: "Ni croissance ni marge. Business limité." },
      { situation: "Valorisation >25x ARR", severity: "CRITICAL", justification: "Risque de down-round ou IPO below valuation." },
    ],
    team: [
      { situation: "100-500 employés, C-suite complète", severity: "NORMAL", justification: "Organisation mature." },
      { situation: "<50 employés ou organisation dysfonctionnelle", severity: "CRITICAL", justification: "Pas une organisation Series C+." },
      { situation: "Board mature avec indépendants", severity: "NORMAL", justification: "Gouvernance de qualité standard pré-IPO." },
      { situation: "Culture toxique (Glassdoor <3.0)", severity: "CRITICAL", justification: "Meilleurs talents fuient. Productivité chute." },
    ],
    legal: [
      { situation: "Compliance ESG/RSE solide", severity: "NORMAL", justification: "Obligatoire pour SFDR, CSRD 2024+." },
      { situation: "Aucune compliance ESG", severity: "CRITICAL", justification: "Bloquant pour les fonds Article 8/9." },
      { situation: "Data room permanent et à jour", severity: "NORMAL", justification: "Best practice pré-IPO." },
      { situation: "Litiges non-disclosed", severity: "CRITICAL", justification: "Fraude par omission. Engagement responsabilité dirigeants." },
    ],
    product_tech: [
      { situation: "Plateforme enterprise-grade (99.99%, SOC2, ISO 27001)", severity: "NORMAL", justification: "Standard Series C+ pour SaaS B2B." },
      { situation: "Plateforme instable, pas de certifications", severity: "CRITICAL", justification: "Inacceptable. Clients enterprise vont churner." },
      { situation: "Architecture microservices scalable", severity: "NORMAL", justification: "Maturité technique nécessaire pour 10-100x charge." },
      { situation: "Architecture legacy massive", severity: "CRITICAL", justification: "Tech cliff. Ralentit la croissance." },
      { situation: "Pas de stratégie AI/data", severity: "MEDIUM", justification: "Risque de disruption par concurrents AI-first." },
    ],
    gtm_traction: [
      { situation: "Machine de vente prévisible (forecast >80%)", severity: "NORMAL", justification: "Prédictibilité = LE critère Series C+." },
      { situation: "Revenue imprévisible", severity: "CRITICAL", justification: "Incompatible. Fonds growth ne touchent pas." },
      { situation: "Multi-market (3+ pays)", severity: "NORMAL", justification: "Internationalisation prouvée." },
      { situation: "Mono-market malgré rounds", severity: "CRITICAL", justification: "Signal de faiblesse produit/exécution." },
      { situation: "Customer concentration top 10 >40%", severity: "CRITICAL", justification: "Risk factor majeur dans un S-1." },
    ],
    competitive: [
      { situation: "Leader ou co-leader avec moat multi-couches", severity: "NORMAL", justification: "Attendu en Series C+. Category leader." },
      { situation: "Position faible, pas de moat", severity: "CRITICAL", justification: "Après 4-5+ ans et 30M+ levés. Constat d'échec." },
      { situation: "Avantage de données propriétaires (flywheel)", severity: "NORMAL", justification: "Moat le plus puissant. Self-reinforcing." },
      { situation: "Pas d'avantage data", severity: "CRITICAL", justification: "Compétition sur features = facilement copiable." },
    ],
    exit: [
      { situation: "IPO-ready (Big4 auditeur, CFO, IR)", severity: "NORMAL", justification: "Timing dépend du marché, pas de la maturité." },
      { situation: "Aucune préparation malgré 4+ rounds", severity: "CRITICAL", justification: "Décalage. Fonds existants en fin de cycle." },
      { situation: "Valorisation déconnectée des comparables publics", severity: "CRITICAL", justification: "IPO impossible sans down-round massif." },
      { situation: "Secondary market actif", severity: "NORMAL", justification: "Signe de liquidité et de demande." },
    ],
    cap_table: [
      { situation: "Fondateurs 20-40%", severity: "NORMAL", justification: "Dilution naturelle mais encore significativement investis." },
      { situation: "Fondateurs <10%", severity: "CRITICAL", justification: "Fondateur est un employé déguisé. Risque de départ." },
      { situation: "ESOP 10-15% rafraîchi régulièrement", severity: "NORMAL", justification: "Standard pré-IPO (Index Ventures)." },
      { situation: "ESOP <5% ou épuisé", severity: "CRITICAL", justification: "Impossible de retenir/recruter. Brain drain." },
      { situation: "Préférences toxiques empilées sur 4+ rounds", severity: "CRITICAL", justification: "Fondateurs et ESOP ne touchent rien." },
      { situation: "Gouvernance dysfonctionnelle", severity: "CRITICAL", justification: "Entreprise paralysée. Signal catastrophique." },
    ],
  },
};

// ─── Invariants (ALWAYS CRITICAL regardless of stage) ───────────────────────

const INVARIANTS: CalibrationEntry[] = [
  { situation: "Fondateur ment / CV falsifié", severity: "CRITICAL", justification: "Intégrité = fondation de la relation investisseur. Non-négociable." },
  { situation: "Code/IP détenue par un tiers", severity: "CRITICAL", justification: "Deal-breaker structurel à tout stage." },
  { situation: "Liquidation préférence >1x", severity: "CRITICAL", justification: "Toxique pour tout investisseur minoritaire (BA)." },
  { situation: "Participating preferred (double-dip)", severity: "CRITICAL", justification: "Toxique à tout stage." },
  { situation: "Full ratchet anti-dilution", severity: "CRITICAL", justification: "Toxique à tout stage." },
  { situation: "Tactiques de pression / FOMO artificielles", severity: "CRITICAL", justification: "Manipulation = red flag quel que soit le stage." },
  { situation: "Données volontairement falsifiées", severity: "CRITICAL", justification: "Fraude. Deal-breaker absolu." },
];

// ─── Scoring Scale ──────────────────────────────────────────────────────────

function getScoringScale(stage: string): string {
  return `### Échelle de scoring calibrée pour un ${stage.replace("_", " ")} :
- **80-100** : Exceptionnel pour un ${stage.replace("_", " ")}. Top 10% des deals de ce stage.
- **65-80** : Bon pour un ${stage.replace("_", " ")}. Au-dessus de la médiane.
- **50-65** : Normal pour un ${stage.replace("_", " ")}. Trous habituels, rien d'alarmant.
- **35-50** : En dessous pour un ${stage.replace("_", " ")}. Faiblesses notables même pour ce stage.
- **0-35** : Problèmes réels même pour un ${stage.replace("_", " ")}. Red flags vrais.

**RÈGLE CRITIQUE** : Un score de 50 signifie "deal moyen pour ce stage". La plupart des deals devraient scorer entre 40 et 70. Un score <20 ne doit être donné que si des problèmes GRAVES ET VÉRIFIÉS existent.`;
}

// ─── Format calibration entries as markdown table ───────────────────────────

function formatCalibrationTable(entries: CalibrationEntry[]): string {
  const lines: string[] = [
    "| Situation | Sévérité | Justification |",
    "|-----------|----------|---------------|",
  ];

  for (const entry of entries) {
    const severity = entry.severity === "N_A" ? "N/A" : entry.severity;
    lines.push(`| ${entry.situation} | **${severity}** | ${entry.justification} |`);
  }

  return lines.join("\n");
}

// ─── Dimension label mapping ────────────────────────────────────────────────

const DIMENSION_LABELS: Record<CalibrationDimension, string> = {
  financial: "Financier",
  team: "Équipe & Fondateurs",
  legal: "Juridique & Réglementaire",
  product_tech: "Produit & Technologie",
  gtm_traction: "Go-to-Market & Traction",
  competitive: "Concurrence & Positionnement",
  exit: "Potentiel de Sortie",
  cap_table: "Cap Table & Structure",
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Normalise un stage string vers un CalibrationStage.
 */
export function normalizeToCalibrationStage(stage: string | null | undefined): CalibrationStage {
  if (!stage) return "SEED";
  const upper = stage.toUpperCase().replace(/[^A-Z_]/g, "").replace(/\s+/g, "_");
  if (upper.includes("PRE")) return "PRE_SEED";
  if (upper.includes("SEED")) return "SEED";
  if (upper.includes("SERIES_A") || upper === "A") return "SERIES_A";
  if (upper.includes("SERIES_B") || upper === "B") return "SERIES_B";
  if (upper.includes("SERIES_C") || upper === "C" || upper.includes("LATER") || upper.includes("GROWTH")) return "LATER";
  return "SEED";
}

/**
 * Retourne le bloc de calibration stage à injecter dans le system prompt d'un agent.
 * Chaque agent reçoit UNIQUEMENT la calibration pour SA dimension.
 *
 * @param stage - Le stage du deal (PRE_SEED, SEED, SERIES_A, etc.)
 * @param agentName - Le nom de l'agent (financial-auditor, team-investigator, etc.)
 * @returns Le markdown à injecter dans le system prompt
 */
export function getStageCalibrationBlock(
  stage: string | null | undefined,
  agentName: string
): string {
  const normalizedStage = normalizeToCalibrationStage(stage);
  const dimensions = AGENT_DIMENSION_MAP[agentName];

  // question-master reçoit un résumé court, pas de matrice
  if (!dimensions || dimensions.length === 0) {
    return getQuestionMasterCalibration(normalizedStage);
  }

  const stageData = CALIBRATION[normalizedStage];
  if (!stageData) return "";

  const lines: string[] = [
    `## CALIBRATION STAGE : ${normalizedStage.replace("_", " ")}`,
    "",
    `Tu analyses un deal **${normalizedStage.replace("_", " ")}**. Tes attentes DOIVENT être calibrées pour ce stage.`,
    `**Ne compare JAMAIS à des standards Series B/C.** Compare aux pairs du même stage.`,
    "",
  ];

  for (const dim of dimensions) {
    const entries = stageData[dim];
    if (!entries || entries.length === 0) continue;

    lines.push(`### Référentiel ${DIMENSION_LABELS[dim]} pour un ${normalizedStage.replace("_", " ")}`);
    lines.push("");
    lines.push(formatCalibrationTable(entries));
    lines.push("");
  }

  // Add invariants
  lines.push("### Invariants (TOUJOURS CRITICAL quel que soit le stage)");
  lines.push("");
  lines.push(formatCalibrationTable(INVARIANTS));
  lines.push("");

  // Add scoring scale
  lines.push(getScoringScale(normalizedStage));

  return lines.join("\n");
}

/**
 * Retourne les entrées de calibration brutes pour un stage et une dimension.
 * Utile pour la validation post-extraction des red flags.
 */
export function getCalibrationEntries(
  stage: string | null | undefined,
  dimension: CalibrationDimension
): CalibrationEntry[] {
  const normalizedStage = normalizeToCalibrationStage(stage);
  return CALIBRATION[normalizedStage]?.[dimension] ?? [];
}

/**
 * Retourne les invariants CRITICAL.
 */
export function getInvariants(): CalibrationEntry[] {
  return INVARIANTS;
}

/**
 * Retourne la liste de toutes les dimensions d'un agent.
 */
export function getAgentDimensions(agentName: string): CalibrationDimension[] {
  return AGENT_DIMENSION_MAP[agentName] ?? [];
}

// ─── Private helpers ────────────────────────────────────────────────────────

function getQuestionMasterCalibration(stage: CalibrationStage): string {
  const stageLabel = stage.replace("_", " ");
  return `## CALIBRATION STAGE : ${stageLabel}

Tu génères des questions pour un deal **${stageLabel}**. Tes questions DOIVENT être calibrées.

### Règles de calibration :
- Ne pose PAS de questions sur des métriques qui n'existent pas encore à ce stage
- ${stage === "PRE_SEED" ? "En pre-seed, pas de questions sur le churn, NRR, unit economics, burn multiple" : ""}
- ${stage === "SEED" ? "En seed, les questions sur le churn et les unit economics sont pertinentes seulement si le produit est lancé" : ""}
- ${stage === "SERIES_A" ? "En Series A, les questions financières et de PMF sont prioritaires" : ""}
- Priorise les questions qui AJOUTENT DE LA VALEUR pour un BA, pas celles qui répètent des évidences
- Focus sur : ce qui est vérifiable, ce qui est actionnable, ce qui change la décision

${getScoringScale(stage)}`;
}
