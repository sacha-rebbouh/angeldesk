# Evidence Engine — Phase 1 : proposition de schéma `EvidenceSignal`

> Date : 2026-05-17 (révision 3 après review Codex round 2 le même jour)
> Auteur : Claude
> Statut : **proposition pour greenlight Codex round 3** — aucune implémentation, aucune migration appliquée.
> Dépend de : `docs-private/evidence-engine-audit.md` (Phase 0 + corrections §6 base-agent).
>
> **Changements depuis révision 2** (réponses aux findings Codex round 2) :
> - **P1 NULL ≠ NULL dans unique constraint** : ajout d'un champ obligatoire `signalScopeKey String` (valeurs canoniques : `"run:<id>"`, `"filename"`, `"human:<id>"`, `"import:<batch>"`). Le tuple unique devient `(documentId, documentVersion, signalScopeKey, kind, signalHash)` — plus de NULL dans la clé, dédup correcte sur tous les producers. `extractionRunId` reste FK nullable pour la provenance uniquement, plus utilisé dans l'unique. Cf. §3.5, §3.11.
> - **P1 cross-document run** : ajout d'une FK composite `(extractionRunId, documentId) → DocumentExtractionRun(id, documentId)` + `@@unique([id, documentId])` sur `DocumentExtractionRun`. Impossible de pointer un run d'un autre document. Cf. §2, §3.5.
> - **P2 read-path latest extractor version** : non-bloquant Phase 1. Décision déférée en §3.12 avec 3 options listées (`isCurrent` flag, `signalBatchId`, ou pure read filter SQL). À trancher avant Phase 5.
> - **P2 metadata Json en clair** : §3.13 verrouille la règle — invariant strict + check CI proposé.
>
> **Changements depuis révision 1** (réponses aux findings Codex round 1, conservés) :
> - **P1 chiffrement** : `evidenceText` ET `valueJson` chiffrés (`encryptText` / `encryptJsonField`). Plus de contradiction interne.
> - **P1 cross-tenant** : FK composite `Document(id, dealId)` + `@@unique([id, dealId])` sur `Document`.
> - **P1 lifecycle** : `extractionRunId`, `extractorVersion`, `sourceTextHash`.
> - **P1 fallback uploadedAt** : EMAIL_LIKE_WARNING ne mute jamais `Document` (cf. §3.7 + bug `base-agent.ts:976` tracké en §10).
> - **P2 signalHash spec** : §3.4 canonical JSON + extractorVersion.
> - **P2 precision default** : `UNKNOWN`.
>
> **Patterns déterministes confirmés content-level** (post-déchiffrement, citations courtes dans l'audit) :
> - `CAP_TABLE_AS_OF` : regex sur `/à\s+jour\s+au\s+(\d{1,2}\/\d{1,2}\/\d{4})/i` capture `18/09/2024` du cap table Avekapeti.
> - `DOCUMENT_DATE` deck : regex sur footer `/(Confidentiel|Confidential)\s*[–\-—]\s*([A-Za-zéûôî]+)\s+(\d{4})/i` capture `March 2026` (E4N deck, 32 hits), `Avril 2026` (NETGEM one-pager), `April 2026` (E4N model output).
> - `BALANCE_SHEET_AS_OF` + `FINANCIAL_PERIOD_ACTUAL` : regex sur `/Période\s+du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i` ET `/Exercice\s+clos\s+le[^\d]*(\d{2}\/\d{2}\/\d{4})/i` ET `/For\s+the\s+\d+\s+months?\s+ended\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i` capturent les bilans FurLove.
> - `FINANCIAL_PERIOD_FORECAST` : regex sur en-têtes de colonnes Excel/PDF `/\b(20\d{2})\s+(20\d{2})\s+(20\d{2})\s+(20\d{2})\s+(20\d{2})\b/` capture `2026 2027 2028 2029 2030`.
> - `ATTACHMENT_RELATION` : string-match d'un filename de doc uploadé dans le `extractedText` d'un email ; preuve : `"Table de capi Septembre 2024 signeģe.png"` apparaît verbatim dans `Mail.pdf`.
> - `.docx` body-shape heuristic : LOW confidence email-like detection si filename hint + corps court + opening salutation + pas de header `De:/From:`. Réduit le trou de couverture documenté §4.1 / §5.1 de l'audit.

---

## 1. Décisions structurelles soumises au gate (révision 3)

| Décision | Choix proposé | Alternative écartée | Justification |
|----------|---------------|---------------------|---------------|
| Stockage | **Table dédiée `EvidenceSignal`** | `Document.evidenceSignals: Json[]` | Besoin d'indexer par `kind`, `dealId`, `asOfDate`. Une JSON column rend les freshness checks (Phase 7) inefficaces. |
| Cycle de vie | **`(documentVersion, signalScopeKey, extractorVersion, sourceTextHash)`** ; `extractionRunId` reste champ FK de provenance uniquement | Utiliser `extractionRunId` directement dans l'unique (révision 2 — **NULL ≠ NULL Codex round 2**) | Cf. §3.5 + §3.11. `signalScopeKey` est un String non-null qui identifie le producteur (`run:<id>`, `filename`, `human:<id>`, `import:<batch>`) → dédup correcte même pour signaux sans run. |
| Idempotence | **Clé naturelle `(documentId, documentVersion, signalScopeKey, kind, signalHash)`** ; tous fields NON-NULL | `(documentId, documentVersion, extractionRunId, kind, signalHash)` avec `extractionRunId` nullable (révision 2) | Cf. §3.11. PostgreSQL traite NULL ≠ NULL dans unique → la version révision 2 laissait passer des doublons pour les signaux filename/human/import. `signalScopeKey` non-null règle le problème. |
| Cross-tenant integrity | **FK composite `Document(id, dealId)`** ; `@@unique([id, dealId])` sur `Document` | Deux relations séparées (révision 1) | Garantit en DB qu'un signal ne peut pas avoir `(dealId=A, documentId=B)` où `Document.B.dealId ≠ A`. |
| Cross-document run integrity | **FK composite `DocumentExtractionRun(id, documentId)`** ; `@@unique([id, documentId])` sur `DocumentExtractionRun` | FK simple `extractionRunId → DocumentExtractionRun(id)` (révision 2 — **Codex round 2** : pouvait mixer run d'un doc et signal d'un autre doc) | Garantit qu'un signal qui référence un `extractionRunId` référence un run **du même `documentId`**. Composite FK avec `MATCH SIMPLE` (default Postgres) tolère `extractionRunId = NULL` sans contraindre `documentId`. |
| Cascade | `onDelete: Cascade` depuis Document (transitive) ; cascade aussi depuis DocumentExtractionRun via composite FK | — | Supprimer un deal → docs → signaux. Supprimer un run → signaux de ce run uniquement (les signaux filename/human/import survivent car `extractionRunId = NULL`). |
| Chiffrement | **`evidenceText` ET `valueJson` chiffrés** via `encryptText` / `encryptJsonField` | Mixte (révision 1) | Le contenu OCR ne quitte jamais le coffre. `signalHash` calculé sur plaintext canonique AVANT chiffrement. Axes indexables (`asOfDate`, `kind`, `confidence`, `precision`, …) restent en clair. |
| Provenance code | `sourceMethod` enum + `extractorVersion` string + `signalScopeKey` string | Pas tracé | `sourceMethod` pour filtrage logique, `extractorVersion` pour re-run sélectif, `signalScopeKey` pour identité du producer. |
| Confidence | Enum `HIGH / MEDIUM / LOW` | Float 0-1 | Aligne `email-source-inference.ts:18` et `evidence-ledger.ts:14-24`. |
| Precision default | **`@default(UNKNOWN)`** | `@default(MONTH)` (révision 1 — masquait les bugs parser) | Force le parser à déclarer explicitement. |
| Mutation `Document` (Phase 1) | Aucune. Phase 1 = écritures dans `EvidenceSignal` uniquement. | Promouvoir vers `Document.sourceDate` au write | Promotion = Phase 3 après validation. EMAIL_LIKE_WARNING ne mute jamais (cf. §3.7). |
| `metadata` JSON | **Clair, MAIS règle stricte : aucun extrait OCR, aucun prompt complet, aucun claim financier brut** (Codex P2 round 2) | Chiffrement ou JSON libre sans règle | Cf. §3.13. Verrouillé par invariant docs + test CI. |
| Read-path latest extractor (Phase 5) | **Décision déférée** : 3 options listées en §3.12 (`isCurrent` flag, `signalBatchId`, ou pure SQL filter sur `MAX(extractorVersion)`) | Trancher maintenant | Non-bloquant Phase 1 (pas de read-path encore). Documenté pour Phase 5. |

---

## 2. Schéma Prisma (révision 3)

```prisma
// ============================================================
// EVIDENCE SIGNAL — structured temporal/provenance/claim facts
// extracted from documents. Distinct from FactStore (cross-doc
// facts) and EvidenceLedger (per-page numericClaims). See
// docs-private/evidence-engine-audit.md.
//
// Integrity invariants:
//   1. Cross-tenant: composite FK (documentId, dealId) → Document(id, dealId)
//      blocks signals where document.dealId mismatches the supplied dealId.
//   2. Cross-document run: composite FK (extractionRunId, documentId) →
//      DocumentExtractionRun(id, documentId) blocks signals pointing to a
//      run that belongs to a different document. NULL-safe (MATCH SIMPLE).
//   3. Idempotence: unique tuple (documentId, documentVersion,
//      signalScopeKey, kind, signalHash). All NON-NULL. NULL ≠ NULL bypass
//      cannot duplicate filename/human/import signals.
//   4. signalHash computed on PLAINTEXT canonical form BEFORE encryption.
//   5. evidenceText AND valueJson are encrypted at rest (§3).
// ============================================================
model EvidenceSignal {
  id String @id @default(cuid())

  // ---------- Cross-tenant integrity (invariant #1) ----------
  documentId String
  dealId     String
  document   Document @relation(
    name: "DocumentEvidenceSignals",
    fields: [documentId, dealId],
    references: [id, dealId],
    onDelete: Cascade
  )

  // ---------- Lifecycle: document version ----------
  documentVersion Int // mirrors Document.version at extraction time

  // ---------- Producer scope key (invariant #3, NON-NULL) ----------
  // Canonical values:
  //   "run:<extractionRunId>"     for signals from a specific DocumentExtractionRun
  //   "filename"                  for signals derived purely from filename parsing
  //   "human:<overrideId>"        for manual saisie / HUMAN_OVERRIDE
  //   "import:<batchId>"          for IMPORT/backfill batches
  // Always set, never NULL. Distinct producers → distinct unique-key rows.
  signalScopeKey String

  // ---------- Provenance: cross-document run integrity (invariant #2) ----------
  // Nullable composite FK. When set, MUST point to a run belonging to documentId.
  // PostgreSQL default MATCH SIMPLE: NULL on extractionRunId disables the FK
  // check on that row, but does NOT require documentId to also be NULL.
  extractionRunId String?
  extractionRun   DocumentExtractionRun? @relation(
    name: "DocumentExtractionRunEvidenceSignals",
    fields: [extractionRunId, documentId],
    references: [id, documentId],
    onDelete: Cascade
  )

  // ---------- Lifecycle: extractor + source content ----------
  extractorVersion String  // e.g. "temporal-extractor@2026-05-17-001"
  sourceTextHash   String? // sha256 of the relevant text slice; NULL for filename-only signals

  // ---------- Classification ----------
  kind EvidenceSignalKind

  // ---------- Payload (ENCRYPTED, invariant #5) ----------
  valueJson Json // encryptJsonField() envelope; reads via safeDecryptJsonField()

  // ---------- Temporal axes (CLEAR — indexable) ----------
  dateStart  DateTime?
  dateEnd    DateTime?
  asOfDate   DateTime?
  reportedAt DateTime?

  // ---------- Quality (CLEAR — indexable) ----------
  precision  EvidenceSignalPrecision @default(UNKNOWN)
  confidence EvidenceSignalConfidence

  // ---------- Source method (CLEAR) ----------
  sourceMethod EvidenceSignalMethod

  // ---------- Evidence anchor ----------
  evidenceText String? @db.Text // encryptText() envelope; plaintext quote ≤ 280 chars
  pageNumber   Int?
  sheetName    String?
  charOffset   Int?

  // ---------- Idempotence (invariant #3, #4) ----------
  signalHash String // sha256 of canonical plaintext, includes extractorVersion (§3.4)

  // ---------- Extension (CLEAR — locked-down rule, see §3.13) ----------
  metadata Json? // NEVER OCR excerpts. NEVER full prompts. NEVER raw financial claims.

  createdAt DateTime @default(now())

  // ---------- Indexes ----------
  // Unique tuple — ALL FIELDS NON-NULL → NULL ≠ NULL bypass impossible.
  @@unique([documentId, documentVersion, signalScopeKey, kind, signalHash])
  @@index([dealId, kind])
  @@index([dealId, asOfDate])
  @@index([documentId, kind])
  @@index([extractionRunId, documentId]) // covers the composite FK reverse lookup
  @@index([kind, confidence])
  @@index([signalScopeKey]) // for "purge all signals from producer X"
}

enum EvidenceSignalKind {
  // Temporal
  DOCUMENT_DATE              // creation / signature / "as of" du document lui-même
  EMAIL_SENT_AT              // date d'envoi d'un mail (déjà couvert par Document.sourceDate, copié ici pour cohérence ledger)
  CAP_TABLE_AS_OF            // date à laquelle la cap table est arrêtée
  BALANCE_SHEET_AS_OF        // date du bilan
  FINANCIAL_PERIOD_ACTUAL    // période d'actuals (CA réalisé)
  FINANCIAL_PERIOD_FORECAST  // période de forecast (BP, projections)

  // Provenance
  ATTACHMENT_RELATION        // ce doc est une pièce jointe à un autre (email parent)

  // Warnings (signal-only — NE MUTENT JAMAIS Document.sourceKind/sourceDate)
  EMAIL_LIKE_WARNING         // .docx/PDF qui ressemble à un email mais sans header — confidence LOW
  STALE_DOCUMENT_WARNING     // document considéré obsolète pour le contexte courant (Phase 7)

  // Claims (Phase 6 hook — peut rester vide jusque Phase 6)
  VALUATION_CLAIM            // valorisation déclarée (deck / email / term sheet)
  METRIC_CLAIM               // CA / ARR / MRR / users / etc.
}

enum EvidenceSignalPrecision {
  YEAR
  MONTH
  DAY
  RANGE      // dateStart + dateEnd définis tous les deux
  UNKNOWN
}

enum EvidenceSignalConfidence {
  HIGH       // pattern déterministe unique + contexte sans ambiguïté
  MEDIUM     // pattern déterministe avec ambiguïté possible (filename hint)
  LOW        // inférence LLM ou heuristique faible (jamais auto-promu vers Document)
}

enum EvidenceSignalMethod {
  DETERMINISTIC   // regex / parser
  LLM             // extraction par modèle
  HUMAN_OVERRIDE  // saisie utilisateur
  IMPORT          // backfill / migration
}
```

### Patches sur les modèles existants (révision 3)

```prisma
model Deal {
  // ...
  // NB: pas de relation directe `evidenceSignals` ici — cascade transitive
  // via Document. Si on a besoin de `deal.evidenceSignals` plus tard, ajouter
  // une vue lecture-seule au niveau service.
}

model Document {
  // ...
  // REQUIS pour la composite FK Cross-tenant (invariant #1) :
  @@unique([id, dealId], name: "document_id_dealId")

  evidenceSignals EvidenceSignal[] @relation("DocumentEvidenceSignals")
}

model DocumentExtractionRun {
  // ...
  // REQUIS pour la composite FK Cross-document run (invariant #2) :
  @@unique([id, documentId], name: "extraction_run_id_documentId")

  evidenceSignals EvidenceSignal[] @relation("DocumentExtractionRunEvidenceSignals")
}
```

**Note sur les composite FK et `MATCH SIMPLE`** :
- PostgreSQL applique `MATCH SIMPLE` par défaut sur les FK composites : si **au moins une** colonne du tuple est NULL, la contrainte n'est pas évaluée pour cette row. C'est exactement ce qu'on veut pour `(extractionRunId, documentId)` : quand `extractionRunId IS NULL`, la FK ne s'applique pas, mais `documentId` reste contraint par sa propre FK composite vers Document.
- Prisma supporte les composite FK depuis 2.x. La migration générée doit produire :
  ```sql
  ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "evidence_signal_document_fkey"
    FOREIGN KEY ("documentId", "dealId") REFERENCES "Document"("id", "dealId") ON DELETE CASCADE;
  ALTER TABLE "EvidenceSignal" ADD CONSTRAINT "evidence_signal_extraction_run_fkey"
    FOREIGN KEY ("extractionRunId", "documentId") REFERENCES "DocumentExtractionRun"("id", "documentId") ON DELETE CASCADE;
  ```
- À **valider explicitement** dans la PR de migration : ouvrir le SQL généré et vérifier les deux contraintes (et l'absence de `MATCH FULL` qui changerait la sémantique NULL).

---

## 3. Confidentialité, intégrité, lifecycle — décisions tranchées (révision 2)

### 3.1 `evidenceText` — chiffré

Court extrait (≤ 280 chars) de `extractedText` qui sert de **preuve textuelle**. Exemple : `"Table de capitalisation à jour au 18/09/2024"` (44 chars).

**Décision** : chiffrer via `encryptText()` (helper existant `src/lib/encryption.ts:35`). Lectures via `safeDecrypt(signal.evidenceText)`. Aligné errors.md §2026-05-13 (PRIVACY DB Phase 3) — interdit de dupliquer du contenu OCR en clair dans une autre table.

### 3.2 `valueJson` — chiffré (toutes les kinds, sans branche)

**Décision** : chiffrer via `encryptJsonField()` (helper existant `src/lib/encryption.ts:216`) **pour tous les kinds, sans branche conditionnelle**. Évite "chiffrer si VALUATION_CLAIM, sinon clair" qui crée 2 chemins à maintenir et un risque de fuite au futur ajout de kind. Coût constant ~50µs par row. Pattern cohérent avec `DocumentExtractionPage.artifact`.

Lectures via `safeDecryptJsonField(signal.valueJson)`. Pattern déjà éprouvé dans `evidence-ledger/index.ts:278`.

### 3.3 Axes indexables restent en clair

Les colonnes suivantes ne sont **jamais chiffrées** car elles servent les queries d'indexation :
- `kind`, `confidence`, `precision`, `sourceMethod` (enums)
- `dateStart`, `dateEnd`, `asOfDate`, `reportedAt` (DateTime?)
- `pageNumber`, `sheetName`, `charOffset`, `extractorVersion`, `sourceTextHash` (anchors techniques)
- `documentId`, `dealId`, `documentVersion`, `extractionRunId` (identifiants relationnels)
- `signalHash` (hash, pas de réversibilité vers le plaintext)

Ces colonnes ne contiennent **aucun contenu OCR brut** ; elles sont calculées par le parser à partir du contenu, et ne révèlent au mieux que l'existence d'un signal d'un type donné à une date donnée. Acceptable.

### 3.4 `signalHash` — spec déterministe

```ts
function computeSignalHash(input: {
  extractorVersion: string;
  kind: EvidenceSignalKind;
  valueJson: unknown;          // plaintext, BEFORE encryption
  evidenceText: string | null; // plaintext, BEFORE encryption
  pageNumber: number | null;
  sheetName: string | null;
  charOffset: number | null;
}): string {
  const parts = [
    input.extractorVersion,                       // distinct version → distinct hash
    input.kind,
    canonicalJSONStringify(input.valueJson),      // sorted keys, no whitespace
    (input.evidenceText ?? "").trim().normalize("NFC"),
    String(input.pageNumber ?? ""),
    String(input.sheetName ?? "").trim(),
    String(input.charOffset ?? ""),
  ];
  return sha256(parts.join("|"));
}
```

Règles :
- **Canonical JSON** : clés triées récursivement, pas d'espaces, pas de surrogate pairs non normalisés. Implémenter via une lib dédiée (ex: `json-stable-stringify`) ou maintenir une fonction dans `src/lib/canonical-json.ts`.
- **Normalisation texte** : `.trim().normalize("NFC")` pour éviter les variations Unicode invisibles (ex: `é` composé vs `é` précomposé qui auraient des hashes différents alors qu'ils s'affichent identiquement).
- **`extractorVersion` est obligatoire dans le hash** : un upgrade de parser produit une nouvelle valeur, donc une nouvelle ligne (audit trail conservé). Pas besoin de `documentVersion` ni `signalScopeKey` dans le hash car le tuple unique `(documentId, documentVersion, signalScopeKey, kind, signalHash)` couvre déjà ces cas (cf. §3.11).
- **`sourceTextHash` est exclu du hash** : il est dérivé de `evidenceText`, l'inclure créerait une redondance.

### 3.5 Lifecycle — `signalScopeKey` + `extractionRunId` + `extractorVersion`

**Scénario A — re-extraction avec parser amélioré sur même run** : v=1 du doc, run R1, parser v1.0 → signal `CAP_TABLE_AS_OF = 2024-09-18`. Re-run du parser sur la **même** extraction R1 avec v1.1 → nouveau `signalHash` (extractorVersion change le hash, §3.4). Le tuple unique `(documentId, documentVersion, signalScopeKey="run:R1", kind, signalHash)` voit 2 lignes distinctes (anciens hash + nouveau hash) → coexistence pour audit.

**Scénario B — re-extraction avec nouveau run** : OCR re-run sur la même `documentVersion` → nouveau `DocumentExtractionRun` R2. Le `signalScopeKey` passe de `"run:R1"` à `"run:R2"` → ligne distincte automatiquement, même sans changer le hash. Filtre read-path par `signalScopeKey = "run:<lastRunId>"` ne sert que le dernier run.

**Scénario C — signal filename re-run** : pas d'extractionRun (l'extracteur filename n'a pas besoin d'OCR). `signalScopeKey = "filename"`, `extractionRunId = NULL`. Si on re-run le parser filename avec la même version sur le même doc → même hash → contrainte unique dédupe. Avec un nouveau parser version → nouveau hash → ligne distincte (audit). Pas de bypass NULL ≠ NULL : `signalScopeKey` est non-null.

**Scénario D — HUMAN_OVERRIDE** : utilisateur corrige manuellement la date → `signalScopeKey = "human:<overrideId>"`, `extractionRunId = NULL`. Chaque override a son propre overrideId → son propre scope → distinct des signaux machine. Multiple overrides sur le même fait possible (versioning des overrides). Au read, on prend le dernier override.

**Scénario E — cross-document run rejetée** : un caller buggé essaie d'insérer `documentId=docA + extractionRunId=runOfDocB`. La composite FK `(extractionRunId, documentId) → DocumentExtractionRun(id, documentId)` refuse car aucun row dans `DocumentExtractionRun` n'a `(id=runOfDocB.id, documentId=docA.id)`. Test n°4 §6.1.

**Conséquence read-path** (Phase 5) : la requête type devient
```sql
SELECT s.* FROM "EvidenceSignal" s
JOIN "Document" d ON d.id = s."documentId" AND d."dealId" = s."dealId"
WHERE d."dealId" = $1
  AND d."isLatest" = true
  AND d.version = s."documentVersion"
  AND (
    -- signals from the latest READY run of each document
    s."signalScopeKey" = 'run:' || (
      SELECT r.id FROM "DocumentExtractionRun" r
      WHERE r."documentId" = d.id AND r."status" IN ('READY','READY_WITH_WARNINGS')
      ORDER BY r."startedAt" DESC LIMIT 1
    )
    -- OR durable signals (filename, human, import) that don't depend on a run
    OR s."signalScopeKey" IN ('filename')
    OR s."signalScopeKey" LIKE 'human:%'
    OR s."signalScopeKey" LIKE 'import:%'
  );
```
La distinction "latest extractor version au sein d'un scope" reste à trancher (cf. §3.12).

### 3.6 `precision` default = `UNKNOWN` (était `MONTH`)

`@default(MONTH)` masquait les bugs parser : un signal créé sans précision explicite recevait `MONTH` par défaut, ce qui donne au consommateur l'illusion d'une donnée vérifiée à la précision mensuelle. **Décision** : `@default(UNKNOWN)`. Le parser doit explicitement déclarer `DAY` quand il a une date complète (`18/09/2024`), `MONTH` quand il n'a que mois+année (`Septembre 2024`), `YEAR` quand il n'a que l'année (`2024`), `RANGE` quand il a `dateStart`+`dateEnd`, `UNKNOWN` par défaut.

### 3.7 La détection .docx body-shape ne mute PAS `Document`

Codex a flaggé un risque : si l'extracteur Phase 2 trouve qu'un .docx est email-like (LOW confidence) et set `Document.sourceKind = EMAIL` avec `sourceDate = null`, alors `base-agent.ts:976` réactive le bug `produit le <uploadedAt>` documenté audit §6.1, mais cette fois sur un doc tagged EMAIL (encore plus crédible visuellement).

**Décision** : un signal `EMAIL_LIKE_WARNING` confidence LOW est créé dans `EvidenceSignal`. **Aucune mutation de `Document`**. Le agent prelude (Phase 5) verra ce warning et pourra l'afficher comme "[Ce document ressemble à un email — date à confirmer]" sans induire en erreur. La promotion vers `Document.sourceKind = EMAIL` n'arrive qu'après validation utilisateur (UI Phase 8) ou détection HIGH confidence dans le mail body (date présente, From présent — déjà couvert par `email-source-inference.ts`).

### 3.8 Tradeoff perte de clé

Cf. audit §7. Si la clé est perdue, `evidenceText`/`valueJson` deviennent illisibles. Mais :
- Les signaux sont **dérivés** : Phase 9 backfill peut tout regénérer si on a encore le texte chiffré qui marche.
- Le chiffrement est aligné avec `Document.extractedText`/`page.artifact` (même clé, même fate) → pas de matrice de risques distincte.
- Les axes indexables (`asOfDate`, `kind`, `confidence`, etc.) restent en clair → les filtres et joins ne sont pas cassés par une perte de clé. Seul le rendu des preuves textuelles est dégradé.

### 3.11 Pourquoi `signalScopeKey` non-null (Codex round 2 P1)

**Problème PostgreSQL** : un index unique sur `(a, b, c)` où l'une des colonnes est nullable considère que `NULL ≠ NULL`. Donc deux lignes avec `(documentId="X", documentVersion=1, extractionRunId=NULL, kind="CAP_TABLE_AS_OF", signalHash="H")` peuvent coexister, même si elles sont conceptuellement identiques. C'est la sémantique du standard SQL, pas un bug.

**Conséquence sur la révision 2** : tous les signaux filename-only, HUMAN_OVERRIDE, IMPORT avec `extractionRunId = NULL` pouvaient être dédupliqués à l'infini. Re-run du parser filename → ligne dupliquée. Re-import idempotent ne fonctionnait pas.

**Fix r3** : introduire `signalScopeKey String` (toujours non-null) avec une convention de nommage :
- `"run:<extractionRunId>"` quand le signal vient d'un run
- `"filename"` (constante) pour les signaux filename-only (le `documentId` est déjà dans le tuple unique, pas besoin de répéter)
- `"human:<overrideId>"` pour HUMAN_OVERRIDE (chaque override a son propre scope)
- `"import:<batchId>"` pour IMPORT (chaque batch backfill a son scope)

Le tuple unique devient `(documentId, documentVersion, signalScopeKey, kind, signalHash)` — **toutes colonnes non-null** → dédup correcte sur tous les producers.

`extractionRunId` reste **uniquement** pour la provenance (debug, audit, cascade quand le run est supprimé). Il n'est plus dans la clé d'unicité.

**Postgres NULL ≠ NULL test à ajouter** (test 1bis §6.1) : tenter d'insérer 2 lignes avec mêmes (documentId, documentVersion, signalScopeKey="filename", kind, signalHash) → la 2e doit échouer. Tenter le même test avec `signalScopeKey="run:X"` → idem.

### 3.12 Read-path latest extractor version — décision déférée (Codex round 2 P2)

**Problème** : §3.4 spec inclut `extractorVersion` dans `signalHash` → un upgrade parser produit une nouvelle ligne pour audit. Mais en Phase 5, le read-path doit choisir quelle version montrer à l'agent. Si v1 et v2 du parser ont produit chacun un signal sur le même run, on a 2 lignes contradictoires.

**3 options à trancher avant Phase 5** :

1. **`isCurrent: Boolean @default(true)`** sur `EvidenceSignal`. Le write-path Phase 2 marque les anciens signaux du même scope/kind à `isCurrent=false` quand il en crée un nouveau. Read-path filtre `WHERE isCurrent = true`. Avantage : simple read. Inconvénient : write-path doit faire un update transactionnel des anciens rows ; risque de drift si crash en milieu de transaction.

2. **`signalBatchId String?`** + table `EvidenceSignalBatch { id, createdAt, extractorVersion, status }` qui regroupe les signaux produits par une exécution donnée du parser. Read-path joint la dernière batch active. Avantage : trace complète des batches. Inconvénient : table supplémentaire, complexité.

3. **Pure SQL read filter** : `MAX(extractorVersion)` par `(documentId, documentVersion, signalScopeKey, kind)`. Pas de nouveau field. Read-path plus complexe (`window function` ou sous-requête). Avantage : zéro overhead write. Inconvénient : read coûteux à grande échelle, requiert `extractorVersion` indexé.

**Recommandation pour Phase 5** : option 1 (`isCurrent`) sauf si on prévoit beaucoup de retroactive corrections — auquel cas option 2.

**Non-bloquant Phase 1** : aucun read-path agent n'existe encore. Phase 2 écrit, Phase 5 lit — la décision peut attendre Phase 5 sans recréer la migration (juste un `ALTER TABLE ADD COLUMN` en Phase 5).

### 3.13 Verrouillage `metadata Json?` en clair (Codex round 2 P2)

**Risque** : `metadata` est un JSON libre en clair, conçu pour stocker des infos techniques (modèle utilisé, version du prompt, related signal ids). Mais sans règle stricte, un futur dev pourrait y stocker un extrait OCR, un prompt complet (qui peut contenir des données sensibles), ou un claim financier brut → contournement silencieux du chiffrement §3.2.

**Invariant Phase 1** (à inscrire en commentaire Prisma + en TypeScript validator) :
> `EvidenceSignal.metadata` NE DOIT JAMAIS contenir :
> - d'extrait textuel OCR brut (utiliser `evidenceText`, chiffré)
> - de prompt LLM complet (utiliser un identifiant `promptVersion: "v3"` + `promptRef: "deck-forensics@2026-05-01"`)
> - de valeur financière brute (utiliser `valueJson`, chiffré)
> - de PII : noms personnes, emails non hashés, IBAN, numéros de carte

**Whitelist autorisée** :
- `{ "modelName": "claude-3-5-sonnet" }` (identifiant générique)
- `{ "promptVersion": "v3" }` (identifiant version, pas le prompt)
- `{ "relatedSignalIds": ["cuid1", "cuid2"] }` (cuids opaques)
- `{ "parserDebug": { "regex": "à\\s+jour\\s+au", "matchCount": 2 } }` (info technique parser)
- `{ "sourceUrl": "https://crunchbase.com/..." }` (URL publique, jamais URL contenant token)

**Enforcement** :
- Type TS strict : `type SignalMetadata = { modelName?: string; promptVersion?: string; relatedSignalIds?: string[]; parserDebug?: Record<string, unknown>; sourceUrl?: string };` — pas de signature open.
- Wrapper d'insertion `createEvidenceSignal()` valide via Zod schema avant écriture.
- Test CI §6.2 #10 : assert qu'aucune ligne en DB de test ne contient de string > 200 chars dans metadata (proxy heuristique pour "extrait OCR/prompt").

---

## 4. Mapping par `kind` — payload et axes temporels (révision 2)

Tous les `valueJson` ci-dessous sont chiffrés à l'écriture (cf. §3.2). Les exemples montrent le **plaintext canonique** avant chiffrement.

| Kind | dateStart | dateEnd | asOfDate | reportedAt | valueJson (plaintext canonique, exemple) | sourceMethod typique | Confidence typique |
|------|-----------|---------|----------|------------|------------------------------------------|----------------------|---------------------|
| `DOCUMENT_DATE` | — | — | ✓ | — | `{"role":"document_date","source":"footer","raw":"Confidential – March 2026"}` | DETERMINISTIC | HIGH (footer) / MEDIUM (filename) |
| `EMAIL_SENT_AT` | — | — | — | ✓ | `{"from":"…","subject":"…"}` | DETERMINISTIC (mirror `Document.sourceDate`) | HIGH |
| `CAP_TABLE_AS_OF` | — | — | ✓ | — | `{"asOf":"2024-09-18","raw":"à jour au 18/09/2024"}` | DETERMINISTIC (OCR `à jour au`) | HIGH |
| `BALANCE_SHEET_AS_OF` | — | — | ✓ | — | `{"asOf":"2025-12-31","currency":"EUR","raw":"Exercice clos le 31/12/2025"}` | DETERMINISTIC | HIGH |
| `FINANCIAL_PERIOD_ACTUAL` | ✓ | ✓ | — | — | `{"start":"2025-01","end":"2025-12","yearsCovered":[2025],"raw":"Période du 01/01/2025 au 31/12/2025"}` | DETERMINISTIC | HIGH |
| `FINANCIAL_PERIOD_FORECAST` | ✓ | ✓ | — | — | `{"start":"2026-01","end":"2030-12","yearsCovered":[2026,2027,2028,2029,2030]}` | DETERMINISTIC | HIGH (en-têtes Excel) / MEDIUM (filename) |
| `ATTACHMENT_RELATION` | — | — | — | ✓ (date du mail) | `{"emailDocId":"…","attachmentName":"Table de capi Septembre 2024 signeģe.png","matchedDocumentId":"…","matchScore":0.92}` | DETERMINISTIC | HIGH si match exact, MEDIUM si normalisé |
| `EMAIL_LIKE_WARNING` | — | — | — | — | `{"reason":"docx_no_header","openingPattern":"Très cher Jean Marc","needsHumanReview":true}` | DETERMINISTIC | **LOW (toujours)** |
| `VALUATION_CLAIM` | — | — | ✓ (date du claim) | — | `{"amount":6000000,"currency":"EUR","postMoney":true,"source":"email_body"}` | LLM ou DETERMINISTIC (term sheet parser) | dépend du parser |
| `METRIC_CLAIM` | — | ✓ (fin de période) | — | — | `{"metric":"ARR","value":3000000,"currency":"EUR","periodEnd":"2025-12-31"}` | LLM | LOW à MEDIUM |
| `STALE_DOCUMENT_WARNING` | — | — | — | ✓ (date de génération du warning) | `{"reason":"cap_table_over_18_months","severity":"medium","staleSince":"2025-09-18"}` | DETERMINISTIC (Phase 7) | HIGH |

**Invariant `EMAIL_LIKE_WARNING`** : ce kind ne contient aucune date. Il ne peut être promu vers `Document.sourceKind = EMAIL` que par une mutation Phase 3 ultérieure et seulement après validation HIGH confidence (header trouvé OU saisie utilisateur). Cf. §3.7.

---

## 5. Migration Prisma

```bash
# Création de la migration
npx prisma migrate dev --create-only --name add_evidence_signal

# Vérification SQL générée (additive, pas de drop)
cat prisma/migrations/<timestamp>_add_evidence_signal/migration.sql

# Application
npx prisma migrate dev
```

Vérifications post-migration :
- `npx tsc --noEmit` clean
- Aucun read-path existant ne réfère à `evidenceSignals` (vérifier `grep -rn "evidenceSignals"`)
- Le client Prisma régénéré expose le type
- Pas de seed à modifier (seed n'a pas de signal initial)

---

## 6. Tests proposés (Phase 1, avant Phase 2 — révision 2)

Pas de service extractor encore. Tests scope strict = schema, contraintes DB, helpers de chiffrement, et un harness pour `signalHash`. Tests applicatifs (extracteur, prelude agent) appartiennent à Phase 2+.

### 6.1 Intégrité — contraintes DB (révision 3)

1. **Unicité du tuple idempotence — scope `"run:<id>"`** : créer 2 signaux avec `(documentId, documentVersion, signalScopeKey="run:R1", kind, signalHash)` identiques → 2e insertion doit lever `Prisma.UniqueConstraintError`.
2. **Unicité — scope `"filename"` (P1 Codex round 2)** : 2 signaux avec `signalScopeKey="filename"`, mêmes autres champs → 2e refuse. **Test critique** : valide que `signalScopeKey` non-null empêche le bypass `NULL ≠ NULL`. Comparer avec ce qui aurait passé en révision 2 (extractionRunId NULL).
3. **Unicité — scope `"human:<id>"` et `"import:<batch>"`** : même test pour les deux autres producers nullables.
4. **Cross-tenant FK Document (P1 Codex round 1)** : Deal A, Deal B, Document D ∈ A. Insertion `EvidenceSignal { documentId=D.id, dealId=B.id, ... }` → composite FK refuse.
5. **Cross-document run FK (P1 Codex round 2)** : Document A, Document B, Run R sur B. Insertion `EvidenceSignal { documentId=A.id, extractionRunId=R.id, ... }` → composite FK `(extractionRunId, documentId) → DocumentExtractionRun(id, documentId)` refuse.
6. **`extractionRunId = NULL` accepté (NULL-safe via MATCH SIMPLE)** : insertion `EvidenceSignal { documentId=A.id, extractionRunId=NULL, signalScopeKey="filename", ... }` → réussit. La FK composite ne s'évalue pas pour cette row (NULL sur extractionRunId).
7. **Cascade Document** : supprimer Document D → ses signaux disparaissent (`COUNT = 0`).
8. **Cascade Deal** : supprimer Deal A (qui contient Document D) → tous les signaux de D disparaissent par cascade transitive.
9. **Cascade ExtractionRun** : créer un signal `{signalScopeKey="run:R", extractionRunId=R}` ; supprimer R → le signal disparaît (le Document reste).
10. **Signal sans extractionRunId survit aux re-runs** : signal `HUMAN_OVERRIDE` avec `extractionRunId=NULL, signalScopeKey="human:O1"` ; créer/supprimer plusieurs runs du doc → le signal manuel persiste.

### 6.2 Confidentialité — aucune fuite en clair (révision 3)

11. **Round-trip `valueJson`** : `encryptJsonField({"amount":1000000})` → insert → re-read → `safeDecryptJsonField()` retourne le payload original.
12. **Round-trip `evidenceText`** : `encryptText("Table de capitalisation à jour au 18/09/2024")` → insert → re-read → `safeDecrypt()` retourne le plaintext.
13. **Aucune substring sensible en clair (P1 Codex round 1)** : dump SQL brut de la row (`SELECT * FROM "EvidenceSignal" WHERE id = $1`) ; assert que la string `"18/09/2024"` n'apparaît dans aucune colonne textuelle SAUF `asOfDate` (qui est une `DateTime` formatée par Postgres). Plus largement : la `evidenceText` raw column doit matcher `/^[A-Za-z0-9+/=]+$/` (base64) ou ressembler à un envelope JSON `{"_enc":...}`.
14. **Stabilité du chiffrement à indexer** : insérer le même `valueJson` plaintext deux fois (via deux encryptions distinctes — IV différents) ; chaque envelope est différente. Mais `signalHash` (calculé sur le plaintext canonique AVANT chiffrement) est identique → la contrainte d'unicité catch le doublon malgré l'envelope distincte.
15. **`metadata` strict (P2 Codex round 2)** : insertion avec metadata `{ "modelName": "claude-3-5-sonnet" }` accepté ; insertion avec `{ "rawOcr": "Table de capitalisation à jour au 18/09/2024" }` rejetée par le Zod validator de `createEvidenceSignal()` (string > 200 chars OU mot-clé OCR/extracted/text/prompt). Test au niveau service, pas au niveau DB.

### 6.3 Lifecycle — re-extraction et versions (révision 3)

16. **Re-extraction même `extractorVersion`, même run** : extracteur v1 produit signal S sur run R1. Re-appel de `createEvidenceSignal()` avec mêmes paramètres → contrainte unique catch, retourne le row existant. **Idempotence write-path.**
17. **Re-extraction même `extractorVersion`, nouveau run** : extracteur v1 produit S sur run R1, puis S' (même plaintext) sur run R2. `signalScopeKey` passe de `"run:R1"` à `"run:R2"` → 2 rows distinctes. Au read, on filtre par scope du dernier run.
18. **Re-extraction `extractorVersion` upgrade, même run** : extracteur v1 → S sur run R. Extracteur v2 → S' (même plaintext, `extractorVersion` change → `signalHash` change) sur même run R. `signalScopeKey="run:R"` identique mais `signalHash` distinct → 2 rows distinctes. Audit trail conservé.
19. **`documentVersion` bump** : Document passe v1 → v2 (F62). Signaux v1 restent en base avec `documentVersion=1`, signaux v2 sont créés par re-run d'extraction sur v2. Au read, on filtre `WHERE documentVersion = doc.version`.

### 6.4 `signalHash` — stabilité canonique

20. **Permutation des clés `valueJson`** : `signalHash({"asOf":"2024-09-18","raw":"…"})` === `signalHash({"raw":"…","asOf":"2024-09-18"})`. Garanti par le canonical JSON (clés triées).
21. **Normalisation Unicode** : `signalHash` de `"été"` (composé) === `signalHash` de `"été"` (précomposé). Garanti par `.normalize("NFC")`.
22. **`extractorVersion` change le hash** : `signalHash({extractorVersion:"v1",...})` !== `signalHash({extractorVersion:"v2",...})` avec tous les autres paramètres identiques.

### 6.5 Hors-scope Phase 1, mais à ajouter en parallèle (P1 Codex round 1)

23. **`base-agent.ts:976` ne label plus un FILE non daté comme "produit le `<uploadedAt>`"** : test agent qui injecte un Document FILE avec `sourceDate=null, receivedAt=null, uploadedAt=2026-05-17` et vérifie que le header rendu **ne contient pas** la string `produit le 17/05/2026`. Ce test appartient à la fix code (cf. §10 — quick fix indépendant) mais doit exister AVANT que Phase 2 ne pousse plus de signaux qui s'attendent à un prelude propre.

---

## 7. (déplacé en §11 — révision 2) Hors-scope Phase 1

Le contenu de cette section a été déplacé en §11 pour conserver l'ordre logique : hors-scope rappelé tout à la fin, après le diff vs plan initial (§9) et la dépendance quick fix (§10).

---

## 8. Questions ouvertes pour Codex (révision 3)

1. **Composite FK doubles** : OK Prisma supporte. À valider en revue de la migration que les 2 contraintes (Document + ExtractionRun) sont posées avec `MATCH SIMPLE` (default — important pour le NULL-safe sur `extractionRunId`).
2. **`signalScopeKey` format** : convention libre `"<producer>:<id>"`. Faut-il enforcer le format via Zod validator au write ? Recommandation : oui, dans le service `createEvidenceSignal()` Phase 1. Évite les producers fantôme `"runn:X"`, `"Run:X"` qui contourneraient l'unicité par typo.
3. **`extractionRunId` cascade vs SET NULL** : choix actuel = cascade. Cohérent avec "signal d'un run supprimé = signal obsolète". À revoir si on veut conserver l'audit même après cleanup des runs.
4. **`extractorVersion` format** : string libre `"temporal-extractor@2026-05-17-001"`. Enum forcerait une migration à chaque release. Convention nommage à figer en Phase 2.
5. **Indexer `[extractorVersion]`** pour faciliter le re-run sélectif (purge signaux d'un parser donné, re-générer) ? Recommandation : pas en Phase 1, à ajouter si Phase 9 en a besoin.
6. **`signalHash` algo** : SHA-256 retenu. Sécurité collision OK jusqu'à 50M rows (proba <10⁻¹⁵).
7. **Read-path latest extractor version** : cf. §3.12, 3 options listées (`isCurrent`, `signalBatchId`, pure SQL filter). **Décision déférée Phase 5**, non-bloquante Phase 1.
8. **Test 13 (aucune substring sensible en clair)** : test unitaire dans PR Phase 1 + check manuel en revue. Pas de scan CI permanent (overkill).
9. **`metadata` Zod schema** : version stricte ferme la liste des keys (whitelist). Faut-il prévoir une key `extension: Record<string, unknown>` pour les besoins futurs ? Recommandation : non, plutôt ajouter une nouvelle key au schéma quand le besoin émerge — force la review.
10. **Sécurité ownership** : le filtre `WHERE dealId = $1 AND userId match` côté Clerk reste appliqué côté `Deal` ou `Document`. La composite FK garantit que `dealId` du signal === `dealId` du document parent → un read filtré par `dealId` ne fuite jamais un signal d'un autre tenant. Idem la composite FK extractionRunId garantit pas de fuite cross-document via run mal référencé.
11. **Volume** : à 1500 signaux/deal × 1000 deals = 1.5M rows. Acceptable sur Neon. À ré-examiner si on atteint 50M.

---

## 9. Diff vs proposition initiale du plan utilisateur (révision 3)

| Plan utilisateur | Cette proposition r3 | Pourquoi le diff |
|------------------|-----------------------|------------------|
| `confidence: number` | `confidence: enum HIGH/MEDIUM/LOW` | Alignement avec code existant. Pas de fausse précision. |
| Pas de `documentVersion` | `documentVersion: Int` explicite | Permet d'invalider les signaux quand un doc passe en version 2 (`F62`). |
| Pas de `extractionRunId` | `extractionRunId String?` + composite FK + cascade | Provenance + cross-document run integrity (Codex r1+r2). |
| Pas de `signalScopeKey` | `signalScopeKey String` NON-NULL | Bypass NULL ≠ NULL Postgres impossible pour signaux filename/human/import. **Codex r2 P1**. |
| Pas de `extractorVersion` | `extractorVersion String` obligatoire | Inclus dans `signalHash` (upgrade parser → nouvelle ligne). Codex r1 P2. |
| Pas de `sourceTextHash` | `sourceTextHash String?` | Phase 9 backfill incrémental. |
| Pas de `signalHash` | `signalHash` + unique key composite + spec canonique §3.4 | Idempotence forte. Codex r1 P2. |
| `dealId` + `documentId` indépendants | **FK composite `(documentId, dealId) → Document(id, dealId)`** + `@@unique([id, dealId])` ajouté sur Document | Empêche cross-tenant leak. **Codex r1 P1**. |
| `extractionRunId` simple FK | **FK composite `(extractionRunId, documentId) → DocumentExtractionRun(id, documentId)`** + `@@unique([id, documentId])` ajouté sur DocumentExtractionRun | Empêche cross-document run pointer. **Codex r2 P1**. |
| Pas de question sur le chiffrement | §3 tranché — **les deux fields chiffrés**, axes indexables en clair | Cohérent doctrine Phase 3 errors.md. Codex r1 P1. |
| `precision @default(MONTH)` | `precision @default(UNKNOWN)` | `MONTH` masquait les bugs parser. Codex r1 P2. |
| `.docx → sourceKind = EMAIL` | `EMAIL_LIKE_WARNING` (signal-only, ne mute pas `Document`) | Évite de réactiver bug `base-agent.ts:976`. Codex r1 P2. |
| `metadata Json` ouvert | **`metadata Json?` clair MAIS schéma Zod strict en service-layer + invariant docs + test #15** | Verrouille le risque de stockage OCR/prompt/claim brut. Codex r2 P2. |
| `sourceMethod String` | Enum strict | Évite "deterministic" vs "Deterministic" vs "regex". |
| Pas de `charOffset` | `charOffset Int?` optionnel | Permet à Phase 5 de re-pointer vers l'extraction text. |
| Pas de notion de read-path latest version | §3.12 décision déférée Phase 5 — 3 options listées | Codex r2 P2. Non-bloquant Phase 1. |

---

## 10. Dépendance hors-scope — quick fix bug `base-agent.ts:976`

L'audit §6.1 documente que `base-agent.ts:976-978` écrit `produit le <uploadedAt>` quand `sourceDate`/`receivedAt` sont null. Sur les 20 docs du sample, 15 reçoivent un label faux. Cette fix est :

- **Out-of-scope Phase 1** (Phase 1 = uniquement la table `EvidenceSignal`).
- **Pré-requis recommandé Phase 2** : si Phase 2 commence à pousser des signaux temporels propres, l'agent doit déjà ne plus mentir sur la date "produit le". Sinon on a une UI hybride incohérente : l'evidence ledger dit "asOf 2024-09-18", mais le header dit "produit le 2026-05-17".

**Proposition de fix (3 lignes, ~10 min)** :

```diff
- const producedAtLabel = this.formatDocumentDate(doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt);
+ const trueProducedAt = doc.sourceDate ?? doc.receivedAt ?? null;
+ const producedAtLabel = trueProducedAt ? this.formatDocumentDate(trueProducedAt) : "date inconnue";
  const importedAtLabel = this.formatDocumentDate(doc.uploadedAt);
- text += `\n### ${sanitizedDocName} (${sourceKindLabel}, ${sanitizedDocType}) — produit le ${producedAtLabel}, importé le ${importedAtLabel}\n`;
+ text += `\n### ${sanitizedDocName} (${sourceKindLabel}, ${sanitizedDocType}) — produit le ${producedAtLabel}, importé le ${importedAtLabel}\n`;
```

Idem dans `getDocumentChronologyMs` (ligne 1065) : retourner `null`/`Infinity` quand pas de date source, pour que le tri ne mente plus sur la chronologie. Stratégie de tri à clarifier : remonter ces docs "date inconnue" en début ou en fin de liste ? Recommandation : à la fin (les docs datés sont plus exploitables).

**À tracker comme entrée `errors.md` séparée** (catégorie CONTEXT-ENGINE). Non bloquant pour le greenlight Phase 1, mais bloquant pour Phase 2 si on veut éviter des résultats agents incohérents.

---

## 11. Hors-scope Phase 1 (rappel — révision 2)

Pour éviter les dérapages, **rien de ce qui suit n'est dans Phase 1** :
- Extracteur temporel (Phase 2)
- Mutation de `Document.sourceDate` ou `Document.sourceKind` (Phase 3 — y compris la promotion EMAIL_LIKE → EMAIL après validation)
- Détection email ↔ pièces (Phase 4)
- Prelude agent revisité (Phase 5)
- Claims financiers structurés (Phase 6)
- Warnings de fraîcheur (Phase 7)
- UI corpus timeline (Phase 8)
- Backfill (Phase 9)

Phase 1 = **uniquement** : migration Prisma, génération du client, tests §6.1-§6.4, et — **séparément mais en parallèle** — le quick fix §10 du bug base-agent.
