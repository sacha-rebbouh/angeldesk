# Engine Overview - Vision, Diagnostic et Declenchement

> Derniere mise a jour: 2026-01-28 | Source: REFLEXION-CONSENSUS-ENGINES.md v3.0

---

## 1. Vision & Philosophie

Ces engines incarnent le **controle qualite d'un cabinet d'audit Big4** combine avec le **jugement d'un Investment Committee**.

```
CONSENSUS ENGINE                      REFLEXION ENGINE
━━━━━━━━━━━━━━━━━━━                   ━━━━━━━━━━━━━━━━━━━
= Tribunal d'arbitrage               = Reviewer senior
= Juge impartial avec preuves        = Qui relit avant envoi client
= Resout par les FAITS               = Detecte les faiblesses
= Ne laisse pas de zone grise        = Force a approfondir
```

### Pourquoi c'est CRITIQUE

```
┌─────────────────────────────────────────────────────────────────────┐
│  SANS ENGINES DE QUALITE                                            │
│  ─────────────────────────                                          │
│  Agent A dit: "ARR = 500K€"                                         │
│  Agent B dit: "ARR = 800K€"                                         │
│  → Le BA recoit les deux sans savoir lequel croire                  │
│  → Decision d'investissement basee sur des donnees contradictoires  │
│  → Potentielle perte de 50-200K€                                    │
│                                                                     │
│  AVEC ENGINES DE QUALITE                                            │
│  ─────────────────────────                                          │
│  Consensus Engine detecte la contradiction                          │
│  → Cross-reference avec le deck (Slide 8: MRR 42K€ → ARR = 504K€)  │
│  → Cross-reference avec le financial model (ligne 12: 507K€)        │
│  → Verdict: ARR = ~505K€, Agent B surestimait de 58%                │
│  → Red flag: "Agent B a invente ou mal calcule"                     │
│  → Le BA a une seule verite, sourcee                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Personas des Engines

**Consensus Engine** = Investment Committee Partner
- 25+ ans d'experience en IC de fonds VC
- A vu 100+ debates internes sur des deals
- Sait que les "opinions" ne valent rien sans preuves
- Tranche vite mais toujours sur des faits
- Ne laisse JAMAIS une contradiction non resolue
- Documente chaque decision pour les LPs

**Reflexion Engine** = Senior Quality Reviewer (Big4)
- 15+ ans de revue de rapports de due diligence
- Detecte les faiblesses d'argumentation en 30 secondes
- Sait ce qui passerait devant un tribunal vs ce qui est du bluff
- Force les analystes a sourcer chaque affirmation
- Ne laisse JAMAIS passer une analyse "moyennement confiante"
- Standard: "Est-ce qu'on facturerait 50K€ pour ca?"

---

## 2. Diagnostic des Engines Actuels

### Consensus Engine - Problemes identifies

| Probleme | Code actuel | Impact |
|----------|-------------|--------|
| Debat rhetorique | `You are representing the position...` | Agents "defendent" au lieu de prouver |
| Resolution par concession | `p.finalPosition === true` | Le plus eloquent gagne, pas le plus precis |
| Pas de cross-reference | Debat "dans le vide" | Aucune verification des sources |
| Arbitrage faible | `As a neutral arbitrator...` | Pas de methodologie, pas de criteres |

**Output actuel typique (MAUVAIS):**
```json
{
  "contradictionId": "abc123",
  "resolvedBy": "consensus",
  "winner": "financial-auditor",
  "resolution": "financial-auditor's position accepted: The ARR is 500K€ based on the analysis",
  "confidence": 72
}
```
→ "Based on the analysis" = source vague, le BA ne peut pas verifier.

### Reflexion Engine - Problemes identifies

| Probleme | Code actuel | Impact |
|----------|-------------|--------|
| Critique sans standards | `Identify issues with this analysis` | Critiques subjectives |
| Improvements vagues | `"description": "specific change"` | On ne sait pas ce qui a change |
| Pas de cross-reference | Reflexion sur output seul | Auto-validation sans verification |

**Output actuel typique (MAUVAIS):**
```json
{
  "critiques": [{ "issue": "Some metrics could be more detailed" }],
  "improvements": [{ "description": "Added more detail", "applied": true }]
}
```
→ "Some metrics" = lesquels? "More detail" = quoi exactement?

---

## 3. Standards de Qualite

### Niveau attendu pour le Consensus Engine

Le Consensus Engine doit produire des resolutions **defensables devant un tribunal d'arbitrage**.

| Critere | Obligatoire | Exemple |
|---------|-------------|---------|
| Citation source primaire | OUI | "Slide 8 indique MRR = 42K€" |
| Explication rejet autre position | OUI | "Agent B utilisait une estimation sans source" |
| Verifiable par le BA | OUI | References exactes dans le deck |
| Base sur preuves, pas eloquence | OUI | Cross-reference deck + FM + CE |
| Incertitude explicite si 50/50 | OUI | "Range probable: 500-520K€" |

### Niveau attendu pour le Reflexion Engine

Le Reflexion Engine doit produire des critiques **acceptees par un Partner d'audit Big4**.

| Critere | Obligatoire | Exemple |
|---------|-------------|---------|
| Critique specifique et localisee | OUI | "Le CAC (slide 5: 2,500€) ne prend pas en compte..." |
| Reference aux standards secteur | OUI | "Benchmark OpenView 2024: CAC median = 1,800€" |
| Action concrete proposee | OUI | "Recalculer en demandant la decomposition" |
| Avant/Apres visible | OUI | Texte exact avant et apres correction |
| Cross-reference CE/DB | OUI | "Context Engine: pas de donnees CAC - benchmark utilise" |

---

## 4. Matrice de Declenchement

```
┌────────────────────────────────────────────────────────────────────────┐
│                    QUAND DECLENCHER QUOI                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  CONTRADICTION DETECTEE                                                │
│  ───────────────────────                                               │
│  ├─ Severite CRITICAL ou MAJOR → Consensus Engine OBLIGATOIRE          │
│  ├─ Severite MODERATE → Consensus Engine si confiance < 70% des 2     │
│  └─ Severite MINOR → Resolution rapide sans debat (cross-ref deck)    │
│                                                                        │
│  CONFIANCE FAIBLE                                                      │
│  ───────────────────────                                               │
│  ├─ Agent Tier 1, confiance < 70% → Reflexion Engine OBLIGATOIRE      │
│  ├─ Agent Tier 2, confiance < 60% → Reflexion Engine OBLIGATOIRE      │
│  └─ Agent Tier 3 → JAMAIS (synthese finale)                           │
│                                                                        │
│  RED FLAG CRITIQUE                                                     │
│  ─────────────────                                                     │
│  ├─ Severity CRITICAL + source verifiable → OK                        │
│  └─ Severity CRITICAL + source non verifiable → Reflexion obligatoire │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Seuils Justifies

