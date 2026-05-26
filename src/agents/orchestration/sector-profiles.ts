/**
 * Sector profiles — source de vérité pour la sector-awareness des agents Couche 1.
 *
 * Problème adressé : les agents `team-investigator`, `tech-stack-dd`,
 * `tech-ops-dd` appliquent par défaut des heuristiques startup-tech
 * (CTO obligatoire, dette technique, scalabilité cloud) à TOUS les
 * dossiers, ce qui produit des faux positifs sur les boîtes non-tech
 * (food, consumer, bio, hardware) — cas Avekapeti = food, flag erroné
 * "single tech profile" sur une équipe qui n'avait pas besoin de plus
 * de tech.
 *
 * Solution : chaque dossier obtient un `SectorProfile` qui définit ce
 * qui est PERTINENT et ce qui ne l'est PAS pour ce type de boîte. Le
 * profil est injecté dans les prompts Couche 1, et les agents tech
 * peuvent retourner "non applicable" pour les secteurs sans stack tech
 * significatif.
 *
 * Doctrine § *Discipline anti-faux-positifs* — un signal d'alerte doit
 * être pertinent au type de business. Le critère "manque d'équipe tech"
 * sur une boîte food n'est pas pertinent et ne doit pas être flagué.
 */

export type SectorFamily =
  | "pure-tech"
  | "platform-tech"
  | "hardware-tech"
  | "bio"
  | "consumer"
  | "climate"
  | "unknown";

export interface SectorProfile {
  family: SectorFamily;
  displayName: string;
  /** Profils d'équipe attendus pour ce type de boîte. */
  teamProfile: {
    coreProfiles: string[];
    techWeight: "high" | "medium" | "low" | "none";
    description: string;
  };
  /** Pertinence des due diligences techniques (tech-stack-dd, tech-ops-dd). */
  techDDApplicability: {
    applicable: boolean;
    rationale: string;
  };
  /** Dimensions de scalabilité pertinentes pour ce secteur. */
  scalingDimensions: string[];
  /** Critères qui ne sont PAS pertinents pour ce secteur (ne pas pénaliser). */
  notApplicableCriteria: string[];
  /**
   * Mots-clés atomiques pour le filtre déterministe de red flags. Séparé
   * de `notApplicableCriteria` (qui est descriptif et destiné au prompt)
   * pour éviter les faux matches : "Logo churn / Logo retention" est lisible
   * pour le LLM mais ne matche pas une red flag "Churn elevated" si on ne
   * tokenise pas. Hand-maintenu par famille pour rester sous contrôle.
   */
  filterKeywords?: string[];
  /**
   * Calibrations par domaine d'agent. Optionnel — si absent, l'agent
   * tombe sur ses défauts (qui supposent un modèle tech/SaaS). Les
   * familles non-tech (consumer, bio, hardware, climate) doivent
   * absolument renseigner les calibrations pertinentes pour éviter
   * les faux positifs (NRR/churn sur consumer, TAM/SAM/SOM cloud sur
   * food, rounds venture sur biotech, etc.).
   */
  domainCalibration?: {
    /** Métriques customer pertinentes vs non-pertinentes pour ce secteur. */
    customerMetrics?: {
      relevant: string[];
      notApplicable: string[];
      rationale: string;
    };
    /** Lecture du marché pour ce secteur (vs défaut TAM/SAM/SOM SaaS). */
    marketLens?: {
      description: string;
      relevantSizing: string[];
      notApplicableSizing: string[];
    };
    /** Lecture de la concurrence pour ce secteur (vs défaut moat tech). */
    competitiveLens?: {
      description: string;
      relevantMoats: string[];
      notApplicableMoats: string[];
    };
    /** Forme attendue de cap table pour ce secteur (vs défaut venture). */
    capTableContext?: {
      description: string;
      typicalRoundShape: string;
      notApplicablePatterns: string[];
    };
  };
}

/**
 * Mapping de la chaîne de secteur (souvent renvoyée par l'extractor en
 * mots libres) vers une famille canonique. La résolution se fait par
 * inclusion partielle (case-insensitive) pour absorber des libellés
 * comme "SaaS B2B", "Food & Beverage", etc.
 */
const SECTOR_KEYWORDS: { keywords: string[]; family: SectorFamily }[] = [
  // Pure tech — software-first où l'ingénierie est le cœur du produit.
  { keywords: ["saas", "b2b software", "b2c software", "software"], family: "pure-tech" },
  { keywords: ["fintech", "insurtech", "regtech"], family: "pure-tech" },
  { keywords: ["ai", "artificial intelligence", "machine learning", "llm"], family: "pure-tech" },
  { keywords: ["deeptech", "deep tech"], family: "pure-tech" },
  { keywords: ["blockchain", "web3", "crypto"], family: "pure-tech" },
  { keywords: ["cybersecurity", "cyber security", "infosec"], family: "pure-tech" },
  { keywords: ["edtech"], family: "pure-tech" },
  { keywords: ["legaltech"], family: "pure-tech" },
  { keywords: ["hrtech", "hr tech"], family: "pure-tech" },
  { keywords: ["gaming", "videogame", "esport"], family: "pure-tech" },
  // Platform-tech — tech significative + opérations.
  { keywords: ["marketplace"], family: "platform-tech" },
  { keywords: ["creator", "creator economy"], family: "platform-tech" },
  { keywords: ["proptech", "real estate tech"], family: "platform-tech" },
  { keywords: ["mobility", "mobilite", "transport tech"], family: "platform-tech" },
  // Hardware — produit physique avec composante ingénierie matérielle.
  { keywords: ["hardware", "robotic", "iot device"], family: "hardware-tech" },
  { keywords: ["spacetech", "space tech", "aerospace"], family: "hardware-tech" },
  // Bio — sciences du vivant, scientifique + réglementaire au cœur.
  { keywords: ["biotech", "pharma", "drug"], family: "bio" },
  { keywords: ["healthtech", "medtech", "medical device"], family: "bio" },
  // Consumer — marque + supply chain + distribution.
  { keywords: ["foodtech", "food tech", "food & beverage", "food", "alimentaire", "agroalimentaire"], family: "consumer" },
  { keywords: ["consumer", "d2c", "dtc", "cpg", "fmcg", "retail", "fashion", "beauty", "cosmetic"], family: "consumer" },
  // Climate — technologies de rupture pour la transition, mix R&D + industrialisation.
  { keywords: ["climate", "cleantech", "clean tech", "energy", "carbon", "decarbonization"], family: "climate" },
];

