// Aide contextuelle pour les champs du formulaire Conditions
// Destiné aux Business Angels — langage clair, pas de jargon juridique pur

export const TERMS_HELP: Record<string, { label: string; tooltip: string; example?: string }> = {
  // Valorisation
  valuationPre: {
    label: "Valorisation pre-money",
    tooltip: "Valeur de l'entreprise AVANT votre investissement. Plus elle est basse, plus votre pourcentage est eleve pour un meme montant investi.",
    example: "Pre-seed: 1-2.5M / Seed: 3-6M / Series A: 10-25M",
  },
  amountRaised: {
    label: "Montant leve",
    tooltip: "Montant total de la levee de fonds (pas uniquement votre ticket). La valo post-money = pre-money + montant leve.",
  },
  dilutionPct: {
    label: "Dilution",
    tooltip: "Pourcentage du capital cede aux nouveaux investisseurs. Typiquement 15-25% en early stage. Au-dessus de 30%, c'est un signal d'alerte.",
    example: "Standard: 15-20% en Seed",
  },

  // Instrument
  instrumentType: {
    label: "Type d'instrument",
    tooltip: "Le vehicule juridique de votre investissement. Le BSA-AIR est le standard en France pour le Pre-seed/Seed (simple, rapide, peu de frais juridiques).",
  },
  BSA_AIR: {
    label: "BSA-AIR",
    tooltip: "Bon de Souscription d'Actions - Accord d'Investissement Rapide. Instrument standard pour les tours early stage en France. Vous investissez maintenant, vous recevez des actions lors du prochain tour de table a une valorisation plafonnee (cap).",
    example: "Cap typique: 2-5M en pre-seed",
  },
  CONVERTIBLE_NOTE: {
    label: "Note convertible",
    tooltip: "Pret qui se convertit en actions lors du prochain tour. Plus courant dans les pays anglo-saxons. Inclut generalement un taux d'interet et une decote (discount).",
  },

  // Protections
  liquidationPref: {
    label: "Preference de liquidation",
    tooltip: "En cas de vente ou liquidation, vous etes rembourse en priorite. '1x non-participating' = vous recuperez au minimum votre mise avant que les fondateurs touchent quoi que ce soit. C'est le standard.",
    example: "Standard BA: 1x non-participating",
  },
  antiDilution: {
    label: "Anti-dilution",
    tooltip: "Protection si un futur tour se fait a une valo inferieure (down round). 'Weighted average broad' est le standard. 'Full ratchet' est tres agressif et defavorable aux fondateurs.",
    example: "Standard: Weighted average (broad-based)",
  },
  proRataRights: {
    label: "Droits pro-rata",
    tooltip: "CRUCIAL pour un BA. Le droit de reinvestir dans les tours suivants pour maintenir votre pourcentage. Sans ce droit, vous serez dilue mecaniquement a chaque nouveau tour.",
  },
  informationRights: {
    label: "Droits d'information",
    tooltip: "Acces aux reporting financiers reguliers (trimestriels minimum). Essentiel pour suivre votre investissement. Sans ca, vous investissez a l'aveugle.",
  },
  boardSeat: {
    label: "Siege au board",
    tooltip: "Observateur = vous assistez aux reunions du board mais ne votez pas. Siege complet = vous votez. En tant que BA solo, un siege observateur est deja tres bien.",
  },

  // Gouvernance
  founderVesting: {
    label: "Vesting fondateurs",
    tooltip: "Les fondateurs 'gagnent' progressivement leurs actions sur une periode (generalement 4 ans avec 1 an de cliff). Protege l'investisseur si un fondateur part tot.",
    example: "Standard: 4 ans, cliff 12 mois",
  },
  vestingDurationMonths: {
    label: "Duree du vesting",
    tooltip: "Periode totale sur laquelle les fondateurs acquierent leurs actions. 48 mois (4 ans) est le standard. Moins de 36 mois est un signal d'alerte.",
  },
  vestingCliffMonths: {
    label: "Cliff",
    tooltip: "Periode initiale pendant laquelle aucune action n'est acquise. Si le fondateur part avant le cliff, il ne garde rien. 12 mois est le standard.",
  },
  esopPct: {
    label: "ESOP",
    tooltip: "Employee Stock Option Plan — pool d'actions reservees pour attirer les talents. 10-15% est le standard. Un ESOP trop faible rendra le recrutement difficile.",
    example: "Standard: 10-15% du capital",
  },
  dragAlong: {
    label: "Drag-along",
    tooltip: "Permet aux actionnaires majoritaires de forcer la vente de 100% des actions lors d'une acquisition. Protege les acheteurs potentiels qui veulent 100%.",
  },
  tagAlong: {
    label: "Tag-along",
    tooltip: "IMPORTANT pour un BA. Si les fondateurs vendent leurs actions, vous avez le droit de vendre les votres aux memes conditions. Sans tag-along, vous pourriez rester bloque.",
  },

  // Clauses speciales
  ratchet: {
    label: "Ratchet",
    tooltip: "CLAUSE TOXIQUE. En cas de down round, l'investisseur est protege a 100% et toute la dilution est supportee par les fondateurs et les autres investisseurs. Tres defavorable.",
  },
  payToPlay: {
    label: "Pay-to-play",
    tooltip: "Oblige les investisseurs a participer aux tours suivants pour conserver leurs droits preferentiels. Problematique pour un BA qui n'a pas toujours les moyens de suivre.",
  },
  milestoneTranches: {
    label: "Tranches / Milestones",
    tooltip: "Le financement est libere en plusieurs tranches conditionnees a des objectifs. Protege l'investisseur mais peut fragiliser la startup si les objectifs sont mal calibres.",
  },
  nonCompete: {
    label: "Non-compete",
    tooltip: "Clause de non-concurrence pour les fondateurs. Les empeche de creer une boite concurrente pendant une periode donnee (generalement 1-2 ans apres leur depart).",
  },

  // Structured mode
  CCA: {
    label: "Compte Courant d'Associe (CCA)",
    tooltip: "Pret de l'associe a la societe. L'argent est une dette que la boite vous doit, remboursable a tout moment (sauf convention contraire). Souvent combine avec une prise de participation.",
    example: "Typique: 20-50K en CCA + equity",
  },
  OPTION: {
    label: "Option d'achat",
    tooltip: "Droit (mais pas obligation) d'acheter des actions a un prix fixe dans le futur. Souvent lie a des milestones ou une periode de performance.",
  },
};