| Seuil | Valeur | Justification |
|-------|--------|---------------|
| Ecart numerique = contradiction | >30% | En dessous, c'est souvent des arrondis ou estimations acceptables |
| Confiance declenchant reflexion (Tier 1) | <70% | Un agent Tier 1 doit etre fiable, <70% = probleme |
| Confiance declenchant reflexion (Tier 2) | <60% | Experts sectoriels ont plus d'incertitude par nature |
| Max rounds de debat | 3 | Au-dela, le cout explose sans gain de qualite |
| Confiance pour skip round | >85% d'un cote | Si un agent a 90% et l'autre 50%, pas besoin de 3 rounds |

---

## 5. Flux d'Execution Complet

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FLUX D'ANALYSE COMPLET                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. TIER 1 AGENTS (parallele)                                           │
│     └─> Chaque agent produit findings                                   │
│                                                                         │
│  2. REFLEXION ENGINE (conditionnel)                                     │
│     ├─> Pour chaque agent Tier 1 avec confiance < 70%                  │
│     ├─> Critique + Improve                                              │
│     └─> Output: findings revises                                        │
│                                                                         │
│  3. CONSENSUS ENGINE - Phase 1                                          │
│     ├─> Detecter contradictions entre agents Tier 1                    │
│     ├─> Resoudre contradictions CRITICAL et MAJOR                      │
│     └─> Output: findings consolides                                     │
│                                                                         │
│  4. TIER 2 AGENTS (expert sectoriel)                                    │
│     └─> Un seul agent selon le secteur                                  │
│                                                                         │
│  5. REFLEXION ENGINE (conditionnel)                                     │
│     └─> Si confiance Tier 2 < 60%                                       │
│                                                                         │
│  6. CONSENSUS ENGINE - Phase 2                                          │
│     └─> Contradictions entre Tier 1 consolide et Tier 2                │
│                                                                         │
│  7. TIER 3 AGENTS (synthese)                                            │
│     ├─> contradiction-detector (deja fait par Consensus Engine)        │
│     ├─> synthesis-deal-scorer                                           │
│     ├─> devils-advocate                                                 │
│     ├─> scenario-modeler                                                │
│     └─> memo-generator                                                  │
│                                                                         │
│  8. OUTPUT FINAL                                                        │
│     └─> Memo + Score + Red flags + Questions                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Fichiers connexes

- [01-CONSENSUS-SPEC.md](./01-CONSENSUS-SPEC.md) - Types et logique du Consensus Engine
- [02-CONSENSUS-PROMPTS.md](./02-CONSENSUS-PROMPTS.md) - Prompts debater et arbitrator
- [03-REFLEXION-SPEC.md](./03-REFLEXION-SPEC.md) - Types et logique du Reflexion Engine
- [04-REFLEXION-PROMPTS.md](./04-REFLEXION-PROMPTS.md) - Prompts critic et improver
- [05-SHARED-UTILS.md](./05-SHARED-UTILS.md) - Calculs, schemas Zod, validation
- [06-INTEGRATION-CHECKLIST.md](./06-INTEGRATION-CHECKLIST.md) - Implementation et tests