const PROFILES: Record<SectorFamily, SectorProfile> = {
  "pure-tech": {
    family: "pure-tech",
    displayName: "Tech pure (SaaS, Fintech, AI…)",
    teamProfile: {
      coreProfiles: ["Tech lead / CTO", "Product manager", "Engineering team", "Sales / GTM"],
      techWeight: "high",
      description:
        "L'ingénierie logicielle est le cœur du produit. Une équipe sans capacité tech significative (CTO ou équivalent + au moins quelques ingénieurs) est un vrai signal d'alerte.",
    },
    techDDApplicability: {
      applicable: true,
      rationale: "La stack technique est le produit. Auditer la stack, la dette technique, la scalabilité et la sécurité est central.",
    },
    scalingDimensions: [
      "Infra logicielle",
      "Performance produit",
      "Vitesse d'itération",
      "Sécurité applicative",
      "Onboarding utilisateurs",
    ],
    notApplicableCriteria: [],
  },
  "platform-tech": {
    family: "platform-tech",
    displayName: "Plateforme tech (Marketplace, Mobility, Proptech…)",
    teamProfile: {
      coreProfiles: [
        "Tech lead / CTO",
        "Product manager",
        "Engineering team",
        "Operations / supply",
        "GTM / acquisition",
      ],
      techWeight: "high",
      description:
        "Tech significative requise + opérations pour gérer les deux côtés du marché ou la logistique. Manque de profil tech = signal d'alerte ; manque de profil ops est aussi un signal.",
    },
    techDDApplicability: {
      applicable: true,
      rationale: "La plateforme combine logiciel et opérations marketplace : la stack doit être auditée.",
    },
    scalingDimensions: [
      "Infra logicielle",
      "Liquidité du marché",
      "Trust & safety",
      "Opérations supply",
      "Acquisition deux faces",
    ],
    notApplicableCriteria: [],
  },
  "hardware-tech": {
    family: "hardware-tech",
    displayName: "Hardware / Deeptech physique / Spacetech",
    teamProfile: {
      coreProfiles: [
        "CTO matériel / lead hardware engineer",
        "R&D produit",
        "Industrialisation / supply chain",
        "Certification & qualité",
        "Commercial B2B",
      ],
      techWeight: "high",
      description:
        "Mix ingénierie hardware + supply chain + R&D. Un seul profil tech logiciel n'est pas un drapeau rouge si l'ingénierie matérielle est couverte. Manque d'industrialisation est plus grave que manque d'ingénieurs logiciel.",
    },
    techDDApplicability: {
      applicable: true,
      rationale:
        "Stack matériel/logiciel à auditer, plus la maturité industrielle (BOM, supply, certifications). Étendre la DD au-delà du logiciel.",
    },
    scalingDimensions: [
      "Industrialisation",
      "Supply chain",
      "BOM costs",
      "Certifications produit",
      "R&D et propriété intellectuelle",
    ],
    notApplicableCriteria: [
      "Dette technique web/mobile (sauf si plateforme companion logicielle)",
    ],
    filterKeywords: [
      // Métriques SaaS pures (hardware = unit sales, pas ARR/NRR)
      "nrr", "arr", "mrr", "churn", "ltv-cac saas", "mau", "dau",
      "subscription revenue", "recurring revenue", "no subscription",
      // Moats logiciels purs (le moat hardware tient à IP, supply, certif)
      "network effects logiciels", "data moat logiciel", "switching costs saas",
      // Team tech logicielle (variantes "logiciel" pour les cas explicites
      // + atomiques "no cto" / "single tech profile" pour les variantes
      // SaaS-coded — symétrie avec bio/consumer/climate. Si un vrai signal
      // hardware "absence de CTO matériel" doit être levé, le LLM doit le
      // qualifier explicitement, sinon il sera filtré comme SaaS-coded).
      "no cto logiciel", "manque cto logiciel", "pas de cto logiciel",
      "no cto", "pas de cto", "manque de cto",
      "single tech profile", "tech team thin", "équipe tech faible",
      "stack frontend", "stack backend", "dette technique web",
      "architecture cloud",
    ],
    domainCalibration: {
      customerMetrics: {
        relevant: [
          "Unit sales (volume + ASP)",
          "Repeat order B2B / pipeline de commandes",
          "Délai d'intégration client",
          "Taux de défaillance produit (RMA)",
        ],
        notApplicable: [
          "NRR / Net Revenue Retention (sense SaaS)",
          "Churn mensuel logiciel",
          "LTV/CAC en mode SaaS",
          "MAU/DAU",
          "ARR / MRR",
        ],
        rationale:
          "Le business est un produit physique vendu à des clients B2B (parfois B2C). Les métriques d'engagement et de rétention SaaS ne s'appliquent pas.",
      },
      marketLens: {
        description:
          "Le marché se lit par TAM unitaire (volumes × ASP), cycles d'achat enterprise, et fenêtre technologique. Pas en mode SaaS/cloud.",
        relevantSizing: [
          "TAM unitaire (volumes × prix moyen)",
          "Cycles de remplacement / refresh enterprise",
          "Capacité d'achat des segments cibles",
        ],
        notApplicableSizing: [
          "TAM SaaS basé sur nombre de comptes × ARPU",
          "TAM cloud basé sur seats × prix annuel",
        ],
      },
      competitiveLens: {
        description:
          "Concurrents = autres OEMs, fabricants substituables, ou statu quo (solution alternative). La défense tient à l'IP technique (brevets, procédés), la supply chain et les certifications.",
        relevantMoats: [
          "Brevets et propriété intellectuelle technique",
          "Maturité industrielle / time-to-market",
          "Accords supply chain exclusifs",
          "Certifications (CE, FDA pour medical hardware, etc.)",
          "Avantage coût BOM",
        ],
        notApplicableMoats: [
          "Network effects logiciels",
          "Switching costs SaaS (intégrations API)",
          "Data moat (sauf si plateforme companion)",
        ],
      },
      capTableContext: {
        description:
          "Hardware = besoins capex importants. Cap tables souvent mixtes : venture equity + grants (BPI, EIC, NASA) + parfois dette ou revenue-based financing.",
        typicalRoundShape:
          "Pré-seed/seed venture, puis Series A souvent plus importante (>5M€) pour financer industrialisation. Grants et concours en parallèle.",
        notApplicablePatterns: [
          "Cadence Seed → A → B → C → IPO en 7 ans (cycles plus longs en hardware)",
          "Absence de grants comme red flag (les grants sont la norme en hardware)",
        ],
      },
    },
  },
  bio: {
    family: "bio",
    displayName: "Biotech / Healthtech / Medtech",
    teamProfile: {
      coreProfiles: [
        "CSO / lead scientifique",
        "Affaires réglementaires (FDA/EMA/CE)",
        "Lead clinique",
        "Commercial pharma / hôpitaux",
        "CFO solide pour gérer les cycles longs",
      ],
      techWeight: "low",
      description:
        "Profils attendus : scientifique + réglementaire + clinique, pas ingénierie logicielle. L'absence de CTO logiciel n'est PAS un signal d'alerte. L'absence d'expertise réglementaire ou clinique l'est.",
    },
    techDDApplicability: {
      applicable: false,
      rationale:
        "Sauf composante SaMD (logiciel comme dispositif médical) ou plateforme digitale santé. La DD porte sur la propriété intellectuelle, le pipeline R&D, les essais cliniques, les approbations réglementaires, et la production GMP.",
    },
    scalingDimensions: [
      "Pipeline R&D",
      "Essais cliniques",
      "Propriété intellectuelle",
      "Approbations réglementaires (FDA/EMA/CE)",
      "Production GMP",
      "Remboursement / accès au marché",
    ],
    notApplicableCriteria: [
      "Dette technique logicielle",
      "Stack web/mobile (sauf si SaMD)",
      "Architecture cloud / scalabilité applicative",
      "Vitesse d'itération produit logiciel",
    ],
    filterKeywords: [
      // Métriques SaaS — bio n'a pas de revenus récurrents SaaS
      "nrr", "arr", "mrr", "churn", "ltv", "cac", "mau", "dau", "arpu",
      "subscription revenue", "recurring revenue",
      // Stack / dette tech logicielle
      "dette technique", "stack frontend", "stack backend", "stack web", "stack mobile",
      "architecture cloud", "ratio engineers",
      // Team tech logicielle (bio attend CSO/réglementaire, pas CTO logiciel)
      "no cto", "pas de cto", "manque de cto", "absence de cto",
      "single tech profile", "tech team thin", "équipe tech faible",
      // Moats logiciels
      "network effects logiciels", "data moat logiciel", "switching costs saas",
      // Cap-table venture-tech
      "absence de big pharma",
    ],
    domainCalibration: {
      customerMetrics: {
        relevant: [
          "Pipeline R&D (nombre de molécules / dispositifs en phase)",
          "Essais cliniques (phase, taille, endpoints)",
          "Approbations réglementaires (FDA/EMA/CE) obtenues ou en cours",
          "Partenariats pharma / licensing deals",
          "Réseau prescripteur / hôpitaux cibles",
        ],
        notApplicable: [
          "NRR / churn SaaS",
          "LTV/CAC en mode SaaS",
          "ARR / MRR",
          "MAU/DAU",
          "Conversion funnel produit logiciel",
        ],
        rationale:
          "Le business est scientifique-réglementaire. Les métriques de rétention SaaS ne s'appliquent pas. Mesurer le pipeline et les jalons cliniques.",
      },
      marketLens: {
        description:
          "Le marché se lit par populations patient cibles × prévalence × prescribing patterns. Pas en TAM SaaS.",
        relevantSizing: [
          "Patients atteints / prévalence indication",
          "Marché thérapeutique (sales actuelles concurrents)",
          "Pricing observed (cost per patient/year)",
          "Reimbursement landscape (remboursement payeur public/privé)",
        ],
        notApplicableSizing: [
          "TAM SaaS basé sur comptes × ARPU",
          "Software TAM cloud",
        ],
      },
      competitiveLens: {
        description:
          "Concurrents = pipeline competitors sur même indication, generics post-LOE, traitements de référence (standard of care). La défense tient au pipeline IP + brevets + données cliniques.",
        relevantMoats: [
          "Brevets composé + méthode + indication",
          "Données cliniques exclusives / accès patient orphan",
          "Approbations réglementaires acquises",
          "Production GMP scalable",
          "Partenariats licensing avec big pharma",
        ],
        notApplicableMoats: [
          "Network effects logiciels",
          "Data moat logiciel (sauf SaMD)",
          "Switching costs SaaS",
        ],
      },
      capTableContext: {
        description:
          "Bio = rounds milestone-based, souvent plus larges et plus longs que tech. Co-investissement avec fonds bio spécialisés + parfois big pharma corporate VC + grants R&D.",
        typicalRoundShape:
          "Pre-seed/seed → Series A milestone-based (souvent IND filing) → Series B milestone-based (phase II readout) → Series C ou IPO ou licensing deal.",
        notApplicablePatterns: [
          "Cadence Seed → A → B venture tech (cycles plus longs en bio, 10-15 ans avant exit ou approbation)",
          "Absence de big pharma corporate VC comme red flag (parfois normal au seed)",
          "Faibles montants levés comme red flag (parfois milestone non encore atteint)",
        ],
      },
    },
  },
  consumer: {
    family: "consumer",
    displayName: "Consumer / D2C / Food / Retail",
    teamProfile: {
      coreProfiles: [
        "Fondateur(s) marque / produit",
        "Supply chain & industrialisation",
        "Sales & distribution / référencement retail",
        "Marketing & growth (acquisition, brand)",
        "Expert produit (food scientist pour food, designer pour beauty, etc.)",
      ],
      techWeight: "low",
      description:
        "L'équipe attendue est marque-produit + supply + commercial. Un seul profil tech (ou aucun) n'est PAS un signal d'alerte si la chaîne d'approvisionnement et la distribution sont couvertes. L'absence d'expertise produit (food scientist pour food, etc.) en est un.",
    },
    techDDApplicability: {
      applicable: false,
      rationale:
        "La tech est souvent un canal e-commerce ou un site vitrine, pas le cœur du produit. La DD porte sur la marque, la supply chain, le référencement retail, les certifications produit, la conformité sanitaire ou réglementaire.",
    },
    scalingDimensions: [
      "Supply chain & industrialisation",
      "Distribution / référencement retail",
      "Brand equity & loyalty",
      "Marges unitaires & coût d'acquisition client",
      "Certifications sanitaires / réglementaires",
      "Capacité production",
    ],
    notApplicableCriteria: [
      "Dette technique",
      "Architecture scalable cloud (sauf plateforme tech significative)",
      "Vitesse d'itération produit logiciel",
      "Ratio engineers / total",
      "Stack frontend / backend moderne",
    ],
    filterKeywords: [
      // Métriques SaaS non-applicables au consumer
      "nrr", "arr", "mrr", "churn", "ltv", "cac", "mau", "dau", "arpu",
      "logo retention", "logo churn",
      "subscription revenue", "recurring revenue", "no subscription",
      // Tech-stack non pertinent pour consumer
      "dette technique", "stack frontend", "stack backend", "architecture cloud",
      "ratio engineers", "vitesse d'itération",
      // Moats logiciels
      "network effects logiciels", "data moat logiciel", "switching costs saas",
      // Cap-table venture-tech non systémique en consumer
      "absence de series", "esop", "vesting agressif",
      // Market lens cloud
      "tam saas", "tam cloud", "adressable software market",
      // Tech team
      "single tech profile", "no cto", "pas de cto", "manque de cto",
      "tech team thin", "équipe tech faible",
    ],
    domainCalibration: {
      customerMetrics: {
        relevant: [
          "Repeat purchase rate (fréquence de réachat)",
          "Distribution numérique (DN) et distribution pondérée (DP)",
          "Retail sell-through (rotation par référence)",
          "Brand awareness (top-of-mind, prompted)",
          "Marge unitaire brute",
          "Coût d'acquisition client par canal",
          "Repeat order volume B2B (si distribution wholesale)",
        ],
        notApplicable: [
          "NRR / Net Revenue Retention (sense SaaS)",
          "Logo churn / Logo retention",
          "LTV/CAC en mode SaaS (les unit economics consumer se calculent autrement)",
          "ARR / MRR",
          "MAU/DAU",
          "Conversion funnel produit logiciel",
          "Onboarding completion rate logiciel",
        ],
        rationale:
          "Le business est marque + produit physique vendu via retail et/ou e-commerce. Les métriques SaaS ne s'appliquent pas. L'unit economics se calcule en marge unitaire, rotation et fréquence de réachat.",
      },
      marketLens: {
        description:
          "Le marché se lit par parts de marché en valeur et en volume, distribution retail, pénétration consommateur, fréquence d'achat. Pas en TAM/SAM/SOM SaaS.",
        relevantSizing: [
          "Taille catégorie en valeur (€) et volume (unités)",
          "Parts de marché des leaders + marques distributeur (MDD)",
          "Pénétration retail (DN/DP) atteignable",
          "Fréquence d'achat × consommateurs cibles",
          "Cycles de mise en linéaire et concours catégorie",
        ],
        notApplicableSizing: [
          "TAM SaaS basé sur comptes × ARPU",
          "TAM cloud / seats",
          "Adressable software market",
        ],
      },
      competitiveLens: {
        description:
          "Concurrents = autres marques du linéaire + marques distributeur (MDD/private label). La défense tient à la marque, au sourcing, à la distribution rights, parfois aux brevets de procédé.",
        relevantMoats: [
          "Brand equity (notoriété + préférence)",
          "Distribution rights / référencement exclusif",
          "Accords sourcing / approvisionnement matières premières",
          "Brevets de procédé ou recette propriétaire",
          "Certifications produit (bio, AOP, label rouge, etc.)",
          "Avantage coût unitaire / supply chain",
        ],
        notApplicableMoats: [
          "Network effects logiciels",
          "Data moat",
          "Switching costs SaaS (intégrations, lock-in technique)",
          "Time-to-market produit logiciel",
        ],
      },
      capTableContext: {
        description:
          "Consumer = cap tables souvent moins formelles que tech. Mix family/friends + business angels + parfois revenue-based financing + un seul tour institutionnel avant rachat stratégique.",
        typicalRoundShape:
          "Family/friends → BA + petite seed → un tour de Series A modeste (1-5M€) — parfois pas de Series B avant rachat par groupe FMCG. Revenue-based financing présent.",
        notApplicablePatterns: [
          "Absence de Seed → A → B → C → IPO comme red flag (rare en consumer hors hyper-growth D2C)",
          "Faible levée totale comme red flag (consumer = unit economics, pas brûler du cash)",
          "Pas d'ESOP / vesting agressif fondateurs comme red flag (moins systémique qu'en tech)",
        ],
      },
    },
  },
  climate: {
    family: "climate",
    displayName: "Climate / Cleantech / Energy",
    teamProfile: {
      coreProfiles: [
        "R&D technique (hardware ou bio selon technologie)",
        "Industrialisation",
        "Affaires publiques / subventions",
        "Commercial B2B / B2G",
        "Expertise réglementaire environnementale",
      ],
      techWeight: "medium",
      description:
        "Mix scientifique + industrialisation + affaires publiques. L'absence de CTO logiciel n'est pas un drapeau rouge si le profil R&D et industrialisation est couvert. Sauf composante SaaS climat (mesure, reporting).",
    },
    techDDApplicability: {
      applicable: false,
      rationale:
        "Sauf composante SaaS climat (mesure carbone, reporting ESG, plateforme énergie). Sinon DD porte sur la technologie de rupture, l'industrialisation, le cycle subventions, les certifications environnementales.",
    },
    scalingDimensions: [
      "Industrialisation & coût unitaire",
      "Subventions / mécanismes de soutien",
      "Certifications environnementales",
      "Cycles de vente B2B/B2G longs",
      "R&D & propriété intellectuelle",
    ],
    notApplicableCriteria: [
      "Dette technique logicielle (sauf SaaS climat)",
      "Architecture cloud (sauf SaaS climat)",
    ],
    filterKeywords: [
      // Métriques SaaS (sauf SaaS climat — filtre conservatif)
      "nrr", "arr", "mrr", "churn", "ltv-cac saas", "mau", "dau",
      "subscription revenue", "recurring revenue",
      // Tech-stack logiciel pur
      "dette technique logicielle", "dette technique", "stack frontend", "stack backend",
      "architecture cloud",
      // Team tech logicielle (climate techWeight=medium hors SaaS climat
      // attend R&D + industrialisation, pas CTO logiciel — symétrie avec
      // bio/consumer/hardware)
      "no cto logiciel", "manque cto logiciel", "pas de cto logiciel",
      "no cto", "pas de cto", "manque de cto",
      "single tech profile", "tech team thin", "équipe tech faible",
      // Moats logiciels
      "network effects logiciels", "data moat logiciel", "switching costs saas",
      // Cap-table : les grants sont la norme
      "absence de grants", "absence de subventions",
    ],
    domainCalibration: {
      customerMetrics: {
        relevant: [
          "Volume de tonnes CO₂ évitées / capturées",
          "Mégawatts installés ou abated",
          "Coût par tonne de carbone évitée",
          "Contrats B2B / B2G signés (volume + durée)",
          "Pipeline de projets engagés",
        ],
        notApplicable: [
          "NRR / churn SaaS",
          "LTV/CAC SaaS",
          "ARR / MRR",
          "MAU/DAU",
        ],
        rationale:
          "Climate = volume d'impact (tonnes CO₂, MWh) + cycles B2B/B2G longs. Les métriques SaaS ne s'appliquent pas sauf pour les SaaS climat (mesure/reporting).",
      },
      marketLens: {
        description:
          "Le marché se lit par mécanismes de soutien (taxes carbone, certificats, quotas), obligations réglementaires, et cibles de décarbonation publiques/privées.",
        relevantSizing: [
          "Marché carbone (prix tonne CO₂ × volumes)",
          "Budget transition de la cible (entreprise / collectivité / État)",
          "Cibles de décarbonation publiques (Paris, Fit for 55, etc.)",
          "Subventions disponibles (UE, État, régions)",
        ],
        notApplicableSizing: [
          "TAM SaaS basé sur comptes × ARPU",
        ],
      },
      competitiveLens: {
        description:
          "Concurrents = autres technos de décarbonation + statu quo carbone-intensif. La défense tient à la technologie de rupture + propriété intellectuelle + maturité industrielle + capacités de financement.",
        relevantMoats: [
          "IP technologique (brevets, savoir-faire)",
          "Avantage coût par tonne CO₂ évitée",
          "Maturité industrielle (TRL, capacité production)",
          "Certifications environnementales reconnues",
          "Partenariats stratégiques avec corporates / utilities",
        ],
        notApplicableMoats: [
          "Network effects logiciels (sauf SaaS climat)",
          "Data moat (sauf SaaS climat)",
          "Switching costs SaaS",
        ],
      },
      capTableContext: {
        description:
          "Climate = mix venture impact + grants (UE, BPI, EIC) + parfois dette projet + corporate VC d'utilities. Cycles longs.",
        typicalRoundShape:
          "Pre-seed/seed → Series A milestone industriel → Series B + project finance → parfois IPO ou acquisition par utility.",
        notApplicablePatterns: [
          "Cadence Seed → A → B → C tech rapide (cycles plus longs)",
          "Absence de grants comme red flag (les grants sont la norme en cleantech)",
        ],
      },
    },
  },
  unknown: {
    family: "unknown",
    displayName: "Secteur non identifié",
    teamProfile: {
      coreProfiles: [
        "Fondateur(s) avec expertise sectorielle",
        "Équipe commerciale",
        "Équipe produit / opérations",
      ],
      techWeight: "medium",
      description:
        "Secteur non identifié. Ne pas présumer tech ou non-tech. Calibrer les attentes équipe sur les indices documentaires (déclarations fondateurs, profil de l'équipe).",
    },
    techDDApplicability: {
      applicable: true,
      rationale:
        "À défaut d'information sectorielle, appliquer une DD standard mais préciser les limitations dans la sortie.",
    },
    scalingDimensions: ["Croissance commerciale", "Opérations", "Capacité produit"],
    notApplicableCriteria: [],
  },
};

