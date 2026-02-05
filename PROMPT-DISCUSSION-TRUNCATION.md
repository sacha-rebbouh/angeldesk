# Contexte: Probleme de troncature JSON des agents LLM

## Objectif de la discussion

Je veux **maximiser les donnees stockees en DB** par mes agents d'analyse, tout en garantissant que le JSON genere soit **valide et parsable**. Actuellement, certains agents echouent car leur JSON est tronque (accolades non fermees).

---

## Architecture actuelle

### Stack
- **LLM Provider**: OpenRouter
- **Modele utilise**: Gemini 3 Flash (pour TOUS les agents)
- **Max output tokens configure**: 65,536 tokens (65K)
- **Context window**: 1,000,000 tokens (1M)

### Flow de donnees
```
LLM genere JSON → Agent parse avec extractBracedJSON() → Stockage DB (Prisma/Neon) → Affichage UI
```

### Le probleme
Quand le LLM genere trop de contenu, le JSON est coupe en plein milieu:
```
[extractBracedJSON] Truncated JSON detected (4 unclosed braces), attempting repair
[extractBracedJSON] Repair failed, returning null
```

Resultat: **parsing echoue → 0% des donnees stockees**.

---

## Configuration des timeouts par agent

### Tier 0 (Extraction)
| Agent | Timeout | Role |
|-------|---------|------|
| document-extractor | 120s | Extraction du contenu des documents |
| fact-extractor | 90s | Extraction structuree des faits |
| deck-coherence-checker | 60s | Verification coherence deck |

### Tier 1 (Analyse - 13 agents en parallele)
| Agent | Timeout | Role |
|-------|---------|------|
| deck-forensics | 150s | Analyse forensique du pitch deck |
| financial-auditor | 120s | Audit financier |
| team-investigator | 120s | Investigation equipe |
| market-intelligence | 180s | Validation claims marche |
| competitive-intel | 120s | Analyse concurrentielle |
| exit-strategist | 120s | Modelisation exit |
| tech-stack-dd | 120s | DD technique stack |
| tech-ops-dd | 180s | DD technique ops/secu |
| legal-regulatory | 180s | Analyse juridique |
| gtm-analyst | 120s | Analyse GTM |
| customer-intel | 180s | Analyse clients |
| cap-table-auditor | 120s | Audit cap table |
| question-master | 120s | Synthese questions |

### Tier 2 (Experts sectoriels - 1 agent dynamique selon secteur)
| Agent | Timeout | Probleme |
|-------|---------|----------|
| saas-expert | **AUCUN** | Pas de timeout explicite |
| ai-expert | **AUCUN** | Pas de timeout explicite |
| fintech-expert | **AUCUN** | Pas de timeout explicite |
| marketplace-expert | 120s | Seul avec timeout |
| healthtech-expert | **AUCUN** | Pas de timeout explicite |
| deeptech-expert | **AUCUN** | Pas de timeout explicite |
| climate-expert | **AUCUN** | Pas de timeout explicite |
| consumer-expert | **AUCUN** | Pas de timeout explicite |
| hardware-expert | **AUCUN** | Pas de timeout explicite |
| gaming-expert | **AUCUN** | Pas de timeout explicite |
| blockchain-expert | **AUCUN** | Pas de timeout explicite |

**Note**: Les experts Tier 2 sont des objets avec `run()`, pas des classes BaseAgent. Ils appellent `completeJSON()` directement sans wrapper timeout.

### Tier 3 (Synthese - 5 agents sequentiels)
| Agent | Timeout | Role |
|-------|---------|------|
| contradiction-detector | 120s | Detection contradictions cross-sources |
| scenario-modeler | 120s | Modelisation 4 scenarios |
| devils-advocate | 120s | Challenge these d'investissement |
| synthesis-deal-scorer | 120s | Score final + recommandation |
| memo-generator | 180s | Investment memo institutionnel |

---

## Causes possibles de troncature

### 1. Limite de tokens output atteinte
- Configure: 65K tokens
- Gemini 3 Flash supporte: 65K max
- **Peu probable** car 65K = ~50,000 mots

### 2. Timeout agent
- L'agent timeout avant que le LLM finisse
- **Comportement**: La requete serait tuee, pas tronquee
- **Verifiable via**: `finishReason` dans les logs

