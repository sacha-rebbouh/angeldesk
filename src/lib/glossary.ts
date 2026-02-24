/**
 * Dictionnaire des termes financiers et techniques pour Business Angels.
 * Utilise par le composant GlossaryTerm pour afficher des tooltips.
 */
export const GLOSSARY: Record<string, { short: string; full: string }> = {
  // Metriques financieres
  "ARR": {
    short: "Annual Recurring Revenue",
    full: "Revenu annuel recurrent. Metrique cle pour les SaaS. ARR = MRR x 12.",
  },
  "MRR": {
    short: "Monthly Recurring Revenue",
    full: "Revenu mensuel recurrent. Base de calcul pour la croissance d'un SaaS.",
  },
  "Burn mensuel": {
    short: "Depenses nettes mensuelles",
    full: "Montant net depense chaque mois (depenses - revenus). Indique la vitesse a laquelle la startup consomme sa tresorerie.",
  },
  "Burn Multiple": {
    short: "Efficacite du capital",
    full: "Burn Multiple = Burn Net / New ARR. Mesure combien de capital est brule pour generer 1 euro de nouveau revenu. < 1x = excellent, 1-2x = bon, > 3x = preoccupant.",
  },
  "Runway": {
    short: "Duree de survie en mois",
    full: "Nombre de mois avant epuisement de la tresorerie au rythme actuel. Runway = Tresorerie / Burn mensuel. < 6 mois = urgence levee.",
  },
  "LTV": {
    short: "Lifetime Value",
    full: "Valeur totale generee par un client sur toute sa duree de vie. LTV = ARPA x duree moyenne de retention.",
  },
  "CAC": {
    short: "Customer Acquisition Cost",
    full: "Cout d'acquisition d'un nouveau client. Inclut marketing + sales / nombre de nouveaux clients.",
  },
  "LTV/CAC": {
    short: "Ratio valeur client / cout d'acquisition",
    full: "Ratio entre la valeur d'un client et son cout d'acquisition. > 3x = sain, < 1x = perte d'argent a chaque client.",
  },
  "NRR": {
    short: "Net Revenue Retention",
    full: "Retention nette des revenus. Mesure si les clients existants depensent plus (>100%) ou moins (<100%) d'annee en annee. > 120% = excellent (expansion), < 90% = churn problematique.",
  },
  "Churn": {
    short: "Taux d'attrition",
    full: "Pourcentage de clients perdus sur une periode. Churn mensuel > 5% = signal d'alarme pour un SaaS.",
  },
  "IRR": {
    short: "Internal Rate of Return",
    full: "Taux de rendement interne. Rendement annualise d'un investissement. Un bon IRR en VC = 25-30%+.",
  },
  "Multiple": {
    short: "Multiplicateur de l'investissement",
    full: "Combien de fois l'investissement initial est recupere. 3x = tripler sa mise. En early-stage, un bon VC vise 10x+ par deal.",
  },
  "Liq. Pref": {
    short: "Liquidation Preference",
    full: "Priorite de remboursement en cas de vente/liquidation. 1x = l'investisseur recupere d'abord sa mise. 2x = il recupere 2 fois sa mise avant les fondateurs.",
  },
  "Break-even": {
    short: "Seuil de rentabilite",
    full: "Moment ou les revenus couvrent les depenses. Apres le break-even, la startup n'a plus besoin de lever pour survivre.",
  },
  "Take rate": {
    short: "Commission de la marketplace",
    full: "Pourcentage preleve par la marketplace sur chaque transaction. Benchmark : 10-25% selon le secteur.",
  },

  // Termes de negociation
  "Vesting": {
    short: "Acquisition progressive des parts",
    full: "Mecanisme qui attribue les parts progressivement (typiquement 4 ans, cliff 1 an). Protege contre le depart premature d'un fondateur.",
  },
  "Dilution": {
    short: "Reduction de votre % au capital",
    full: "A chaque levee de fonds, de nouvelles parts sont creees, reduisant le pourcentage des actionnaires existants. Ex: 10% pre-money devient ~7% post-Series A typiquement.",
  },
  "Anti-dilution": {
    short: "Protection contre la dilution",
    full: "Clause protégeant l'investisseur si la startup lève à une valorisation inférieure (down round). Full ratchet = très agressif, weighted average = standard.",
  },
  "Drag-along": {
    short: "Droit d'entrainement",
    full: "Si les majoritaires vendent, ils peuvent forcer les minoritaires a vendre aussi. Protege la capacite a conclure un exit.",
  },
  "Tag-along": {
    short: "Droit de sortie conjointe",
    full: "Si un actionnaire vend ses parts, les autres peuvent vendre les leurs aux memes conditions. Protege les minoritaires.",
  },
  "Cap Table": {
    short: "Table de capitalisation",
    full: "Tableau listant tous les actionnaires, leur pourcentage, et les differentes classes d'actions. Document clé pour comprendre la structure de propriete.",
  },

  // Termes d'analyse
  "Leverage": {
    short: "Pouvoir de negociation",
    full: "Force de votre position dans la negociation. Fort = vous avez des alternatives, le deal est competitif. Faible = le fondateur a d'autres options.",
  },
  "Dealbreaker": {
    short: "Risque critique",
    full: "Risque majeur identifie qui necessite une investigation approfondie avant toute decision. Ex: pas de vesting, valorisation hors normes, problemes d'integrite.",
  },
  "Moat": {
    short: "Avantage concurrentiel defensif",
    full: "Barriere a l'entree qui protege la startup de la concurrence. Network effects, brevets, data, marque, couts de switching.",
  },
  "TAM": {
    short: "Total Addressable Market",
    full: "Taille totale du marche si 100% de part de marche. Souvent surevalue dans les decks. Verifier le calcul bottom-up.",
  },
  "SAM": {
    short: "Serviceable Addressable Market",
    full: "Part du TAM reellement adressable par la startup (geographie, segment, canal). Plus realiste que le TAM.",
  },
  "SOM": {
    short: "Serviceable Obtainable Market",
    full: "Part du SAM que la startup peut raisonnablement capturer a 3-5 ans. Le seul chiffre qui compte pour les projections.",
  },
  "PMF": {
    short: "Product-Market Fit",
    full: "Adequation produit-marche. Signal que le marche veut le produit. Indicateurs : retention elevee, bouche-a-oreille, croissance organique.",
  },
  "GTM": {
    short: "Go-to-Market",
    full: "Strategie de mise sur le marche. Comment la startup prevoit d'acquerir ses clients (canaux, pricing, partenariats).",
  },
};

/**
 * Lookup flexible : accepte la cle exacte ou des variantes courantes
 */
export function findGlossaryEntry(term: string): { short: string; full: string } | null {
  // Exact match
  if (GLOSSARY[term]) return GLOSSARY[term];

  // Case-insensitive match
  const lower = term.toLowerCase();
  for (const [key, value] of Object.entries(GLOSSARY)) {
    if (key.toLowerCase() === lower) return value;
  }

  return null;
}