/**
 * Résout un secteur (chaîne libre) vers un profil canonique. Fait du
 * matching par mots-clés case-insensitive avec word boundaries pour
 * éviter les faux matches type "agroalimentaire" → "ai". Retourne le
 * profil `unknown` si aucun match.
 *
 * Une "word boundary" ici = la chaîne n'est PAS entourée de lettres
 * alphabétiques. Permet de matcher "B2B SaaS" → "saas" mais PAS
 * "agroalimentaire" → "ai".
 */
function isWordMatch(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, "i").test(haystack);
}

export function getSectorProfile(sector: string | null | undefined): SectorProfile {
  if (!sector) return PROFILES.unknown;
  const normalized = sector.toLowerCase().trim();
  for (const { keywords, family } of SECTOR_KEYWORDS) {
    for (const keyword of keywords) {
      if (isWordMatch(normalized, keyword)) {
        return PROFILES[family];
      }
    }
  }
  return PROFILES.unknown;
}

/**
 * Formate un profil sectoriel pour injection dans un prompt d'agent.
 * Le bloc est calibré pour expliciter au LLM ce qui compte et ce qui
 * ne compte pas pour ce type de boîte.
 */
export function formatSectorProfileForPrompt(profile: SectorProfile): string {
  const lines: string[] = [];
  lines.push(`## PROFIL SECTORIEL — ${profile.displayName}`);
  lines.push(`Famille : \`${profile.family}\``);
  lines.push("");
  lines.push("### Équipe attendue pour ce type de boîte");
  lines.push(`- Profils typiques : ${profile.teamProfile.coreProfiles.join(", ")}`);
  lines.push(`- Poids du tech : **${profile.teamProfile.techWeight}**`);
  lines.push(`- ${profile.teamProfile.description}`);
  lines.push("");
  lines.push("### Dimensions de scalabilité pertinentes pour ce secteur");
  for (const dim of profile.scalingDimensions) {
    lines.push(`- ${dim}`);
  }
  if (profile.notApplicableCriteria.length > 0) {
    lines.push("");
    lines.push("### Critères NON pertinents pour ce secteur (NE PAS pénaliser le deal sur ces axes)");
    for (const c of profile.notApplicableCriteria) {
      lines.push(`- ${c}`);
    }
  }
  lines.push("");
  lines.push("### Applicabilité due diligence technique (stack, dette, scalabilité logicielle)");
  lines.push(`- Applicable : **${profile.techDDApplicability.applicable ? "OUI" : "NON"}**`);
  lines.push(`- ${profile.techDDApplicability.rationale}`);
  return lines.join("\n");
}