### 3. Timeout API/HTTP
- Vercel function timeout (defaut 60s, configurable)
- OpenRouter timeout
- **Comportement**: Erreur reseau, pas JSON tronque

### 4. Erreur LLM
- Le modele genere un JSON mal forme
- Pas une troncature reelle mais une erreur de generation
- **Plus probable** pour les structures JSON complexes

### 5. Streaming interrompu
- Si on utilise le streaming, une interruption mid-stream
- **A verifier**: Est-ce qu'on utilise streaming pour ces agents?

---

## Solution temporaire implementee

J'ai ajoute des **regles de concision** dans les prompts des agents Tier 3:

```
# REGLES DE CONCISION CRITIQUES (pour eviter troncature JSON)

1. **LIMITES STRICTES sur les arrays**:
   - counterArguments: MAX 4 items
   - killReasons: MAX 4 items
   - blindSpots: MAX 3 items
   - redFlags: MAX 5 items
   - questions: MAX 5 items

2. **BREVITE dans les textes**:
   - justification: 1-2 phrases MAX
   - description: 2-3 phrases MAX

3. **Structure > Contenu**: Mieux vaut un JSON complet que tronque
```

**Probleme**: Ca reduit la quantite de donnees stockees en DB. Le user veut le MAXIMUM d'infos.

---

## Ce que je veux

### Objectif principal
**Stocker le MAXIMUM de donnees en DB**, meme si l'UI n'en affiche qu'une partie.

### Contrainte
Le JSON doit etre **valide et parsable** a 100%.

### Questions a resoudre

1. **Quelle est la vraie cause de troncature?**
   - Token limit? Timeout? Erreur LLM? Streaming?
   - Comment le diagnostiquer definitivement?

2. **Solutions possibles**
   - Appels LLM multiples (1 par section du JSON)?
   - Augmenter les timeouts?
   - Changer de modele pour les agents complexes?
   - Streaming avec parsing incremental?
   - Fallback avec retry et prompt simplifie?

3. **Tradeoffs a evaluer**
   - Cout vs completude (plus d'appels = plus cher)
   - Latence vs completude (appels sequentiels = plus lent)
   - Complexite vs fiabilite

4. **Metrics a ajouter**
   - Logger `finishReason` pour chaque appel
   - Logger `outputTokens` vs `maxTokens`
   - Alerter si `finishReason === "length"`

---

## Code pertinent

### Fonction de parsing JSON (extractBracedJSON)
Localisation: `src/services/openrouter/router.ts`

Gere:
- Extraction JSON depuis markdown (```json blocks)
- Detection de JSON tronque (unclosed braces)
- Tentative de reparation (ajout d'accolades fermantes)

### Configuration modele
```typescript
// src/services/openrouter/client.ts
GEMINI_3_FLASH: {
  id: "google/gemini-3-flash-preview",
  name: "Gemini 3 Flash",
  inputCost: 0.0005, // $0.50/M
  outputCost: 0.003, // $3/M
  contextWindow: 1000000,
  maxOutputTokens: 65536, // 65K output limit
}
```

### Selection de modele
```typescript
// src/services/openrouter/router.ts
export function selectModel(complexity: TaskComplexity, agentName?: string): ModelKey {
  // Tous les agents utilisent Gemini 3 Flash
  return "GEMINI_3_FLASH";
}
```

### Default maxTokens
```typescript
// src/services/openrouter/router.ts
const {
  maxTokens = 65000, // Gemini 3 Flash supports 65K
  // ...
} = options;
```

---

## Logs type d'un echec

```
[extractBracedJSON] Truncated JSON detected (4 unclosed braces), attempting repair
[extractBracedJSON] Repair failed, returning null
[Orchestrator] Failed agents in allResults: devils-advocate: Failed to parse LLM response
```

---

## Questions pour toi

1. As-tu deja rencontre ce pattern de troncature JSON avec des LLM?
2. Quelle est la meilleure approche pour garantir JSON valide + max donnees?
3. Est-ce que diviser en plusieurs appels est la solution standard?
4. Y a-t-il des techniques de "structured output" qui garantissent la validite?
5. Gemini 3 Flash est-il le bon choix pour ces agents complexes?