/** Helper rapide : la due diligence technique est-elle pertinente pour ce secteur ? */
export function isTechDDApplicable(sector: string | null | undefined): boolean {
  return getSectorProfile(sector).techDDApplicability.applicable;
}

// ============================================================================
// POST-PROCESSEUR DÉTERMINISTE — FILTRE DE RED FLAGS PAR SECTEUR
// ============================================================================
//
// Filet de sécurité contre les LLM qui désobéissent à l'instruction
// "ne PAS produire un red flag X". La prompt-injection seule ne donne
// PAS de garantie d'obéissance ; un post-processor déterministe filtre
// les red flags dont le titre matche un critère non-applicable au
// secteur (selon `notApplicableCriteria` + `domainCalibration.*`).
//
// Conception :
// - Matching sur `title` (court, direct) en lowercase substring,
//   pas sur `description` ni `evidence` (qui peuvent mentionner une
//   métrique en passant sans en faire le cœur du red flag).
// - Tokenisation des critères : split sur `/`, `(`, parens, virgules.
// - Filtrage non destructif : retourne `{ kept, filtered }` pour
//   préserver une trace d'audit (logs / debug).

/**
 * Forme minimale d'un red flag — compatible avec `AgentRedFlag` de tous
 * les Tier 1 agents. Garde uniquement les champs nécessaires au matching.
 */
interface RedFlagLike {
  title: string;
  description?: string;
  category?: string;
  severity?: string;
}

/**
 * Construit la liste de mots-clés non-applicables pour ce profil
 * sectoriel. Source primaire : `profile.filterKeywords` (hand-maintenu,
 * atomique). Si absent, fallback : tokenisation de `notApplicableCriteria`
 * + sous-blocs `domainCalibration.*.notApplicable*`. La source primaire
 * est plus fiable car elle évite les compound tokens trop spécifiques
 * ("logo churn") qui ne matchent pas les variations naturelles ("churn
 * elevated").
 */
export function buildNotApplicableKeywords(profile: SectorProfile): string[] {
  let raw: string[];
  if (profile.filterKeywords && profile.filterKeywords.length > 0) {
    raw = profile.filterKeywords.map((k) => k.toLowerCase().trim()).filter((k) => k.length >= 3);
  } else {
    // Fallback : tokenisation des critères descriptifs.
    const sources: string[] = [
      ...profile.notApplicableCriteria,
      ...(profile.domainCalibration?.customerMetrics?.notApplicable ?? []),
      ...(profile.domainCalibration?.marketLens?.notApplicableSizing ?? []),
      ...(profile.domainCalibration?.competitiveLens?.notApplicableMoats ?? []),
      ...(profile.domainCalibration?.capTableContext?.notApplicablePatterns ?? []),
    ];
    const tokens = new Set<string>();
    for (const source of sources) {
      for (const chunk of source.split(/[/(),]/)) {
        const trimmed = chunk.trim().toLowerCase();
        if (trimmed.length >= 3) tokens.add(trimmed);
      }
    }
    raw = Array.from(tokens);
  }
  // Tri par longueur décroissante : prioriser les compound spécifiques
  // ("tam saas") sur les atomes courts ("arpu"). Évite que "arpu" matche
  // avant "tam saas" sur un titre contenant les deux.
  const dedup = Array.from(new Set(raw));
  dedup.sort((a, b) => b.length - a.length);
  return dedup;
}

/**
 * Vrai si le titre du red flag matche au moins un mot-clé non-applicable
 * avec word boundaries (pour éviter "rapport" → matche "arr"). Matching
 * case-insensitive.
 */
function titleMatchesForbiddenKeyword(
  flag: RedFlagLike,
  forbiddenKeywords: string[],
): string | null {
  const haystack = `${flag.title} ${flag.category ?? ""}`;
  for (const kw of forbiddenKeywords) {
    if (isWordMatch(haystack, kw)) return kw;
  }
  return null;
}

export interface SectorFilterTrace {
  flagTitle: string;
  matchedKeyword: string;
  sectorFamily: SectorFamily;
}

export interface SectorFilterResult<T extends RedFlagLike> {
  kept: T[];
  filtered: T[];
  trace: SectorFilterTrace[];
}

/**
 * Filtre déterministe : drop les red flags dont le titre matche un
 * critère non-applicable au secteur. Retourne `kept` + `filtered` +
 * `trace` pour préserver une trace d'audit.
 *
 * Comportement :
 * - Famille `pure-tech` / `platform-tech` : aucun filtrage (tous les
 *   critères SaaS sont pertinents par défaut).
 * - Famille `unknown` : aucun filtrage (on ne sait pas si applicable).
 * - Autres familles : agrège les mots-clés non-applicables et filtre
 *   les flags dont le titre les contient.
 *
 * Le filtre est conservatif : il préfère laisser passer un flag douteux
 * plutôt que masquer un signal légitime. Match uniquement sur title +
 * category, pas sur description/evidence (qui peuvent mentionner une
 * métrique en passant).
 */
export function filterRedFlagsBySector<T extends RedFlagLike>(
  flags: T[],
  profile: SectorProfile,
): SectorFilterResult<T> {
  // Pas de filtrage pour les secteurs tech ou inconnus.
  if (profile.family === "pure-tech" || profile.family === "platform-tech" || profile.family === "unknown") {
    return { kept: [...flags], filtered: [], trace: [] };
  }

  const forbidden = buildNotApplicableKeywords(profile);
  if (forbidden.length === 0) {
    return { kept: [...flags], filtered: [], trace: [] };
  }

  const kept: T[] = [];
  const filtered: T[] = [];
  const trace: SectorFilterTrace[] = [];

  for (const flag of flags) {
    const match = titleMatchesForbiddenKeyword(flag, forbidden);
    if (match) {
      filtered.push(flag);
      trace.push({
        flagTitle: flag.title,
        matchedKeyword: match,
        sectorFamily: profile.family,
      });
    } else {
      kept.push(flag);
    }
  }

  return { kept, filtered, trace };
}

/**
 * Sucre syntaxique : applique le filtre et logge la trace audit côté
 * console. Retourne uniquement les flags conservés. À appeler depuis
 * `execute()` de chaque agent sector-aware juste avant de retourner
 * le résultat normalisé.
 */
export function applySectorRedFlagFilter<T extends RedFlagLike>(
  flags: T[],
  sector: string | null | undefined,
  agentName: string,
): T[] {
  const profile = getSectorProfile(sector);
  const { kept, filtered, trace } = filterRedFlagsBySector(flags, profile);
  if (filtered.length > 0) {
    console.warn(
      `[sector-filter] ${agentName} on sector "${sector ?? "unknown"}" (${profile.family}): filtered ${filtered.length} red flag(s) non-applicables.`,
      trace.map((t) => `\"${t.flagTitle}\" matched \"${t.matchedKeyword}\"`).join(" | "),
    );
  }
  return kept;
}

/**
 * Formate la calibration customer-metrics pour `customer-intel`.
 * Retourne `null` si le profil n'a pas de calibration customer
 * (par défaut, l'agent garde son comportement SaaS-friendly).
 */
export function formatCustomerCalibrationForPrompt(profile: SectorProfile): string | null {
  const cm = profile.domainCalibration?.customerMetrics;
  if (!cm) return null;
  const lines: string[] = [];
  lines.push(`## CALIBRATION CUSTOMER METRICS — ${profile.displayName}`);
  lines.push("");
  lines.push(`${cm.rationale}`);
  lines.push("");
  lines.push("### Métriques pertinentes pour ce secteur (à mesurer si données disponibles)");
  for (const m of cm.relevant) lines.push(`- ${m}`);
  lines.push("");
  lines.push("### Métriques NON pertinentes pour ce secteur (ne pas calculer, ne pas pénaliser leur absence)");
  for (const m of cm.notApplicable) lines.push(`- ${m}`);
  lines.push("");
  lines.push("**Règle absolue** : ne JAMAIS produire un red flag pour absence ou faiblesse d'une métrique listée comme \"non pertinente\". Ne JAMAIS comparer ce dossier à un benchmark SaaS si le secteur n'est pas SaaS.");
  return lines.join("\n");
}

/** Formate la calibration market-lens pour `market-intelligence`. */
export function formatMarketCalibrationForPrompt(profile: SectorProfile): string | null {
  const ml = profile.domainCalibration?.marketLens;
  if (!ml) return null;
  const lines: string[] = [];
  lines.push(`## CALIBRATION ANALYSE MARCHÉ — ${profile.displayName}`);
  lines.push("");
  lines.push(`${ml.description}`);
  lines.push("");
  lines.push("### Dimensions de sizing pertinentes pour ce secteur");
  for (const s of ml.relevantSizing) lines.push(`- ${s}`);
  lines.push("");
  lines.push("### Dimensions de sizing NON pertinentes (ne pas utiliser, ne pas pénaliser leur absence)");
  for (const s of ml.notApplicableSizing) lines.push(`- ${s}`);
  lines.push("");
  lines.push("**Règle absolue** : ne JAMAIS forcer un cadrage TAM/SAM/SOM SaaS sur un dossier non-SaaS. Ne JAMAIS produire un red flag \"marché trop petit\" sur la base d'un TAM mal cadré.");
  return lines.join("\n");
}

/** Formate la calibration competitive-lens pour `competitive-intel`. */
export function formatCompetitiveCalibrationForPrompt(profile: SectorProfile): string | null {
  const cl = profile.domainCalibration?.competitiveLens;
  if (!cl) return null;
  const lines: string[] = [];
  lines.push(`## CALIBRATION ANALYSE CONCURRENTIELLE — ${profile.displayName}`);
  lines.push("");
  lines.push(`${cl.description}`);
  lines.push("");
  lines.push("### Moats / défenses pertinents pour ce secteur");
  for (const m of cl.relevantMoats) lines.push(`- ${m}`);
  lines.push("");
  lines.push("### Moats / défenses NON pertinents (ne pas pénaliser leur absence)");
  for (const m of cl.notApplicableMoats) lines.push(`- ${m}`);
  lines.push("");
  lines.push("**Règle absolue** : ne JAMAIS produire un red flag \"pas de moat technologique\" sur un dossier où le moat attendu n'est pas technique. Évaluer la défense sur les axes pertinents au secteur.");
  return lines.join("\n");
}

/** Formate la calibration cap-table pour `cap-table-auditor`. */
export function formatCapTableCalibrationForPrompt(profile: SectorProfile): string | null {
  const ct = profile.domainCalibration?.capTableContext;
  if (!ct) return null;
  const lines: string[] = [];
  lines.push(`## CALIBRATION CAP TABLE — ${profile.displayName}`);
  lines.push("");
  lines.push(`${ct.description}`);
  lines.push("");
  lines.push("### Forme de round typique pour ce secteur");
  lines.push(`- ${ct.typicalRoundShape}`);
  lines.push("");
  lines.push("### Patterns venture-tech NON applicables ici (ne pas exiger, ne pas pénaliser leur absence)");
  for (const p of ct.notApplicablePatterns) lines.push(`- ${p}`);
  lines.push("");
  lines.push("**Règle absolue** : ne JAMAIS produire un red flag basé sur la cadence venture-tech (Seed → A → B → C) sur un secteur où cette cadence n'est pas la norme. Ne JAMAIS pénaliser l'absence d'ESOP ou de vesting agressif fondateurs sur un secteur où ce n'est pas systémique.");
  return lines.join("\n");
}
