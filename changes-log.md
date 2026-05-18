# Changes Log - Angel Desk

---
## 2026-05-17 — Evidence Engine Phase 0 (audit) + Phase 1 (proposition schéma) — read-only

### Contexte
Démarrage du chantier "Evidence Intelligence Layer" : passer d'un stockage de texte OCR brut à des signaux structurés (temporels, provenance, claims, freshness), pour que les agents reçoivent un contexte daté/typé/auditable plutôt que des dumps de texte. Plan en 9 phases (cf. message produit), exécution vertical-slice avec gates Codex entre chaque.

### Action — Phase 0 (premier pass, metadata-only)
- Cartographie code Evidence existant : `evidence-ledger/index.ts`, `corpus/index.ts`, `corpus/integrity.ts`, `documents/email-source-inference.ts`, `document-context-retriever.ts`, `extract-email-metadata.ts`, schéma Prisma Document + DocumentExtractionPage + sourceMetadata.
- Script audit lecture seule : `scripts/debug/audit-evidence-deals.mjs` (3 deals : Avekapeti, FurLove, E4N — 20 docs au total).
- Premier pull Vercel env : `DOCUMENT_ENCRYPTION_KEY` est marquée `Sensitive` → `vercel env pull` et `vercel env run` retournent `""` pour preview ET production. Pivot vers audit metadata-only.
- Livrable : `docs-private/evidence-engine-audit.md`.

### Action — Phase 0 (second pass, content-level avec déchiffrement)
- Sacha a fourni la vraie clé hors-conversation dans `.env.vercel.audit` (jamais affichée, jamais commitée, supprimée à la fin).
- Script enrichi avec déchiffrement AES-256-GCM inline (mirror `src/lib/encryption.ts`). Run sur les 20 docs des 3 deals.
- Gates Codex re-vérifiés content-level (extraits courts dans l'audit) :
  - (a) cap table Avekapeti `"Table de capitalisation à jour au 18/09/2024"` ✓ CONFIDENT
  - (b) BP Avekapeti = monthly 2025-2026, **PAS 2026-2030** comme attendu ; le forecast 5y est dans FurLove `Fur-Love-2026-2030-Sept-2025` et E4N `Model Output Extract` + `Financial Model vFinal.xlsx`
  - (c) deck Avekapeti = 12 années distinctes sans footer date ✓ CONFIDENT
  - (d) emails .pdf datés ✓ CONFIDENT ; emails .docx (Mail - 22:01:26.docx FurLove, Message e4n.docx E4N) restent `sourceDate=null` faute de header dans le .docx — corps commence par "Très cher Jean Marc" / "Hello Eryck"
- Findings nouveaux ajoutés à l'audit : (1) footer deck E4N/NETGEM `"<Company> Confidential – <Month> <YYYY>"` répété 32x = DOCUMENT_DATE déterministe ignoré aujourd'hui, (2) bilan FurLove `"Période du 01/01/2025 au 31/12/2025"` / `"Exercice clos le 31/12/2025"` = BALANCE_SHEET_AS_OF + FINANCIAL_PERIOD_ACTUAL déterministes, (3) Mail.pdf Avekapeti cite verbatim le filename `"Table de capi Septembre 2024 signeģe.png"` → ATTACHMENT_RELATION trivial, (4) Mail.pdf Avekapeti contient `"6M€"` + `"405k€ de CA vs 270k en mars 2025"` = trois claims structurables.

### Action — Phase 1
- Livrable : `docs-private/evidence-engine-phase1-schema.md`. Proposition de table dédiée `EvidenceSignal` avec champs (kind enum 10 valeurs, valueJson, dateStart/dateEnd/asOfDate/reportedAt, precision/confidence/sourceMethod enums, evidenceText + pageNumber/sheetName/charOffset, signalHash pour idempotence). Justifications : indexabilité, cycle de vie aligné sur `Document.version`, chiffrement uniforme `evidenceText`+`valueJson` via `encryptText`/`encryptJsonField` existants.
- Mise à jour post-content-pass : addendum "Patterns déterministes confirmés content-level" avec regex candidates pour Phase 2 (cap_table `à jour au`, deck footer `Confidential – <Month> <YYYY>`, bilan `Période du … au …` / `Exercice clos le`, forecast columns `\b20\d{2} 20\d{2} 20\d{2} 20\d{2} 20\d{2}\b`, attachment filename match, body-shape email-like heuristic).
- Pas d'implémentation : uniquement la proposition pour challenge Codex.

### État
- 0 code applicatif modifié. 0 migration créée.
- 2 docs ajoutés sous `docs-private/`. 1 script ajouté sous `scripts/debug/` (non commité).
- `.env.vercel.audit` créé puis supprimé deux fois (1er pass = vide ; 2nd pass = clé valide fournie par Sacha, supprimé après usage). Confirmé gitignored par `.env*` à `.gitignore:35`.
- Tasks Phase 0 + proposition Phase 1 = done. Attente review Codex avant Phase 2 (temporal extractor déterministe).

### Risque OPS découvert
- `DOCUMENT_ENCRYPTION_KEY` Sensitive Vercel → irrécupérable via CLI. Source primaire unique = secrets manager Sacha. Si perdue + Vercel reset = corpus historique illisible. Recommandation §7.3 audit : documenter dans runbook + ne JAMAIS régénérer sans migration coordonnée + envisager secondary holder.

### Action — Phase 0.5 (corrections post-review Codex)
Review Codex round 1 a flaggé 4 P1 + 3 P2 :
- **P1 audit rate chemin base-agent** : `src/agents/base-agent.ts:976-978` écrit `produit le <sourceDate ?? receivedAt ?? uploadedAt>` ; ligne 1065 trie pareil. Sur 15/20 docs sans sourceDate du sample, le label "produit le" = `uploadedAt` (= date d'upload masquerade comme date de production). Bug context engine actif, pas juste "manque de metadata". Audit §1 TL;DR item #2 réécrit + §6 entièrement refondu pour distinguer les 2 chemins (base-agent principal + document-context-retriever secondaire) + tableau preuves doc-par-doc des 14 dates fausses.
- **P1 schema cross-tenant** : `EvidenceSignal` avait `dealId` + `documentId` indépendants → un signal pouvait référencer `dealId=A, documentId=B-de-deal-Z`. Corrigé via FK composite `Document(id, dealId)` + `@@unique([id, dealId])` ajouté sur `Document`. Test 2 §6.1 ajouté pour le scénario d'attaque.
- **P1 schema lifecycle** : `documentVersion` seule trop faible. Ajout `extractionRunId String?` (cascade depuis `DocumentExtractionRun`), `extractorVersion String` (capté dans `signalHash` → upgrade parser = nouvelle ligne), `sourceTextHash String?` (Phase 9 incrémental). Tuple unique devient `(documentId, documentVersion, extractionRunId, kind, signalHash)`. §3.5 explicite 2 scénarios (même run / nouveau run, même parser / nouveau parser).
- **P1 schema chiffrement contradictoire** : §1 disait clair, §3 disait chiffrer. Tranché : `evidenceText` ET `valueJson` chiffrés, axes indexables (`asOfDate`, `kind`, `confidence`, etc.) restent en clair. `signalHash` calculé sur plaintext canonique AVANT chiffrement. Tableau §1 + §3.1-§3.3 réécrits.
- **P2 signalHash spec** : §3.4 spec déterministe complète avec `canonicalJSONStringify` (clés triées), `.trim().normalize("NFC")` sur evidenceText, `extractorVersion` inclus, `sourceTextHash` exclu (redondance). Tests §6.4 ajoutés (permutation clés, normalisation Unicode, extractorVersion change le hash).
- **P2 precision default** : changé `@default(MONTH)` → `@default(UNKNOWN)`. §3.6 explique pourquoi (default masquait les bugs parser).
- **P2 .docx body-shape** : nouvelle enum `EMAIL_LIKE_WARNING` (signal-only, confidence LOW). N'écrit JAMAIS `Document.sourceKind = EMAIL`. §3.7 explique le risque (réactivation du bug base-agent §6.1 sur des docs tagged EMAIL faussement) et la décision. Promotion vers `Document` reportée à Phase 3 après validation HIGH ou saisie utilisateur.
- **Tests étendus** : §6.1-§6.5 — intégrité DB (incluant test cross-tenant FK), confidentialité (incluant dump SQL brut + assert aucune substring sensible), lifecycle (re-extraction même/nouveau parser), `signalHash` stabilité canonique, et test out-of-scope #17 pour `base-agent.ts:976` non-fix.
- **Quick fix base-agent ajouté §10** : diff 3 lignes (`sourceDate ?? receivedAt ?? null` au lieu de `?? uploadedAt`, render "date inconnue" si null). Pré-requis recommandé Phase 2. Trackable comme entrée `errors.md` séparée catégorie CONTEXT-ENGINE.

### État Phase 0.5
- 0 code applicatif modifié. Toujours 0 migration créée.
- 2 docs modifiés sous `docs-private/` :
  - `evidence-engine-audit.md` : §1 + §6 réécrits (révision 2)
  - `evidence-engine-phase1-schema.md` : §1, §2, §3, §4, §6, §7, §8, §9 réécrits + nouveau §10 quick fix + §11 hors-scope (révision 2)
- Tasks Phase 0.5 = done. Re-soumission Codex round 2.

### Action — Phase 0.6 (corrections post-review Codex round 2)
Review Codex round 2 a flaggé 2 P1 SQL + 2 P2 docs avant greenlight Phase 1 migration :
- **P1 NULL ≠ NULL Postgres unique constraint** : `@@unique([documentId, documentVersion, extractionRunId, kind, signalHash])` ne dédupliquait pas les signaux `extractionRunId=NULL` (filename, HUMAN_OVERRIDE, IMPORT) car Postgres traite NULL comme distinct. Corrigé par ajout d'un champ `signalScopeKey String` non-null avec convention `"run:<id>" | "filename" | "human:<id>" | "import:<batch>"`. Tuple unique devient `(documentId, documentVersion, signalScopeKey, kind, signalHash)` — toutes colonnes non-null. `extractionRunId` reste champ FK de provenance uniquement. §3.11 explique le problème + le fix. Tests #2 et #3 §6.1 ajoutés pour les scopes nullables.
- **P1 cross-document run integrity** : la FK simple `extractionRunId → DocumentExtractionRun(id)` permettait `documentId=docA + extractionRunId=runOfDocB`. Corrigé par composite FK `(extractionRunId, documentId) → DocumentExtractionRun(id, documentId)` + ajout `@@unique([id, documentId])` sur `DocumentExtractionRun`. Postgres MATCH SIMPLE (default) tolère `extractionRunId=NULL` sans contraindre `documentId`. Test #5 §6.1 ajouté pour le scénario d'attaque cross-doc.
- **P2 read-path latest extractor version** : non-bloquant Phase 1. Décision déférée Phase 5 en §3.12 avec 3 options listées (`isCurrent` flag, `signalBatchId` table dédiée, pure SQL filter sur `MAX(extractorVersion)`). Recommandation `isCurrent` sauf si beaucoup de retroactive corrections. Migration Phase 5 = simple ALTER TABLE ADD COLUMN.
- **P2 `metadata` Json en clair verrouillée** : §3.13 + commentaire Prisma + Zod schema TypeScript strict whitelist (`modelName?`, `promptVersion?`, `relatedSignalIds?`, `parserDebug?`, `sourceUrl?`). Service `createEvidenceSignal()` valide via Zod avant écriture. Test #15 §6.2 ajouté (rejette `{rawOcr: "..."}`, accepte `{modelName: "..."}`).

### État Phase 0.6
- 0 code applicatif modifié. Toujours 0 migration créée.
- 1 doc modifié sous `docs-private/` :
  - `evidence-engine-phase1-schema.md` : §1 + §2 + §3 (+§3.11, §3.12, §3.13) + §6 + §8 + §9 mis à jour (révision 3).
- Tasks Phase 0.6 = done. Re-soumission Codex round 3 pour greenlight final Phase 1 implementation (migration + tests).

### Action — Phase 1 implementation (greenlight Codex round 3)
Codex a greenlighté la révision 3 du schéma (2 remarques mineures non-bloquantes traitées : §3.4 phrase périmée corrigée, prisma validate vérifié).

**Migration Prisma**
- `prisma/schema.prisma` : EvidenceSignal model (35 lignes) + 4 enums + 2 composite uniques (`Document(id, dealId)` et `DocumentExtractionRun(id, documentId)`) + relations.
- `prisma/migrations/20260517160000_add_evidence_signal/migration.sql` : 81 lignes, écrite à la main depuis `prisma migrate diff` (DIRECT_URL Neon initialement endormi, retry après wake-up a réussi). Inclut explicitement les 2 FK composites (MATCH SIMPLE default — confirmé `match_option = NONE` côté Postgres post-deploy, NULL-safe pour `extractionRunId`).
- `npx prisma generate` → client régénéré.
- `npx prisma migrate deploy` → appliqué sur prod Neon. Script `scripts/debug/inspect-evidence-signal-schema.mjs` confirme les 2 FK composite + les 3 UNIQUE INDEXES post-migration.

**Service layer** (`src/services/evidence-signals/`)
- `canonical-json.ts` : `canonicalJSONStringify()` tri récursif des clés.
- `signal-hash.ts` : `computeSignalHash()` (SHA-256 sur canonical JSON + NFC + extractorVersion + anchors).
- `metadata-schema.ts` : Zod whitelist stricte (`modelName? promptVersion? relatedSignalIds? parserDebug? sourceUrl?`) + check anti-fuite (regex sensitive patterns + max 200 chars par string).
- `create-signal.ts` : `createEvidenceSignal()` valide scopeKey/metadata, calcule hash sur plaintext canonique AVANT chiffrement, encryptText/encryptJsonField, insert Prisma. `validateSignalScopeKey()` enforce le format `run:<id>|filename|human:<id>|import:<batch>` + cohérence avec `extractionRunId`.

**Tests** (`src/services/evidence-signals/__tests__/`) — 5 fichiers, 51 tests, 50 pass + 1 skip (le skip = la suite DB intégration quand `SKIP_DB_TESTS=1`)
- `signal-hash.test.ts` (16 tests) — tests §6.4 #14, #20, #21, #22 + déterminisme, sha256, anchors, sourceTextHash exclus.
- `metadata-schema.test.ts` (10 tests) — test §6.2 #15 + whitelist strict + sensitive patterns.
- `scope-key.test.ts` (13 tests) — format scope, mismatch run/extractionRunId, casse/typos rejetées.
- `encryption-roundtrip.test.ts` (7 tests) — tests §6.2 #11, #12, #13, #14 (round-trip + envelopes distinctes + plaintext non leaké).
- `db-integration.test.ts` (13 tests, run contre Neon prod, ~23s) — tests §6.1 + §6.3 : unicité scope run/filename/human/import (P1 Codex r2 NULL≠NULL), cross-tenant FK refusée, cross-doc run FK refusée, MATCH SIMPLE NULL-safe, cascade run, signal sans run survit, dump SQL sans plaintext, re-extraction même/nouveau parser. Skip via `SKIP_DB_TESTS=1`.

**Quick fix base-agent.ts:976** (parallèle, hors-scope Evidence Engine mais pré-requis Phase 2 — audit §6.1 + §10 schema)
- Patch 3 lignes : `producedAtLabel = sourceDate ?? receivedAt ?? null` (au lieu de `?? uploadedAt`). `formatDocumentDate(null)` rend déjà "date inconnue". `getDocumentChronologyMs` retourne `Number.MAX_SAFE_INTEGER` quand pas de source date → docs non datés vont à la fin du tri chronologique.
- Test `src/agents/__tests__/base-agent-date-rendering.test.ts` (4 tests, §6.5 #23) : confirme "date inconnue" pour FILE sans source, fallback sourceDate / receivedAt, tri qui remonte les datés en premier.
- Entrée `errors.md` 2026-05-17 catégorie CONTEXT-ENGINE.

### État Phase 1 implementation
- Migration Prisma appliquée sur Neon prod. Contraintes DB vérifiées par les 13 tests d'intégration.
- 50/50 unit tests pass. 4/4 base-agent tests pass.
- `npx tsc --noEmit` clean (hors erreurs Next.js générées préexistantes).
- 0 régression : tests existants non touchés.
- Tasks Phase 1 = done. Stop pour audit Codex de la migration SQL + tests + fix base-agent. Pas de Phase 2 extracteur tant que l'audit n'a pas validé.

### Action — Phase 1.1 (corrections post-review Codex round 4)
Codex a validé migration SQL + schéma Prisma + quick fix base-agent, mais a flaggé 2 P1 + 2 P2 sur le service layer avant Phase 2 :

- **P1 idempotence** : `createEvidenceSignal()` faisait `prisma.evidenceSignal.create()` direct → throw P2002 sur duplicate. Phase 2 retry Inngest aurait cassé. Fix : try/catch sur `Prisma.PrismaClientKnownRequestError code === "P2002"` → `findUnique` sur le tuple `documentId_documentVersion_signalScopeKey_kind_signalHash` → return existing row. Nouvelle signature `{ signal, deduplicated: boolean }`. Tests db-integration 1/2/3a/3b réécrits ("returns existing row, no throw"). Nouveau test 1b "3 appels concurrents même payload → 1 row, 2 dédup".
- **P1 metadata deep-walk** : le validateur cherchait les sensitive patterns SEULEMENT sur strings → arrays/numbers contournaient. Confirmé par Codex : `{ parserDebug: { rawOcr: ["..."] } }`, `{ parserDebug: { amountEur: 6000000 } }`, `{ parserDebug: { promptBody: ["..."] } }` passaient. Fix double couche : (1) `parserDebug` devient un schéma Zod **strict whitelist** (`regex` / `patternId` / `matchCount` / `pageSpan` / `timingMs` / `notes` typés et bornés, plus de `Record<string, unknown>`), (2) deep-walk qui descend dans arrays/objets et check les sensitive **keys** ET **strings** quel que soit le type. Tests metadata 18 (3 cas critiques Codex en array/number/promptBody-array + strict whitelist + length caps + defense-in-depth).
- **P2 canonical NFC values** : `canonicalJSONStringify` triait les clés mais ne normalisait pas les strings imbriquées dans `valueJson`. Composé/précomposé produisait 2 hashes. Fix : NFC normalize toutes les string values lors de la canonicalisation récursive. Tests signal-hash 21b/21c/21d (string value imbriquée, récursive, arrays).
- **P2 signalHash parts ambigu** : `parts.join("|")` permettait des collisions si un part contenait `|`. Fix : `sha256(JSON.stringify(parts))` au lieu de concat — chaque part est encodé sans ambiguïté. Test "no | delimiter ambiguity" ajouté.

**Bonus** : pour éviter les flaky tests sur Neon cold endpoint, ajouté `{ timeout: 30_000 }` au niveau des 3 describes db-integration (au lieu du default 5s vitest).

### État Phase 1.1
- 4 fichiers source modifiés : `canonical-json.ts`, `signal-hash.ts`, `metadata-schema.ts`, `create-signal.ts` (+ `index.ts` pour exporter `CreateEvidenceSignalResult`).
- Tests : 63/63 unit pass (de 50 à 63 par ajouts), 14/14 DB integration pass (de 13 à 14 par ajout du test 1b concurrence).
- `npx tsc --noEmit` clean.
- 0 régression : tests existants non touchés.
- Tasks Phase 1.1 = done. Re-soumission Codex round 5 pour greenlight Phase 2 (temporal extractor déterministe).

### Action — Phase 1.2 (correction post-review Codex round 5)
Codex round 5 a validé tout SAUF un dernier P1 confidentialité :
- **P1 `parserDebug.notes` reste un texte libre 200 chars** : le validator round 4 acceptait `{ parserDebug: { notes: "Table de capitalisation à jour au 18/09/2024" } }` car `notes` était optionnel string ≤ 200 chars et le texte ne match aucun sensitive pattern. Porte dérobée possible pour un extracteur Phase 2 qui mettrait accidentellement un extrait OCR court dans metadata.notes.

**Fix** : suppression complète du field `notes` du `parserDebug` schema. Toute note humaine doit aller dans `evidenceText` (chiffré). Bonus : `patternId` resserré de `z.string().max(80)` à `z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)` pour empêcher d'y stocker du texte libre via cette autre porte. Commentaire explicite dans le schéma : "intentionally NO free-text field here — any human-readable note must go in evidenceText (encrypted), never in metadata (clear)".

**Tests** :
- "rejette parserDebug.notes (champ supprimé)" → vérifie que l'ancien field est désormais unrecognized_key
- "un extrait OCR court qui ne match pas les patterns sensibles n'a plus de porte dérobée" → reproduit exactement le payload Codex
- "patternId est un slug, pas du texte libre" → reproduit l'attaque alternative via `patternId`
- Anciens tests deep-walk défense-in-depth migrés vers `regex` et `modelName` (qui restent strings whitelistées).

### État Phase 1.2
- 1 fichier source modifié : `metadata-schema.ts` (suppression `notes` + slug `patternId`).
- 1 fichier test mis à jour : `metadata-schema.test.ts` (+1 test net : 18 → 19).
- Tests : 64/64 unit pass (+1 par ajout des tests Codex round 5), 14/14 DB integration pass.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 1.2 = done. Re-soumission Codex round 6 pour greenlight Phase 2.

## 2026-05-18 — Evidence Engine Phase 2 (temporal extractor déterministe) — code

### Contexte
Codex round 6 a greenlité Phase 2. Implémentation du temporal extractor déterministe + persistance via createEvidenceSignal, **sans aucune mutation de Document.sourceDate/sourceKind** (réservé Phase 3).

### Action
- `src/services/evidence/temporal-extractor.ts` (363 lignes) : fonction pure `runTemporalExtractor(input)` qui exécute 7 extracteurs déterministes :
  1. **EMAIL_SENT_AT** : mirror `documentSourceDate` quand `sourceKind=EMAIL` (HIGH confidence, DAY precision)
  2. **CAP_TABLE_AS_OF** : regex `(?:Table de capitalisation|cap.?table)…(?:à|a) jour au DD/MM/YYYY` avec flag `u` + alternance accentuée (workaround `\b` JS non-Unicode) → HIGH DAY
  3. **FINANCIAL_PERIOD_ACTUAL + BALANCE_SHEET_AS_OF (FR)** : `Période du DD/MM/YYYY au DD/MM/YYYY` + `Exercice clos le … DD/MM/YYYY` (lazy `[\s\S]{0,80}?` pour matcher date sur ligne suivante)
  4. **FINANCIAL_PERIOD_ACTUAL (EN)** : `For the X months ended <date>`
  5. **FINANCIAL_PERIOD_FORECAST** : 4+ années consécutives en en-tête colonne (`2026 2027 2028 2029 2030`, `Dec-26 Dec-27 ... Dec-30`, `FY2026 ... FY2030`) avec dédup par year-key
  6. **DOCUMENT_DATE depuis footer** : `(?:Confidentiel|Confidential)(\s+[A-Z]\w*){0,3}?\s*[–\-—]\s*<Month> <Year>` (allow optional company name comme NETGEM) → HIGH MONTH
  7. **DOCUMENT_DATE depuis filename** : `<Month-or-numeric><sep><Year>` MEDIUM MONTH — **anti-naïveté guards** : skip si plusieurs années distinctes dans le filename (ambiguïté), skip si PITCH_DECK avec > 3 années distinctes dans extractedText (cf. deck Avekapeti multi-année), **skip si une DOCUMENT_DATE HIGH existe déjà** (anti-shadow filename sur footer)
- Discipline `parserDebug` (Codex round 6) : `regex` field non-utilisé (seulement `patternId` + `matchCount`). Matched text → `evidenceText` chiffré ≤ 280 chars. `patternId` est un slug enforcé `[a-zA-Z0-9_-]+`.
- `src/services/evidence/persist-temporal-signals.ts` (80 lignes) : maps `derivedFrom` au signalScopeKey via switch explicite — `extracted_text` → `run:<id>`, `filename` → `filename`, `source_metadata` → `source_metadata` (cf. Phase 2.1 P2 Codex r7). Skip propre (pas de throw) si `extracted_text` sans extractionRunId. Retourne `{ persisted, deduplicated, skipped, skippedReasons }`.
- `src/services/evidence/index.ts` : exports publics.
- `TEMPORAL_EXTRACTOR_VERSION = "temporal-extractor@2026-05-18-001"` — utilisé dans signalHash pour le versioning lifecycle.

### Tests
- `src/services/evidence/__tests__/temporal-extractor.test.ts` (19 tests) :
  - Gates Codex (a/c/d audit) : cap table Avekapeti HIGH, deck Avekapeti multi-année → pas de DOCUMENT_DATE, BP Avekapeti 2025-2026 → pas de forecast (seulement 2 années consécutives), forecast 2026-2030 sur FurLove + E4N Dec-YY + FY-YYYY
  - Gate Codex bilans FR (Période du / Exercice clos le) + EN (For the X months ended) sur FurLove
  - Gate Codex anti-naïveté : filename avec plusieurs MONTH-YEAR pairs (genuinely ambiguous) rejected, PITCH_DECK avec text multi-année rejected, filename MEDIUM ne shadow pas footer HIGH. NB : un filename avec bare years + UN seul month-year (ex. `Fur-Love-2026-2030-Sept-2025`) émet le DOCUMENT_DATE du month-year (Sept-2025) ; les bare years sont traités par le forecast extractor.
  - Gate Codex discipline parserDebug : pas de `regex` field, `patternId` slug, evidenceText ≤ 280 chars
  - Bouquet réaliste email Avekapeti : pas de faux positif sur claims dans email body
- `src/services/evidence/__tests__/temporal-extractor-integration.test.ts` (6 tests, contre Neon, ~8s) :
  - pipeline e2e cap table : extraction → persistance → DB → vérification scope `run:<id>` + encryption (evidenceText base64, valueJson envelope `_enc`, dump SQL sans plaintext)
  - **idempotence** Codex round 4 P1 : re-extraire le même doc retourne `deduplicated: true`
  - email pipeline : EMAIL_SENT_AT avec scope `filename` + extractionRunId=null
  - deck pipeline : DOCUMENT_DATE HIGH from footer, PAS de MEDIUM from filename (anti-shadow)
  - **invariant Phase 2** : `Document.sourceDate` ET `Document.sourceKind` NE SONT PAS mutés par l'extraction
  - signal `extracted_text` sans extractionRunId → skipped propre, pas throw

### État
- 2 fichiers source ajoutés : `temporal-extractor.ts`, `persist-temporal-signals.ts` + `index.ts`.
- 2 fichiers tests ajoutés : `temporal-extractor.test.ts` (19), `temporal-extractor-integration.test.ts` (6).
- 0 mutation Document.
- 0 régression : tests existants Phase 1 toujours pass.
- `npx tsc --noEmit` clean.
- Run global : 83/83 unit pass + 14/14 DB integration evidence-signals + 6/6 DB integration extractor.
- Tasks Phase 2 = done. Stop pour audit Codex round 7 de l'extracteur + persistence + tests. Pas de Phase 3 (promotion vers Document.sourceDate) tant que l'audit n'a pas validé.

### Action — Phase 2.1 (corrections post-review Codex round 7)
Codex round 7 a validé Phase 2 sauf 2 P1 + 2 P2 à corriger avant Phase 3 :
- **P1 #1 faux positifs forecast** : pattern bare years `2022 2023 2024 2025` matched n'importe quoi (deck roadmap → forecast HIGH = dangereux). Fix : split du forecast extractor en (a) **patterns permissifs** `Dec-YY` et `FY-YYYY` (préfixe = intention financière non ambiguë), (b) **pattern bare years gated** par soit `documentType IN (FINANCIAL_MODEL, FINANCIAL_STATEMENTS)`, soit présence d'un keyword financier dans ±120 chars autour du match (`FORECAST_CONTEXT_KEYWORDS` couvre EN + FR : revenue, arr, mrr, ebitda, p&l, fy, sales, profit, loss, ca ht, chiffre d'affaires, bénéfice, charges, exercice, trésorerie, etc.). Tests : "Company roadmap Milestones 2022 2023 2024 2025" rejeté (PITCH_DECK sans keyword), "Traction Revenue 2022 2023 2024 2025" accepté (keyword `Revenue`), "CA HT 2022 2023 2024 2025" accepté (keyword FR), "Worksheet 2022 2023 2024 2025" accepté car FINANCIAL_MODEL.
- **P2 scope source_metadata** : EMAIL_SENT_AT était mappé au scope `"filename"` (sémantiquement faux, marchait par chance car kind différent). Fix : ajout du scope `"source_metadata"` à `SCOPE_KEY_PATTERN` dans `create-signal.ts` + refactor `persist-temporal-signals.ts` en switch explicit sur `derivedFrom`. Tests scope-key (+2) + test intégration mis à jour : EMAIL_SENT_AT a maintenant `signalScopeKey="source_metadata"`.
- **P2 commentaire multi-year guard** : commentaire prétendait "Fur-Love-2026-2030-Sept-2025 → emit nothing" alors que le code émet "Sept-2025" (sémantique correcte : bare years sont la période forecast, pas la date du doc). Fix : commentaire réécrit pour clarifier "ambiguïté = plusieurs MONTH-YEAR pairs, PAS bare years".
- **P1 #2 (cadrage) wiring Phase 2 inactive en prod** : confirmé volontaire — Phase 2 est library-only par design (pour audit Codex de l'extracteur isolément avant câblage). Codex demande si Phase 3 inclut le câblage réel. **Réponse** : OUI, Phase 3 doit faire les 2 : (a) câblage `runTemporalExtractor` + `persistTemporalSignals` dans le pipeline post-extraction (probablement `extraction-pipeline.ts` après finalisation du run, ou `document-extraction-runs.ts`), (b) promotion vers `Document.sourceDate` quand un signal HIGH confidence est disponible. Cela évite de promouvoir du vide. À confirmer avec Codex avant Phase 3.

### État Phase 2.1
- 2 fichiers source modifiés : `temporal-extractor.ts` (forecast context guard, comment), `persist-temporal-signals.ts` (switch derivedFrom).
- 1 fichier infra modifié : `create-signal.ts` (SCOPE_KEY_PATTERN).
- 4 fichiers tests mis à jour : `temporal-extractor.test.ts` (+4 tests context guard), `temporal-extractor-integration.test.ts` (scope source_metadata), `scope-key.test.ts` (+2 tests source_metadata scope).
- Tests : 89/89 unit pass (de 83 à 89), 20/20 DB integration pass.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 2.1 = done. Re-soumission Codex round 8 pour confirmer le cadrage Phase 3 (extracteur wiring + Document promotion).

## 2026-05-18 — Evidence Engine Phase 3 (wiring + promotion sourceDate) — code

### Contexte
Codex round 8 greenlight Phase 3 avec cadrage strict : (1) câbler `runTemporalExtractor` + `persistTemporalSignals` dans le pipeline post-extraction réel, (2) puis promouvoir vers `Document.sourceDate` quand un signal HIGH confidence aligné au docType est disponible. Sans wiring, la promotion serait vide.

### Action — Câblage pipeline
- `src/services/documents/extraction-pipeline.ts` : ajout `type, dealId, version, sourceMetadata` au SELECT Document (ligne 154) + extension correspondante du type `runExtractionWork.params.document`. Dans la branche `isSuccess` (juste après `completeDocumentExtractionRun` commit, avant `publishUploadProgress({phase:"completed"})`) : appel `runTemporalExtractor` → `persistTemporalSignals` → `promoteSourceDateFromSignals`, wrappé en `try/catch` (failure non-fatale, logue seulement — Evidence Engine est enhancement, pas gate extraction).
- Cohérence email inference : passe `inferredEmailSource?.sourceDate ?? document.sourceDate` au extracteur ET au promoter, donc si email inference a déjà set sourceDate, la promotion saute (safeguard `source_date_already_set`).

### Action — Promotion service
- `src/services/evidence/promote-source-date.ts` : nouveau service `promoteSourceDateFromSignals()` + helpers `getPromotionKindsForDocType()` + `pickBestPromotionCandidate()` (exposé pour tests purs).
- Règles strictes (cadrage Codex r8) :
  - **JAMAIS** écraser un `Document.sourceDate` déjà set (race-safe : re-read in-DB avant update).
  - **HIGH** confidence uniquement.
  - **Scope ∈ {run:*, source_metadata}** — `filename` MEDIUM exclu explicitement.
  - **Kind aligné docType** : `PROMOTION_KINDS_BY_DOC_TYPE` = `CAP_TABLE → CAP_TABLE_AS_OF`, `FINANCIAL_STATEMENTS → BALANCE_SHEET_AS_OF`, `PITCH_DECK → DOCUMENT_DATE` (footer), `FINANCIAL_MODEL → DOCUMENT_DATE` (footer).
  - **Tie-break** : précision DAY > MONTH > YEAR > UNKNOWN, puis `createdAt` le plus récent.
  - **Trace** : `sourceMetadata.temporal = { promotedBy: "evidence-engine-phase3", promotedAt, evidenceSignalId, kind, precision, confidence, extractorVersion, signalScopeKey }` (patch, ne remplace pas les meta existants).
- Pas dans le map (intentionnel) : EMAIL_SENT_AT (déjà set par email-source-inference), FINANCIAL_PERIOD_FORECAST/ACTUAL (périodes ≠ date du doc — BP reste sourceDate=null par design audit §3.2), VALUATION_CLAIM/METRIC_CLAIM (Phase 6), DOCUMENT_DATE pour TERM_SHEET/LEGAL_DOCS (à discuter si besoin).

### Vérification corpus snapshot invalidation
- `src/services/corpus/index.ts:285-289` inclut explicitement `sourceDate: true` dans le select du snapshot-hash (commentaire : "so a mutation on any of them (e.g. correcting sourceDate or relinking a parent) surfaces correctly"). Donc la promotion → mutation `Document.sourceDate` → snapshot hash change → re-analysis triggered automatiquement. **Pas de wiring supplémentaire requis.** Test corpus existant `src/services/corpus/__tests__/index.test.ts:244` couvre déjà ce scénario ("invalidates the snapshot when sourceDate is mutated for a non-FILE document").

### Tests
- `src/services/evidence/__tests__/promote-source-date.test.ts` (16 tests) — picker pur :
  - `getPromotionKindsForDocType` : map exact CAP_TABLE/FINANCIAL_STATEMENTS/PITCH_DECK/FINANCIAL_MODEL, vide pour OTHER/LEGAL/TERM_SHEET/MARKET_STUDY
  - `pickBestPromotionCandidate` : retour HIGH, exclusion MEDIUM/LOW/scope=filename/wrong-kind, tie-break précision puis createdAt
- `src/services/evidence/__tests__/promote-source-date-integration.test.ts` (7 tests, contre Neon ~49s) :
  - cap table Avekapeti → sourceDate=2024-09-18 promu + meta.temporal écrit
  - BP Avekapeti monthly 2025-2026 → sourceDate reste null
  - deck E4N → sourceDate=2026-03-01 promu depuis footer
  - email avec sourceDate pré-existant → non écrasé + meta existant préservé
  - OTHER doctype même avec signal HIGH → non promu
  - idempotence : 2e appel = no-op (race-safe via re-read in-DB)
  - filename DOCUMENT_DATE MEDIUM → non promu (scope filename exclu)

### État Phase 3
- 1 fichier source ajouté : `promote-source-date.ts`.
- 1 fichier source modifié : `extraction-pipeline.ts` (import Evidence Engine + wiring dans branche isSuccess + extension type document param).
- 1 fichier infra modifié : `evidence/index.ts` (export promote-source-date).
- 2 fichiers tests ajoutés : `promote-source-date.test.ts` (16), `promote-source-date-integration.test.ts` (7).
- Tests : 105/105 unit pass (de 89 à 105), DB integration ~50s pour 7 tests promotion + 20 Phase 1/2 existants.
- `npx tsc --noEmit` clean.
- 0 régression : tests existants pipeline non touchés.
- Tasks Phase 3 = done. Stop pour audit Codex round 9 du wiring + promotion. Pas de Phase 4 (attachment-linker) tant que l'audit n'a pas validé.

### Action — Phase 3.1 (corrections post-review Codex round 9)
Codex round 9 a validé règles fonctionnelles + picker, mais 2 P1 + 2 P2 à corriger avant Phase 4 :

- **P1 race-safe promotion** : `promote-source-date.ts` faisait read-then-update non-atomique. Concurrent writer entre re-read et update → écrasement silencieux. Fix : remplacer `prisma.document.update()` par `prisma.document.updateMany({ where: { id, dealId, sourceDate: null }, data })` puis check `count === 1`. Si `count === 0` → outcome=`source_date_already_set` (concurrent writer beat us). Le check `sourceDate: null` dans le WHERE est évalué dans la même SQL statement que l'UPDATE, donc race impossible. Tests unitaires : 4 nouveaux (`promote-source-date-race.test.ts`) avec prisma mocké forçant count=0.

- **P1 evidence catch-up retry terminal-success** : si crash entre `completeDocumentExtractionRun` commit et bloc evidence, Inngest retry voit run=READY → `summarizeExistingRun` → evidence jamais rejoué = zéro signal écrit pour le doc. Fix architectural :
  - Nouveau helper idempotent `src/services/evidence/run-evidence-for-document.ts` (`runEvidenceForDocument(prisma, { documentId, extractedTextPlaintext?, extractionRunId? })`). Lit Document + déchiffre `extractedText` via `safeDecrypt` si plaintext non fourni. Résout extractionRunId via dernier run READY/READY_WITH_WARNINGS/BLOCKED si non fourni.
  - Appelé depuis 2 sites du pipeline : (a) fresh-success path (avec plaintext + runId in-memory pour économiser un read+decrypt), (b) `summarizeExistingRun` retry catch-up (sans plaintext → helper re-décrypte).
  - Idempotence garantie par les couches existantes : `createEvidenceSignal` dedupe P2002→existing (Codex r4 P1), `promoteSourceDateFromSignals` no-op si sourceDate set (Codex r9 P1 ci-dessus).
  - Pipeline-side : remplace 40 lignes inline par 1 appel helper dans chaque branche. Document SELECT pipeline réduit (helper fait son propre SELECT).

- **P2 scope promotion trop large** : filtre `signalScopeKey != "filename"` laissait passer `human:*` et `import:*` alors que cadrage Codex r8 = `{ run:*, source_metadata }`. Fix : `OR: [{ signalScopeKey: { startsWith: "run:" } }, { signalScopeKey: "source_metadata" }]` explicite. Test unit qui vérifie : la clause OR contient EXACTEMENT 2 clauses, pas de mention "human:" / "import:" / "filename" dans la query JSON.

- **P2 wiring test gap** : `extraction-pipeline.test.ts` swallowait l'erreur "Cannot read properties of undefined (reading 'create')" car prisma.evidenceSignal non mocké. Fix : ajout `vi.mock("@/services/evidence", () => ({ runEvidenceForDocument: mocks.runEvidenceForDocument }))` + mock par défaut `{ status: "ran", ... }`. Tests ajoutés (6) : (1) fresh-success appelle helper avec plaintext + runId, (2) evidence failure swallowed (return COMPLETED), (3) retry catch-up appelle helper SANS plaintext + smartExtract NON appelé, (4) catch-up failure swallowed, (5) FAILED extraction n'appelle PAS helper, (6) FAILED retry n'appelle PAS helper.

### État Phase 3.1
- 1 fichier source ajouté : `run-evidence-for-document.ts` (helper idempotent).
- 2 fichiers source modifiés : `promote-source-date.ts` (atomic updateMany + scope filter), `extraction-pipeline.ts` (helper + retry catch-up, document SELECT réduit, type param réduit).
- 1 fichier infra modifié : `evidence/index.ts` (export run-evidence-for-document).
- 2 fichiers tests ajoutés : `promote-source-date-race.test.ts` (8 tests race + scope + metadata), `extraction-pipeline.test.ts` (+6 tests Phase 3.1 Evidence Engine wiring).
- Tests : 148/148 unit pass (de 105 à 148 — incluant extraction-pipeline.test.ts qui passe de 30 à 36), 27/27 DB integration pass.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 3.1 = done. Re-soumission Codex round 10 pour greenlight Phase 4 (attachment-linker).

### Action — Phase 3.2 (corrections post-review Codex round 10)
Codex round 10 a validé P1 race-safe + P1 catch-up retry, mais 1 P1 + 2 P2 résiduels :

- **P1 wiring inline uploads manquant** : `runEvidenceForDocument` câblé seulement sur le pipeline PDF durable. Les chemins inline image/Excel/Word/PPT finalisent COMPLETED sans appel helper → BP Excel, cap table image, mails .docx, PPT natifs créent zéro EvidenceSignal et n'ont pas de promotion sourceDate. Fix : ajouter `runEvidenceForDocument` (non-fatal `try/catch`, garde `if (*CorpusUsable)`) après chacune des 4 finalisations COMPLETED inline dans `src/app/api/documents/upload/route.ts` (image OCR ligne ~552, Excel ~861, Word ~1027, PPT ~1181). Plaintext + extractionRunId passés in-memory pour éviter re-read + decrypt.

- **P2 picker pur pas aligné sur SQL strict** : `pickBestPromotionCandidate` exposé pour tests + Phase 5 read-path gardait `c.signalScopeKey !== "filename"` → accepterait `human:*` / `import:*`. Risque de régression Phase 5. Fix : remplacé par `if (scope.startsWith("run:")) return true; if (scope === "source_metadata") return true; return false;` — alignement exact avec la query DB `OR [{ startsWith: "run:" }, { equals: "source_metadata" }]`. Tests : 3 nouveaux dans `promote-source-date.test.ts` (`human:*` exclu, `import:*` exclu, `source_metadata` accepté).

- **P2 helper non testé unitairement** : `runEvidenceForDocument` testé seulement via mocks pipeline + intégration DB. Couverture manquante : décryption fallback, résolution latest run, skip branches (no_extracted_text, processing_status, document_not_found), contexte passé aux services downstream. Fix : `src/services/evidence/__tests__/run-evidence-for-document.test.ts` (15 tests mockant Prisma + safeDecrypt + extractor + persister + promoter). Couvre les 5 skip branches, plaintext-vs-decrypt path (4 cas), extractionRunId résolution explicite/implicit/null, context propagation au extractor + promoter, return shape `ran` avec compteurs.

### État Phase 3.2
- 2 fichiers source modifiés : `src/app/api/documents/upload/route.ts` (4 sites wiring inline + import), `src/services/evidence/promote-source-date.ts` (picker scope alignment).
- 2 fichiers tests modifiés/ajoutés : `promote-source-date.test.ts` (+3 tests scope strict), `run-evidence-for-document.test.ts` (+15 tests nouveaux fichier).
- Tests : 166/166 unit pass (de 148 à 166 — +15 helper + +3 picker), 27/27 DB integration pass.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 3.2 = done. Re-soumission Codex round 11 pour greenlight Phase 4 (attachment-linker email ↔ pièces).

## 2026-05-18 — Evidence Engine Phase 4 (attachment-linker email ↔ pièces) — code

### Contexte
Codex round 11 greenlight Phase 4. Implémentation du linker qui détecte les noms de pièces jointes dans le `extractedText` d'un email et les relie aux documents du même deal via signal `ATTACHMENT_RELATION` sur le CHILD doc.

### Action
- `src/services/evidence/attachment-linker.ts` (~210 lignes) :
  - `detectAttachmentNames(text)` — pure detection en deux passes :
    1. **Gmail-listing** (`/^line-start (filename multi-mots avec espaces) .ext (?=\s+\d+[KMG])/`) — capture les noms à espaces suivis d'un size suffix Gmail-style ("Table de capi Septembre 2024 signeģe.png  136K"). Cas Avekapeti.
    2. **Standard** (`/[^\s/\\<>"'|:?*]+\.ext/gi`) — fallback word-boundary pour les noms sans espaces (Pitch.pdf, BP.xlsx, etc.).
  - Dédoublonnage : suffix-of-longer guard évite que "signeģe.png" (pass 2) et "Table … signeģe.png" (pass 1) co-existent. Liste de generic-filenames (image.png, document.pdf, signature.jpg, etc.) écartée.
  - `findAttachmentMatches(prisma, params)` — match candidats vs docs du deal en mémoire (1 query). Cross-tenant guards : `dealId` filter dans la `where`, `id: { not: emailDocumentId }` (exclut l'email lui-même). Strict matching : exact (case-insensitive, score 1.0, HIGH) > normalized (diacritics + spacing stripped, score 0.95, MEDIUM). Pas de fuzzy/Levenshtein en Phase 4 (anti-false-positive).
  - `persistAttachmentRelations(prisma, params)` — crée un signal `ATTACHMENT_RELATION` sur chaque CHILD doc matché :
    - `signalScopeKey = "source_metadata"` (dérivé du parsing email, pas du run extraction du child)
    - `extractionRunId = null` (le run appartient à l'email — utiliser cet id violerait la composite FK `(extractionRunId, documentId) → DocumentExtractionRun(id, documentId)` car le run est lié à l'email, pas au child)
    - `valueJson = { emailDocId, attachmentName, matchMethod, matchScore, emailSourceDate }`
    - `reportedAt = email.sourceDate` (le "transmittedAt")
    - `confidence` = HIGH si exact, MEDIUM si normalized
    - Cross-tenant guard défensif : re-check `child.dealId === emailDealId` avant insert.
  - `linkEmailAttachments` — orchestrateur 1-shot.
  - `ATTACHMENT_LINKER_VERSION = "attachment-linker@2026-05-18-001"` (utilisé dans signalHash → versioning).

- `src/services/evidence/run-evidence-for-document.ts` : appel `linkEmailAttachments` conditionnel sur `sourceKind === "EMAIL"`. Retourne `attachmentsLinked` dans le shape.

- `src/services/evidence/index.ts` : exports publics (ATTACHMENT_LINKER_VERSION, detectAttachmentNames, findAttachmentMatches, linkEmailAttachments, persistAttachmentRelations, types).

### Invariants vérifiés
- **Codex Phase 4 gate cap table linké** : Avekapeti `Mail.pdf` mentionnant `"Table de capi Septembre 2024 signeģe.png  136K"` → ATTACHMENT_RELATION signal créé sur le cap table doc avec confidence=HIGH, scope=source_metadata, reportedAt=2026-04-22.
- **Invariant Phase 4 dates cohabitent** : cap table avec sourceDate=2024-09-18 (promu par Phase 3 CAP_TABLE_AS_OF) reste intact ; le signal ATTACHMENT_RELATION coexiste avec reportedAt=2026-04-22. `ATTACHMENT_RELATION` n'est PAS dans `PROMOTION_KINDS_BY_DOC_TYPE` → impossible d'écraser la date métier.
- **Cross-tenant** : email du deal A ne link PAS un doc du deal B même avec même nom. Garanti par le `dealId` filter dans `findMany` + re-check défensif avant insert.
- **Idempotence** : re-linking le même email retourne deduplicated=1 sans nouvelles rows.
- **Wiring sourceKind** : `runEvidenceForDocument` n'appelle le linker QUE pour sourceKind=EMAIL.

### Tests
- `attachment-linker.test.ts` (17 tests unit) : Gmail-listing avec espaces (Avekapeti), standard regex, dédup, generic blacklist, charOffset, normalisation, exact vs normalized match, doc-can-only-match-once, cross-tenant + self-match guards, orchestrateur empty + full flow.
- `attachment-linker-integration.test.ts` (6 tests Neon, ~48s) : gate Avekapeti, invariant dates cohabitent, cross-tenant deal A vs B, idempotence, wiring auto-link sourceKind=EMAIL, FILE doc n'appelle PAS le linker.

### État Phase 4
- 1 fichier source ajouté : `attachment-linker.ts`.
- 1 fichier source modifié : `run-evidence-for-document.ts` (wiring linker + attachmentsLinked dans return shape).
- 1 fichier infra modifié : `evidence/index.ts` (exports).
- 2 fichiers tests ajoutés : `attachment-linker.test.ts` (17), `attachment-linker-integration.test.ts` (6).
- 1 fichier test modifié : `run-evidence-for-document.test.ts` (+attachmentsLinked dans expect.toEqual).
- Tests : 183/183 unit pass (de 166 à 183 — +17 linker), 33/33 DB integration pass (de 27 à 33 — +6 linker).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 4 = done. Stop pour audit Codex round 12. Pas de Phase 5 (prelude agent) tant que l'audit n'a pas validé.

### Action — Phase 4.1 (corrections post-review Codex round 12)
Codex round 12 a flaggé 2 P1 + 1 P2 :

- **P1 lien n'alimente pas la surface existante** : `ATTACHMENT_RELATION` signal seul ne suffisait pas — agents/UI/snapshots lisent `Document.corpusParentDocumentId` (cf. `base-agent.ts:987`, `corpus/index.ts:103`). Donc Avekapeti avait un signal DB mais le context engine ne voyait pas "cap table jointe à Mail.pdf". Fix : promotion guardée de `corpusParentDocumentId` après création du signal, mirror Phase 3 promotion pattern :
  - **HIGH confidence (exact match) uniquement** — normalized matches restent signal-only
  - **Atomic updateMany race-safe** avec `WHERE corpusParentDocumentId IS NULL` — jamais écraser un lien manuel utilisateur ou auto antérieur
  - **Trace `sourceMetadata.attachment` patché** (préserve Phase 3 `sourceMetadata.temporal` + autres clés)
  - Return shape étendu : `parentLinksPromoted: number`
  - Helper local `promoteCorpusParentForMatch` race-safe.

- **P1 matching non déterministe** : `findAttachmentMatches` chargeait tous les docs du deal sans `isLatest`, sans `processingStatus`, sans `orderBy` → potentiel attach au mauvais doc (old version, doc FAILED, ordre DB implicite). Fix :
  - `where: { isLatest: true, processingStatus: { not: "FAILED" } }` — exclut deprecated versions + FAILED extractions
  - `orderBy: [{ uploadedAt: "asc" }, { id: "asc" }]` — ordre stable
  - Map.set logic : **FIRST wins** (au lieu d'écraser silencieusement) — pour les collisions filename rares (re-upload, restored draft), on garde le plus ancien (déterministe)

- **P2 faux positifs URL/path** : la fallback regex pouvait détecter `Pitch.pdf` dans une URL/path. Fix : nouvelle fonction `isInsideUrlOrPath(text, matchIndex)` qui rejette si char-just-before est `/` ou `\`, ou si `://` apparaît dans les 60 chars précédant le match.

### Tests Phase 4.1
- `attachment-linker.test.ts` (+11 tests, total 28) :
  - 4 tests URL/path skip (HTTP URL, Unix path, Windows path, mid-line accept)
  - 3 tests matching déterministe (filter where, latest-only, collision first wins)
  - 4 tests corpusParentDocumentId promotion (HIGH only, NORMALIZED skipped, already-set non-overwrite, race count=0)
- `attachment-linker-integration.test.ts` (+4 tests, total 10) :
  - Codex Phase 4.1 promotion : EXACT match → corpusParentDocumentId écrit + meta.attachment trace
  - Codex Phase 4.1 non-overwrite : user manual link préservé même si email match
  - Codex Phase 4.1 isLatest : old version (isLatest=false) NE peut PAS être matchée
  - Codex Phase 4.1 FAILED : doc processingStatus=FAILED NE peut PAS être matché

### État Phase 4.1
- 1 fichier source modifié : `attachment-linker.ts` (URL guard + matching filters + promotion helper).
- 1 fichier test modifié : `attachment-linker.test.ts` (mocks documentUpdateMany ajoutés + 11 tests Phase 4.1).
- 1 fichier test modifié : `attachment-linker-integration.test.ts` (+4 tests gates Codex r12).
- Tests : 194/194 unit pass (de 183 à 194 — +11 linker Phase 4.1), 37/37 DB integration pass (de 33 à 37 — +4 linker Phase 4.1).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 4.1 = done. Re-soumission Codex round 13 pour greenlight Phase 5 (prelude agent contextuel).

### Action — Phase 4.2 (revert promotion corpusParentDocumentId — Codex round 13 P1)
Codex round 13 a flaggé que la mutation `Document.corpusParentDocumentId` ajoutée en Phase 4.1 casse l'invariant lineage F62 utilisé par `src/app/api/documents/upload/route.ts:360` et `src/services/documents/extraction-runs.ts:843+948` :
- `corpusParentDocumentId` est partie de la clé de lineage `(dealId, name, corpusParentDocumentId)` qui détermine la famille d'un re-upload.
- Muter ce champ post-création casse : "old versions stay in old lineage" invariant + future re-uploads avec même `(dealId, name)` peuvent atterrir dans un lineage différent + clash avec l'immutability assumption `extraction-runs:948`.
- Codex round 12 P1 avait offert deux options : muter ou acter Phase 5 lit `ATTACHMENT_RELATION`. Codex round 13 confirme : muter est unsafe.

**Décision Phase 4.2** : revert complet de la promotion. Phase 4 reste **signal-only**. Phase 5 (prelude agent + corpus read-path) lira `ATTACHMENT_RELATION` partout où `Document.corpusParentDocumentId` est lu (`base-agent.ts:987`, `corpus/index.ts:103`, deal detail UI, etc.) et surfacera l'auto-detected link alongside the manually-set one.

**Bonus** : la P2 round 13 sur sourceMetadata stale-copy est aussi résolue automatiquement — le revert supprime toute écriture à `sourceMetadata.attachment` (le trace audit vit dans l'EvidenceSignal).

Code changes :
- `attachment-linker.ts` :
  - Docstring header : section "⚠️ Phase 4.2 — signal-only by design" expliquant pourquoi et où Phase 5 doit surface
  - Suppression de `promoteCorpusParentForMatch` (helper + appel)
  - Suppression de `parentLinksPromoted` du return shape
  - Suppression de `corpusParentDocumentId` + `sourceMetadata` du SELECT child (plus utilisés)

Tests :
- `attachment-linker.test.ts` (-4, +2) : ancien describe "promotion" remplacé par "Codex round 13 P1 — Document.corpusParentDocumentId IS NOT mutated" qui vérifie `documentUpdateMany.not.toHaveBeenCalled()` même pour HIGH match
- `attachment-linker-integration.test.ts` (-2, +2) : tests "promotion" remplacés par tests "non-mutation" + "existing parent untouched"

### État Phase 4.2
- 1 fichier source modifié : `attachment-linker.ts` (revert promotion).
- 2 fichiers tests modifiés : `attachment-linker.test.ts`, `attachment-linker-integration.test.ts`.
- Tests : 192/192 unit pass (de 194 à 192 — 4 tests promotion supprimés, 2 tests non-mutation ajoutés), 37/37 DB integration pass (10 dans attachment-linker, dont 2 nouveaux non-mutation).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 4.2 = done. Re-soumission Codex round 14 pour greenlight Phase 5 (prelude agent contextuel — qui devra inclure le surfacing de ATTACHMENT_RELATION).

## 2026-05-18 — Evidence Engine Phase 5 (prelude agent contextuel) — code

### Contexte
Codex round 14 greenlight Phase 5. Objectif : injecter dans le contexte agent un header global "Nous sommes le DD/MM/YYYY" + un prelude par document qui surface les EvidenceSignal (asOf, forecast, actuals, attachments auto-détectés, warnings de fraîcheur), SANS muter Document.sourceDate ni Document.corpusParentDocumentId (contrat Codex r13 P1 + Phase 3.2).

### Action
- **Service `src/services/evidence/build-evidence-context.ts`** (~340 lignes) :
  - `buildDealEvidenceContext(prisma, dealId, options?)` — load tous les docs + signals du deal en 1 round-trip ; produit `Record<docId, DocumentEvidenceContext>` indexé par documentId.
  - Picker logic : HIGH > MEDIUM puis DAY > MONTH puis scope rank (run:* > source_metadata > human:* > filename) puis createdAt desc.
  - `documentDate` ← DOCUMENT_DATE meilleur signal, `asOf` ← CAP_TABLE_AS_OF | BALANCE_SHEET_AS_OF, `forecast` ← FINANCIAL_PERIOD_FORECAST (max dateEnd), `actuals` ← collection FINANCIAL_PERIOD_ACTUAL.
  - `detectedAttachments` ← ATTACHMENT_RELATION signals avec résolution du nom email parent depuis le map de docs in-memory (cross-tenant garanti par le filtre dealId du findMany).
  - `staleWarnings` computed :
    - `cap_table_stale` : CAP_TABLE_AS_OF > 12 mois (medium), > 18 mois (high)
    - `balance_sheet_stale` : BALANCE_SHEET_AS_OF > 18 mois
    - `forecast_now_historical` : FINANCIAL_PERIOD_FORECAST.dateStart ≤ today → "require YTD actuals, do NOT treat as realised"

- **Formatter `src/agents/evidence-prelude.ts`** (~110 lignes) :
  - `formatGlobalEvidenceHeader(today)` → "## Référence temporelle\n**Nous sommes le 18/05/2026.** ..."
  - `formatDocumentEvidencePrelude(ctx)` → markdown block per-doc avec asOf, documentDate, forecast (avec mention "PROJECTIONS, ne pas traiter comme réalisés"), actuals, attachments ("Transmis par email: X le DD/MM/YYYY"), stale warnings (⚠️ medium, 🛑 high).
  - Disambiguation : si asOf+documentDate présents, affiche asOf seul (plus spécifique).
  - Citations courtes truncated à 200 chars + sanitizeForLLM sur le nom email parent.

- **AgentContext type** — `src/agents/types.ts` :
  - Ajout `evidenceContext?: Record<string, DocumentEvidenceContext>` + `evidenceToday?: Date`. Optionnel — back-compat pour les chemins agent qui ne wire pas.

- **base-agent.ts** :
  - Import `formatGlobalEvidenceHeader` + `formatDocumentEvidencePrelude`.
  - `formatDealContext` commence par le global header (avec fallback `new Date()` si `evidenceToday` absent).
  - Boucle docs : après le header `### name (...) — produit le ...`, injecte le prelude per-doc si `context.evidenceContext?.[doc.id]` présent.
  - Compat : ne casse PAS le header existant ; le prelude vient EN PLUS.

- **Orchestrator** — `src/agents/orchestrator/index.ts` :
  - Import `buildDealEvidenceContext` + `DocumentEvidenceContext`.
  - Appel `buildDealEvidenceContext(prisma, dealId, { today: evidenceToday })` AVANT construction du context, non-fatal (try/catch → undefined).
  - Assign `context.evidenceContext` + `context.evidenceToday`.

### Tests
- `src/services/evidence/__tests__/build-evidence-context.test.ts` (10 tests unit, mocked Prisma) : empty deal, picker rules (kind > confidence > precision > scope), forecast latest-pick, actuals collection, attachment resolution, stale warnings (cap_table > 12mo, forecast historical 2025-2026, forecast 2027+ → pas de warning).
- `src/services/evidence/__tests__/build-evidence-context-integration.test.ts` (2 tests Neon, ~12s) : Avekapeti gate (cap table + ATTACHMENT_RELATION + stale warning), BP forecast 2026-2030 + warning historical 2026.
- `src/agents/__tests__/evidence-prelude.test.ts` (12 tests purs) : global header date format FR, cap table asOf + warning, bilan + actuals, BP forecast + "PROJECTIONS" mention, forecast warning YTD, attachment exact + normalized + fallback name, empty ctx, disambiguation asOf vs documentDate.
- `src/agents/__tests__/base-agent-date-rendering.test.ts` (+4 tests) : injection global header, injection per-doc prelude, fallback evidenceToday absent, evidenceContext absent → pas de prelude.

### Surface impact (Codex round 13 P1 satisfaction)
- ATTACHMENT_RELATION est maintenant lu par l'agent prelude → le surface "transmis par email X le date Y" coexiste avec le manuel Document.corpusParentDocumentId déjà rendu par `base-agent.ts:987`.
- Phase 5 NE MUTE rien : ni sourceDate, ni sourceKind, ni corpusParentDocumentId. Lecture pure de l'EvidenceSignal table.
- F62 lineage invariant intact.

### Wiring statut
- ✅ Orchestrator (analyse principale Tier 1/2/3)
- ⏭️ Chat / Board orchestrators : non câblés Phase 5 first cut (peut être ajouté en Phase 5.x si besoin — non-fatal, le prelude reste optionnel)

### État Phase 5
- 2 fichiers source ajoutés : `build-evidence-context.ts`, `evidence-prelude.ts`.
- 3 fichiers source modifiés : `evidence/index.ts` (exports), `types.ts` (AgentContext), `base-agent.ts` (header + prelude), `orchestrator/index.ts` (wiring + import).
- 4 fichiers tests ajoutés : `build-evidence-context.test.ts` (10), `build-evidence-context-integration.test.ts` (2), `evidence-prelude.test.ts` (12), update `base-agent-date-rendering.test.ts` (+4).
- Tests : 287/287 unit pass (de 192 à 287 — +95 dont 12 prelude + 10 build-evidence + 4 base-agent + 60+ existants Phase 1-4 + autres agents), 39/39 DB integration pass.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 5 = done. Stop pour audit Codex round 15 avant Phase 6 (claims financiers structurés).

### Action — Phase 5.1 (corrections post-review Codex round 15)
Codex round 15 a flaggé 2 P1 + 1 P2 :

- **P1 wiring incomplet** : seul `runBaseAnalysis` recevait `evidenceContext`. Le path prod `full_analysis` lancé par l'UI (line 1497) + `runTier1Analysis` (line 678) + resume (line 4388) **n'étaient pas câblés** → le vrai Deep Dive n'a jamais vu le prelude. Fix : helper unique `loadEvidenceContextSafe(dealId)` (top du fichier orchestrator, non-fatal try/catch). Appelé depuis les **4 sites** de construction `AgentContext` (runBaseAnalysis, runTier1Analysis, runFullAnalysis, resume flow).

- **P1 filter latest extractor version** (déferré Phase 1 §3.12) : `buildDealEvidenceContext` n'avait aucun filtre version → après upgrade parser, un vieux signal pouvait battre le nouveau sur les tiebreakers confidence/precision/scope/createdAt. Fix : nouvelle fonction `keepLatestExtractorVersionPerScope(signals)` qui groupe par `(documentId, signalScopeKey, kind)` et garde uniquement les rows dont `extractorVersion` est le MAX du groupe (string sort sur format `module@YYYY-MM-DD-NNN`). Appliquée avant le picker. Tests : v1 HIGH + v2 MEDIUM sur même scope → v2 wins (MEDIUM) ; v1 sur run:R1 + v2 sur run:R2 → coexistent (scopes différents).

- **P2 fingerprint cache n'incluait pas signals** : `tier1_complete` / `tier2_sector` / `tier3_synthesis` cacheables, mais `generateDealFingerprint` hash uniquement deal+docs+facts, pas signals → nouveau ATTACHMENT_RELATION / CAP_TABLE_AS_OF n'invalidait pas le cache. Fix : `generateDealFingerprint(deal, evidenceSignals = [])` accepte un 2e arg optionnel (back-compat). Hash inclut `${documentId}|${signalScopeKey}|${kind}|${signalHash}|${extractorVersion}` sorted. Call sites `findAnalysisCache` + `storeAnalysisFingerprint` pré-fetch signals via `prisma.evidenceSignal.findMany({ where: { dealId }, select: {...} })`. Tests : ajout/retrait signal change fingerprint ; ordre des signals n'affecte pas (stable sort) ; extractorVersion change le fingerprint ; signalHash change le fingerprint ; backward compat sans 2e arg.

### État Phase 5.1
- 2 fichiers source modifiés : `build-evidence-context.ts` (+ `keepLatestExtractorVersionPerScope`), `analysis-cache/index.ts` (+ `evidenceSignals` param dans `generateDealFingerprint`).
- 1 fichier source modifié : `orchestrator/index.ts` (helper `loadEvidenceContextSafe` + wiring 4 sites + signals dans fingerprint 2 sites).
- 2 fichiers tests modifiés : `build-evidence-context.test.ts` (+2 tests latest version), `analysis-cache/__tests__/index.test.ts` (+6 tests fingerprint signals).
- Tests : 296/296 unit pass (de 287 à 296 — +8 fingerprint cache + +2 latest version, certains comptes ajustés par les agents).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 5.1 = done. Re-soumission Codex round 16 pour greenlight Phase 6 (claims financiers structurés).

### Action — Phase 5.2 (corrections post-review Codex round 16)
Codex round 16 a flaggé 1 P1 + 2 P2 + 1 test gap :

- **P1 read-path ne filtrait pas latest extraction run** : `keepLatestExtractorVersionPerScope` groupait par `(documentId, signalScopeKey, kind)` → run:R1 et run:R2 coexistaient. Un vieux run HIGH pouvait battre un dernier run MEDIUM dans le picker → prelude injectait des dates stale après re-OCR. Fix : nouvelle fonction `filterSignalsToLatestRun(signals, latestRunByDoc)` appliquée AVANT le filtre version. Pré-fetch du dernier run terminal par doc via `prisma.$queryRaw` (`SELECT DISTINCT ON ("documentId") ... ORDER BY startedAt DESC`). Signals avec scope `run:<oldRunId>` sont droppés, signals `filename` / `source_metadata` / `human:*` / `import:*` survivent (non liés à un run). Fallback conservateur : si dernier run inconnu, keep le signal pour éviter de tout hider. 3 tests : ancien HIGH + nouveau MEDIUM → nouveau wins, non-run scopes survivent, doc sans run → préservation.

- **P2 cache fail-open sur signal read error** : `.catch(() => [])` faisait passer le fingerprint sans signals → cache hit avec evidence stale. Fix :
  - `checkAnalysisCache` : try/catch explicite ; sur erreur signals → `return null` (no cache hit), log + comment "failing CLOSED".
  - `storeAnalysisFingerprint` : try/catch explicite ; sur erreur signals → `return` sans update (analysis.dealFingerprint stays null → futur read ne peut pas hit le cache, safe).

- **P2 fingerprint sort sans tie-break extractorVersion** : 2 signals identiques sauf version pouvaient sort en ordre non-deterministe car comparator omettait extractorVersion. Fix : ajout `a.extractorVersion.localeCompare(b.extractorVersion)` comme dernier tie-breaker dans le sort. Test "ordre inversé même version → même fingerprint".

- **Test gap full_analysis non protégé** : nouveau fichier `src/agents/orchestrator/__tests__/evidence-wiring.test.ts` (7 tests structurels) qui lit le source orchestrator et asserts :
  - `loadEvidenceContextSafe` défini exactement 1 fois
  - Appelé ≥5 fois (1 def + 5 call sites : runBaseAnalysis, runTier1Analysis, runFullAnalysis, resume, coherenceContext)
  - Chaque AgentContext literal avec `documents:` contient `evidenceContext` ET `evidenceToday` (5 blocks)
  - Aucun call direct à `buildDealEvidenceContext` hors helper (1 seule occurrence)
  - Helper utilise try/catch non-fatal
  - `checkAnalysisCache` et `storeAnalysisFingerprint` respectent fail-closed (log + return null/skip)

  Bonus : Codex r16 wiring guard a découvert un 5e site non câblé (`coherenceContext` line 3143) → ajouté `loadEvidenceContextSafe` + `evidenceContext/Today` dans ce site.

### État Phase 5.2
- 2 fichiers source modifiés : `build-evidence-context.ts` (+ `filterSignalsToLatestRun` + pré-fetch latest run), `analysis-cache/index.ts` (+ tie-break extractorVersion).
- 1 fichier source modifié : `orchestrator/index.ts` (cache fail-closed × 2, +1 wiring coherenceContext, +call à `loadEvidenceContextSafe`).
- 1 fichier test ajouté : `orchestrator/__tests__/evidence-wiring.test.ts` (7 tests structurels).
- 2 fichiers tests modifiés : `build-evidence-context.test.ts` (+3 tests latest run filter, mocks $queryRaw ajoutés), `analysis-cache/__tests__/index.test.ts` (+1 test sort tie-break).
- Tests : 312/312 unit pass (de 296 à 312 — +7 wiring + +3 latest run + +1 tie-break + +5 par carryover agents).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 5.2 = done. Re-soumission Codex round 17 pour greenlight Phase 6 (claims financiers structurés).

### Action — Phase 5.3 (test gap Codex round 17)
Codex round 17 a flaggé 1 P2 (test gap) : le filtre SQL `latest-run` est correct en théorie mais le test intégration existant créait des `DocumentExtractionRun` sans `status` (default `PENDING`), donc `latestRunRows` était toujours vide et le fallback conservateur masquait le vrai chemin. Aucun test ne prouvait que le SQL `DISTINCT ON ("documentId") ORDER BY startedAt DESC` filtrait réellement le bon run sur Postgres réel.

Fix : 2 nouveaux tests d'intégration dans `build-evidence-context-integration.test.ts` :
- **Test gate r17 P2** : crée 2 runs terminaux (`READY` + `READY_WITH_WARNINGS`) sur le même doc avec startedAt distincts, insère un signal HIGH sur l'ancien run (asOf=2024-08-18, "old OCR misread") + un signal MEDIUM sur le nouveau (asOf=2024-09-18, "correct"). Vérifie que le picker retourne le **MEDIUM nouveau** (preuve que le SQL filtre + drop fonctionne end-to-end, sinon le HIGH ancien gagnerait sur la confidence).
- **Test edge case** : crée 1 run terminal `READY` antérieur + 1 run `PENDING` postérieur (plus récent en startedAt mais NON-terminal). Vérifie que le run PENDING est exclu et que le signal du run READY antérieur reste autoritaire (confirme le `WHERE status IN ('READY', 'READY_WITH_WARNINGS', 'BLOCKED')`).

### État Phase 5.3
- 1 fichier test modifié : `build-evidence-context-integration.test.ts` (+2 tests latest-run DB end-to-end, ~4s additionnels).
- Tests : 4/4 intégration DB pass (de 2 à 4 — les 2 originaux Avekapeti+BP + 2 nouveaux Codex r17 P2).
- 312/312 unit pass (inchangé).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 5.3 = done. Re-soumission Codex round 18 pour greenlight Phase 6 (claims financiers structurés).

## 2026-05-18 — Evidence Engine Phase 6 (financial/metric claims) — code

### Contexte
Codex round 18 greenlight Phase 6. Objectif : extraire VALUATION_CLAIM + METRIC_CLAIM des documents (deck/email/BP/bilan) via regex déterministe, classer actual/forecast/claim selon le doc type + sourceKind + markers du text, surfaceer dans le prelude agent.

### Action — Phase 6.0 + 6.1 + 6.2
- **`src/services/evidence/claims-extractor.ts`** (~280 lignes) :
  - `runClaimsExtractor({documentName, documentType, extractedText, sourceKind})` retourne `ExtractedClaimSignal[]`.
  - `classifyDocument()` :
    - `sourceKind === "EMAIL"` → `"claim"` (Gate Codex 2 — JAMAIS override)
    - `FINANCIAL_MODEL` → `"forecast"` (Gate Codex 3)
    - `FINANCIAL_STATEMENTS` → `"actual"`
    - `PITCH_DECK` / autres → `"claim"`
  - `refineClassification(base, window, sourceKind)` : upgrade vers `"actual"` si mots-clés `réalisé/audited/exercice clos` dans ±120 chars, downgrade vers `"forecast"` si `forecast/projection/prévi/budget`. **EMAIL conserve `"claim"` toujours** (Gate Codex 2).
  - **3 patterns** :
    1. Valuation : `(valorisation|valuation|pre-money|post-money)\s*<amount>` → VALUATION_CLAIM
    2. Metric+Year+Amount : `<CA|ARR|MRR|EBITDA|exit|ticket> <year> [=:] <amount>`
    3. Amount+de+Metric+Year : `<amount> de <metric> <year>` ("3M€ de CA 2025")
    4. Amount+Metric+Year : `<amount> <metric> <year>` ("3M€ CA 2025")
  - `parseAmount` gère `€/$/£`, k/M/G suffix, decimal comma FR (`3,5M€` → 3500000).
  - EXIT métrique → kind = VALUATION_CLAIM (sémantique : valorisation à terme).
  - Dedup par tuple (kind, metric, year, amount, currency, classification).
  - `CLAIMS_EXTRACTOR_VERSION = "claims-extractor@2026-05-18-001"`.

- **`run-evidence-for-document.ts`** : appel `runClaimsExtractor` après temporal + attachment linker. Persistance via `persistTemporalSignals` (mêmes hash / scope / dedup que les temporal signals). Retour shape étendu : `claimsPersisted`, `claimsDeduplicated`.

- **`build-evidence-context.ts`** : nouvelle interface `ResolvedClaim` + `collectClaimSignals(signals)` qui décrypte valueJson et trie par year desc puis amount desc. Ajout au `DocumentEvidenceContext.claims`. Findings query étendu pour inclure `VALUATION_CLAIM` + `METRIC_CLAIM`.

- **`evidence-prelude.ts`** : `formatClaimLine(claim)` avec étiquette explicite de classification :
  - `[ACTUAL — donnée historique réalisée]`
  - `[FORECAST — projection, ne pas traiter comme réalisé]`
  - `[CLAIM founder — déclaration non auditée, à vérifier]`
  - `formatAmount` : `3.00M€`, `405k€`, `$1.5M`, `6.00G$`.

### Tests Phase 6
- **`claims-extractor.test.ts`** (20 tests unit purs) :
  - VALUATION_CLAIM (valorisation, exit avec period)
  - METRIC_CLAIM (CA/ARR/MRR/EBITDA avec year + currency)
  - Gate Codex 1 : CA 2025 ≠ forecast 2026 (period)
  - Gate Codex 2 : EMAIL + "réalisé" + "audited" → toujours "claim"
  - Gate Codex 3 : FINANCIAL_MODEL default forecast, override "actuals" sheet
  - Currency parsing (k€, $M, decimal comma FR)
  - Dedup par tuple

- **`claims-extractor-integration.test.ts`** (5 tests Neon, ~13s) :
  - Gate 1 DB end-to-end : CA 2025 + ARR 2026 → dateStart/dateEnd corrects par signal
  - Gate 2 DB : email "réalisé" + "audited" → classification="claim" en DB
  - Gate 3 DB : BP FINANCIAL_MODEL → classification="forecast" en DB
  - Valuation persisté avec amount + currency + classification
  - Idempotence : 2e run → claimsDeduplicated, pas de nouvelles rows

- **`evidence-prelude.test.ts`** (+4 tests Phase 6) : rendu étiquettes ACTUAL/FORECAST/CLAIM, VALUATION_CLAIM avec label "Valorisation".

- **`base-agent-date-rendering.test.ts`** : ajout `claims: []` au baseCtx du fixture (déjà compatible Phase 5).

- **`run-evidence-for-document.test.ts`** : extension de la `toEqual` de "calls downstream services" pour inclure `claimsPersisted: 3, claimsDeduplicated: 1` (le mock `persistTemporalSignals` répond à 2 appels — temporal puis claims).

### État Phase 6
- 1 fichier source ajouté : `claims-extractor.ts`.
- 3 fichiers source modifiés : `evidence/index.ts` (exports), `build-evidence-context.ts` (+ResolvedClaim + collectClaimSignals + query étendue), `run-evidence-for-document.ts` (wiring + return shape), `evidence-prelude.ts` (formatClaimLine + formatAmount).
- 2 fichiers tests ajoutés : `claims-extractor.test.ts` (20), `claims-extractor-integration.test.ts` (5).
- 2 fichiers tests modifiés : `evidence-prelude.test.ts` (+4), `base-agent-date-rendering.test.ts` (+claims field), `run-evidence-for-document.test.ts` (+claims counts).
- Tests : 336/336 unit pass (de 312 à 336 — +20 claims-extractor + +4 prelude). 39/39 DB integration pass (+5 claims).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 6 = done. Stop pour audit Codex round 19 avant Phase 7 (contradictions, freshness, missing evidence).

### Action — Phase 6.1 (corrections post-review Codex round 19)
Codex round 19 a flaggé 2 P1 + 1 P2 :

- **P1 #1 mixed Actuals/Forecast misclassification** : `refineClassification` faisait "first marker wins" avec actual prioritaire sur forecast. Repro : `"Actuals 2025: CA 2025 = 1M€. Forecast 2026: CA 2026 = 3M€."` → CA 2026 classé **actual** (faux, devrait être forecast). Fix : **nearest-marker-wins** — scan le full text (pas juste ±120 window), trouve la distance min entre la claim et chaque marker actual/forecast (`nearestMarkerDistance` helper), pick le marker le plus proche. EMAIL invariant (Gate 2) préservé. Test RED ajouté qui reproduisait le bug → maintenant GREEN.

- **P1 #2 GBP default à EUR** : la regex acceptait `£` mais `parseAmount` retournait `EUR | USD | null`, et `formatAmount` rendait `null` comme `€`. Fix end-to-end :
  - `parseAmount` retourne `ClaimCurrency = "EUR" | "USD" | "GBP"` ou `null`
  - `ResolvedClaim.currency` étendu à `"EUR" | "USD" | "GBP" | null`
  - `collectClaimSignals` propage `GBP`
  - `formatAmount` : `GBP` → `£`, `null` → `" (devise inconnue)"` (JAMAIS `€` par défaut)
  - Tests : `£1.5M` → currency=GBP, amount sans symbole → currency=null, valuation GBP, prelude rendu avec `£` et `(devise inconnue)`

- **P2 citation manquante dans claim prelude** : `formatClaimLine` ignorait `claim.evidenceText`. Fix : ajout `_(citation: "...")_` pattern (même format que `asOf`) avec truncate à 200 chars. Test : claim avec evidenceText → prelude contient la citation pour grounding agent.

### État Phase 6.1
- 2 fichiers source modifiés : `claims-extractor.ts` (nearest-marker logic + GBP type), `build-evidence-context.ts` (ResolvedClaim.currency union étendue + collectClaimSignals GBP).
- 1 fichier source modifié : `evidence-prelude.ts` (formatAmount GBP + null=devise inconnue + claim citation).
- 2 fichiers tests modifiés : `claims-extractor.test.ts` (+4 tests : mixed Actuals/Forecast, GBP, null currency, valuation GBP), `evidence-prelude.test.ts` (+3 tests : GBP rendering, null currency rendering, claim citation).
- Tests : 343/343 unit pass (de 336 à 343 — +7 nouveaux). 44/44 DB integration pass (inchangé Phase 6.1, claims-extractor-integration.test.ts non-impacté).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 6.1 = done. Re-soumission Codex round 20 pour greenlight Phase 7 (contradictions, freshness, missing evidence).

### Action — Phase 6.2 (correction post-review Codex round 20)
Codex round 20 a validé Phase 6.1 (GBP propagé, citations rendues, ancien bug Actuals/Forecast corrigé) mais a flaggé **1 nouveau P1** introduit par le fix nearest-marker :

- **P1 unbounded nearest-marker contamination** : `refineClassification` scannait le full text sans distance max. Repro :
  ```
  Actuals 2025: CA 2025 = 1M€.
  <2000+ chars de filler>
  CA 2026 = 3M€.
  ```
  Sur un FINANCIAL_MODEL, `CA 2026` était classé **actual** car le marker "Actuals 2025" tout en haut était le seul marker du doc — donc le plus proche par défaut. Un seul marker historique en intro d'un BP contaminait toutes les projections en aval.

  Fix : **bounded nearest-marker** — ajout d'une constante `MAX_MARKER_DISTANCE = 600` (~ une section / un paragraphe court). Logique :
  - Si **aucun** marker actual/forecast n'est dans la fenêtre ±600 chars de la claim → fallback `baseClassification` (forecast pour FINANCIAL_MODEL, actual pour FINANCIAL_STATEMENTS, etc.)
  - Si **un seul** marker est dans la fenêtre → ce marker gagne
  - Si **les deux** sont dans la fenêtre → le plus proche gagne (logique nearest préservée)
  - Tie exact → fallback `baseClassification`
  - Gate Codex 2 (EMAIL → claim) **invariant préservé**

### État Phase 6.2
- 1 fichier source modifié : `claims-extractor.ts` (constante `MAX_MARKER_DISTANCE = 600` + logique `actualInRange` / `forecastInRange` + fallback baseClassification).
- 1 fichier tests modifié : `claims-extractor.test.ts` (+2 tests : marker actual loin n'override pas, aucun marker → baseClassification).
- Tests : 345/345 unit pass (de 343 à 345 — +2 nouveaux dont 1 reproduisait le bug Codex round 20).
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 6.2 = done. Re-soumission Codex round 21 pour greenlight Phase 7 (contradictions, freshness, missing evidence).

### Action — Phase 7 (Evidence Health Layer)
Greenlight Codex round 21 obtenu. Phase 7 livre la **couche santé d'évidence** au-dessus de `buildDealEvidenceContext` (Phase 5). Trois détecteurs purs, agrégés et surfacés à l'agent dans un bloc markdown global :

- **Contradictions inter-documents** (`detectContradictions`) : groupe les claims par `(kind, metric, year)`, ignore les claims sans year (pas d'ancrage temporel). Détecte 3 types :
  - **METRIC_MISMATCH** / **VALUATION_MISMATCH** : amounts différents au-delà du seuil `NUMERIC_MISMATCH_RATIO_THRESHOLD = 1.2` (>20% d'écart). Sévérité **HIGH** si au moins un signal est `actual` (bilan vs claim founder) ; **MEDIUM** sinon (claim vs claim, ou claim vs forecast).
  - **CURRENCY_MISMATCH** : devises différentes pour le même claim (EUR vs GBP). Sévérité **LOW** — comparaison numérique non significative.
  - Dédup intra-doc (même `(documentId, amount, currency)` ne déclenche pas).
  - Ordre stable : HIGH → MEDIUM → LOW.

- **Missing evidence** (`detectMissingEvidence`) : 4 checks structurels au niveau deal :
  - `NO_CAP_TABLE_AS_OF` : **HIGH** si CAP_TABLE existe sans `CAP_TABLE_AS_OF`, **MEDIUM** si aucune cap table uploadée.
  - `NO_FINANCIAL_STATEMENTS` : **MEDIUM** si aucun bilan / compte de résultat audité.
  - `NO_FORECAST_PERIOD` : **MEDIUM** si tous les FINANCIAL_MODEL n'ont aucune `FINANCIAL_PERIOD_FORECAST` extraite.
  - `NO_PITCH_DECK_DATE` : **LOW** agrégé sur tous les decks sans `documentDate` et sans `asOf`.

- **Freshness rollup** (`rollupFreshness`) : agrégation des `staleWarnings` per-doc (déjà produits Phase 5) → counts par `StaleWarningKind` au niveau deal.

**Positioning rule (CLAUDE.md règle n°1)** : tous les messages générés (`reason`, `message`) sont en ton **analytique strict** — pas de prescription. Les tests vérifient l'absence des tokens `rejet|investir|no_go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS`.

**Surface agent** : nouveau `formatGlobalEvidenceHealth(report)` dans `evidence-prelude.ts`. Rendu markdown structuré (sections `### Contradictions détectées (N)`, `### Évidences manquantes (N)`, `### Fraîcheur`), badges sévérité `[HIGH]/[MEDIUM]/[LOW]`. **String vide quand rien à signaler** — aucun bruit injecté.

**Wiring** : `base-agent.ts:854` (juste après `formatGlobalEvidenceHeader`). Utilise `context.evidenceContext` déjà chargé par `loadEvidenceContextSafe` (5 sites orchestrator wirés Phase 5.2). Aucun nouveau round-trip DB — pure agrégation in-memory.

### État Phase 7
- 1 fichier source ajouté : `src/services/evidence/health-report.ts` (~280 lignes, pure, zéro DB).
- 3 fichiers source modifiés :
  - `src/services/evidence/index.ts` (exports `buildEvidenceHealthReport` + 7 types).
  - `src/agents/evidence-prelude.ts` (+`formatGlobalEvidenceHealth`, +helpers `formatSeverityBadge`, `formatContradictionSubject`, fix pluriel FR `signal → signaux`).
  - `src/agents/base-agent.ts` (+import, +injection après `evidenceGlobalHeader`).
- 1 fichier tests ajouté : `src/services/evidence/__tests__/health-report.test.ts` (18 tests : contradictions HIGH/MEDIUM/LOW + currency + valuation + dédup + ordre + missing 4 kinds + freshness rollup + empty deal).
- 1 fichier tests modifié : `src/agents/__tests__/evidence-prelude.test.ts` (+6 tests `formatGlobalEvidenceHealth` : empty, contradictions, missing, freshness, tone, valuation).
- Tests : **369/369 unit pass** (de 345 à 369 — **+24 nouveaux**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- `npx prisma validate` clean.
- 0 régression.
- Tasks Phase 7 = done. Re-soumission Codex round 22 pour audit final avant Phase 8 (UI surface).

### Action — Phase 7.1 (corrections post-review Codex round 22)
Codex round 22 a validé techniquement Phase 7 (43/43 tests, tsc/prisma clean) mais flaggé 1 P1 + 1 P2 sur la couverture des findings :

- **P1 VALUATION_CLAIM sans year invisibles** : `detectContradictions` skippait toute claim avec `year === null` pour éviter de comparer "CA sans année" entre docs. Mais l'extractor Phase 6 (`extractValuationClaims`) émet **toutes** les valuations classiques ("valorisation 5M€", "valuation 8M€") avec `year=null` — donc **aucune** contradiction de valorisation deck↔term sheet ne pouvait remonter. C'est précisément le cas business canonique à attraper.

  Fix : skip year=null **uniquement** pour `METRIC_CLAIM` (CA, ARR, etc. sans année restent ambigus). Pour `VALUATION_CLAIM`, year=null est groupé sous la clé `VALUATION_CLAIM|VALUATION|undated`. Le finding sort avec `year: null` dans le payload et le rendu marque "(non datée)" dans le `reason`. RED test ajouté : 2 VALUATION_CLAIM sans year (deck 5M€ claim vs term sheet 8M€ actual) → `VALUATION_MISMATCH HIGH`.

- **P2 NO_FORECAST_PERIOD partiel masqué** : ancien seuil `fmDocsMissingForecast.length === fmDocs.length` — un BP correct masquait totalement un autre BP cassé. Pour un health layer, le BA doit voir **quel doc précis** est inutilisable pour les requêtes forecast.

  Fix : émettre dès que `fmDocsMissingForecast.length > 0`. Sévérité escalée : **MEDIUM** si tous les modèles ratent (deal sans horizon), **LOW** si partiel (avec note "N sur M modèles concernés"). `affectedDocumentIds` reste ciblé sur les docs cassés. RED test : 1 BP OK + 1 BP sans forecast → finding LOW avec affectedDocumentIds=[broken].

### État Phase 7.1
- 1 fichier source modifié : `src/services/evidence/health-report.ts` :
  - VALUATION_CLAIM year=null groupé sous clé "undated" (vs skip total).
  - Year parsing : `yearStr === "undated" ? null : Number(yearStr)`.
  - `buildContradictionReason` et CURRENCY_MISMATCH reason : `yearLabel` conditionnel (`" YYYY"` ou `" (non datée)"`).
  - `NO_FORECAST_PERIOD` : émis dès >0 affecté, sévérité MEDIUM (full) / LOW (partiel) avec note "N sur M".
- 1 fichier tests modifié : `src/services/evidence/__tests__/health-report.test.ts` (+3 tests : VALUATION sans year, NO_FORECAST_PERIOD partiel LOW, NO_FORECAST_PERIOD ok-only sans finding).
- Tests : **372/372 unit pass** (de 369 à 372 — **+3 nouveaux**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 7.1 = done. Re-soumission Codex round 23 pour greenlight Phase 8 (UI surface).

### Action — Phase 8 (UI surface)
Greenlight Codex round 23 reçu. Phase 8 livre la **surface UI** de l'Evidence Health Layer : une API dédiée + un panel deal-level + des badges per-doc. Décisions produit validées avec l'utilisateur en amont :
- **API isolée** `/api/deals/[dealId]/evidence-health` (vs extension du payload deal) — rythme d'invalidation propre, payload deal pas alourdi, auditabilité sécurité plus simple.
- **2 surfaces frontend** : panel deal-level dans l'analysis-panel + badges per-doc dans documents-tab. Contrat API : `{ data: { report: EvidenceHealthReport, byDocument: Record<docId, DocumentHealthSummary> } }` — `byDocument` pré-calculé serveur pour éviter recompute frontend.

**Backend — agrégation per-doc** (`src/services/evidence/health-report.ts`) :
- Nouveau type `DocumentHealthSummary = { contradictionCount, highestContradictionSeverity, missingKinds[], freshnessKinds[] }`.
- Nouveau type `EvidenceHealthBundle = { report, byDocument }`.
- Nouvelle fonction `buildEvidenceHealthBundle(docContexts)` qui appelle `buildEvidenceHealthReport` puis `buildPerDocumentSummary(docContexts, report)`.
- `buildPerDocumentSummary` walk les contradictions (tally par documentId référencé dans `signals[]`, garde max severity), projette `missing` sur `affectedDocumentIds` (deal-level findings sans affected ignorés), et copie verbatim `staleWarnings.kind` per-doc (dédupé).

**API** (`src/app/api/deals/[dealId]/evidence-health/route.ts`) :
- GET pur read, zéro mutation/LLM.
- Sécurité : `requireAuth` + `isValidCuid` + ownership check `Deal.userId === user.id` (IDOR protection, même pattern que `/staleness`).
- Pipeline : `buildDealEvidenceContext(prisma, dealId)` → `buildEvidenceHealthBundle(ctx)` → `{ data: bundle }`.

**Frontend** :
- `src/lib/query-keys.ts` : `queryKeys.evidenceHealth.byDeal(dealId)` (clé granulaire pour invalidation isolée).
- `src/hooks/use-evidence-health.ts` : hook React Query (`staleTime: 30s`, `enabled` guard sur `dealId`).
- `src/components/deals/evidence-health-panel.tsx` : composant deal-level. Sections `Contradictions / Évidences manquantes / Fraîcheur` avec badges sévérité `[HIGH]/[MEDIUM]/[LOW]`. **Empty-state : null** (pas de bruit). Tone analytique strict : *"Ces indicateurs décrivent la qualité du dossier... À vous d'en tirer les conclusions."*
- `src/components/deals/evidence-health-badge.tsx` : badge per-doc compact avec helper `deriveVerdict(summary)` exposé pour test. 3 tiers visuels (rouge HIGH / ambre MEDIUM / slate LOW) avec icône contextuelle (AlertTriangle, AlertCircle, CalendarClock pour freshness-only, Info pour LOW). Tooltip avec breakdown.
- `src/components/deals/analysis-panel.tsx` : injection `<EvidenceHealthPanel dealId={dealId} />` juste après `<EarlyWarningsPanel>` (positioning Phase 7 alignée avec les surfaces analytical existantes).
- `src/components/deals/documents-tab.tsx` : import `useEvidenceHealth`, injection `<EvidenceHealthBadge summary={evidenceHealth?.byDocument[doc.id]} compact />` en tête des badges existants sur chaque doc card.

**Positioning rule (CLAUDE.md règle n°1)** : tous les messages et tooltips testés contre `rejet|investir|no_go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS`. Le panel mentionne explicitement *"À vous d'en tirer les conclusions"* — Angel Desk décrit, le BA décide.

### État Phase 8
- 4 fichiers source ajoutés :
  - `src/app/api/deals/[dealId]/evidence-health/route.ts` (~60 lignes, auth + ownership + agrégation).
  - `src/hooks/use-evidence-health.ts` (~30 lignes).
  - `src/components/deals/evidence-health-panel.tsx` (~190 lignes).
  - `src/components/deals/evidence-health-badge.tsx` (~140 lignes, dont helper `deriveVerdict` testable).
- 4 fichiers source modifiés :
  - `src/services/evidence/health-report.ts` (+`DocumentHealthSummary`, +`EvidenceHealthBundle`, +`buildEvidenceHealthBundle`, +`buildPerDocumentSummary`).
  - `src/services/evidence/index.ts` (exports `buildEvidenceHealthBundle` + 2 nouveaux types).
  - `src/lib/query-keys.ts` (+`evidenceHealth.byDeal`).
  - `src/components/deals/analysis-panel.tsx` (+import + injection panel).
  - `src/components/deals/documents-tab.tsx` (+imports + `useEvidenceHealth` + injection badge per-doc).
- 3 fichiers tests ajoutés :
  - `src/services/evidence/__tests__/health-report.test.ts` (+6 tests bundle : contradictions tally, severity escalation, missingKinds projection, freshness dédup, doc sans finding, structure bundle).
  - `src/app/api/deals/[dealId]/__tests__/evidence-health-route.test.ts` (4 tests : invalid CUID 400, IDOR 404 avec userId scoping vérifié, happy path 200 avec composition pipeline vérifiée, unauth 401 propagation).
  - `src/components/deals/__tests__/evidence-health-badge.test.ts` (9 tests : undefined → null, empty → null, severity tiers, freshness-only icon, mixed HIGH escalation, tone analytique).
- Tests : **402/402 unit pass** (de 372 à 402 — **+30 nouveaux** : 6 bundle + 4 route + 9 badge + 11 autres déclenchés par les nouveaux fichiers/imports). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- `npx prisma validate` clean.
- 0 régression.
- Tasks Phase 8 = done. Re-soumission Codex round 24 pour audit avant Phase 9 (backfill).

### Action — Phase 8.1 (corrections post-review Codex round 24)
Codex round 24 a flaggé 2 P1 + 2 P2 sur la couche UI. Les 4 sont fermés.

- **P1 #1 — Evidence Health stale après upload/extraction** : le hook a `staleTime: 30s` mais aucune mutation dans `documents-tab.tsx` n'invalidait `queryKeys.evidenceHealth.byDeal(dealId)`. Après upload/PROCESSING terminal/delete/rename/OCR-retry, le panel pouvait rester vide alors que l'extraction venait de créer des `EvidenceSignal`.
  - Fix : ajout de `queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) })` à TOUS les 5 sites qui invalident `deals.detail(dealId)` (upload-complete, refreshLocalDocument, rename, delete, onOCRComplete).
  - Guard test ajouté `documents-tab-evidence-invalidation.test.ts` : grep statique qui compte les invalidations `deals.detail` vs `evidenceHealth.byDeal` et exige l'égalité — catch la prochaine régression quand quelqu'un ajoute une nouvelle mutation sans wirer l'invalidation.

- **P1 #2 — Badge per-doc perd la vraie sévérité missing/freshness** : `DocumentHealthSummary` ne stockait que `missingKinds[]` et `freshnessKinds[]` sans sévérité. Le badge defaultait tout à MEDIUM → un `cap_table_stale high` finissait ambre (au lieu de rouge), un `NO_PITCH_DECK_DATE low` finissait ambre (au lieu de slate). La UI contredisait le report.
  - Fix structurel : remplacement de `missingKinds: MissingEvidenceKind[]` par `missing: { kind, severity }[]` (type `DocumentHealthMissingEntry`), et `freshnessKinds: StaleWarningKind[]` par `freshness: { kind, severity }[]` (type `DocumentHealthFreshnessEntry`).
  - `buildPerDocumentSummary` propage maintenant la sévérité réelle (avec normalisation `StaleWarning.severity` lowercase → uppercase). Dédup intra-doc en max-severity (si même kind apparaît 2 fois, garde la plus grave).
  - `deriveVerdict` dans `evidence-health-badge.tsx` calcule un `Math.max(...ranks)` sur tous les findings — vraie sévérité respectée.
  - Tests RED ajoutés : `cap_table_stale HIGH → rouge`, `NO_PITCH_DECK_DATE LOW → slate`. Tests existants updatés au nouveau schéma.

- **P2 #1 — Hook utilisait `fetch` brut au lieu de `clerkFetch`** : risque de cookies Clerk stale en preview/prod. Fix : remplacement `fetch(...)` → `clerkFetch(...)` dans `use-evidence-health.ts`. Guard test ajouté `use-evidence-health.test.ts` qui grep le source pour vérifier l'import + l'usage et l'absence de `fetch(` brut.

- **P2 #2 — Contrat API faux : unauth annoncé 401, retourné 500** : `handleApiError` mappe Unauthorized vers 500 générique. Fix : try/catch local autour de `requireAuth` dans le route handler — si l'erreur est `"Unauthorized"` ou `"Clerk user not found"`, retourne `401 { error: "Unauthorized" }` explicitement ; sinon délègue à `handleApiError`. Tests mis à jour : 401 explicite vérifié + non-régression sur 500 pour autres erreurs (DB down etc.).

### État Phase 8.1
- 4 fichiers source modifiés :
  - `src/services/evidence/health-report.ts` (types `DocumentHealthMissingEntry`/`DocumentHealthFreshnessEntry`, refactor `buildPerDocumentSummary` pour propager severities, helper `normaliseStaleSeverity`).
  - `src/services/evidence/index.ts` (exports des 2 nouveaux types).
  - `src/components/deals/evidence-health-badge.tsx` (`deriveVerdict` lit `summary.missing[].severity` et `summary.freshness[].severity`, tooltip annoté avec sévérité).
  - `src/components/deals/documents-tab.tsx` (5 sites d'invalidation ajoutent `evidenceHealth.byDeal`).
  - `src/hooks/use-evidence-health.ts` (`fetch` → `clerkFetch`).
  - `src/app/api/deals/[dealId]/evidence-health/route.ts` (try/catch dédié sur `requireAuth` pour retourner 401 explicite).
- 2 fichiers tests ajoutés :
  - `src/hooks/__tests__/use-evidence-health.test.ts` (3 guard tests : import clerkFetch, call clerkFetch, no raw `fetch(`).
  - `src/components/deals/__tests__/documents-tab-evidence-invalidation.test.ts` (2 guard tests : utilise `useEvidenceHealth`, invalidations balanced 1:1 entre `deals.detail` et `evidenceHealth.byDeal`).
- 3 fichiers tests modifiés :
  - `src/services/evidence/__tests__/health-report.test.ts` (3 tests updatés au nouveau schéma severities + dédup max-severity).
  - `src/components/deals/__tests__/evidence-health-badge.test.ts` (tous tests updatés au nouveau schéma + 2 RED Codex round 24 : `cap_table_stale HIGH → rouge`, `NO_PITCH_DECK_DATE LOW → slate`).
  - `src/app/api/deals/[dealId]/__tests__/evidence-health-route.test.ts` (test unauth réécrit pour 401 explicite + nouveau test "Clerk user not found" 401 + nouveau test non-régression "DB down" 500 + bundle shape `missing[]`/`freshness[]`).
- Tests : **411/411 unit pass** (de 402 à 411 — **+9 nouveaux**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 8.1 = done. Re-soumission Codex round 25 pour greenlight Phase 9 (backfill).

### Action — Phase 8.2 (correction post-review Codex round 25)
Codex round 25 a validé 3/4 des fixes Phase 8.1 (clerkFetch, severities propagées, badge max-severity, 401 explicite) mais flaggé 1 P1 résiduel — le chemin OCR async PDF restait stale.

- **P1 polling PROCESSING → terminal ne refresh pas Evidence Health** : c'est THE flux principal — upload PDF → OCR durable Inngest → création des `EvidenceSignal` → polling 5s détecte le doc terminal → `setLocalDocuments` met la UI à jour. Mais aucune invalidation `evidenceHealth.byDeal` → le panel et les badges restent sur le cache 30s (ou indéfiniment si aucune autre mutation ne fire). Le guard test Phase 8.1 ne couvrait pas ce cas car il ne checke que les sites qui invalident déjà `deals.detail` — le polling n'en fait pas partie.
  - Fix dans `refreshProcessingDocuments` (`documents-tab.tsx:237`) : détecter si **au moins un** doc a transitionné `processingStatus !== "PROCESSING"` parmi les docs refresh, puis invalider `queryKeys.evidenceHealth.byDeal(dealId)` une seule fois après le `setLocalDocuments`. Évite les invalidations bruyantes à chaque poll quand rien ne bouge.
  - Deps de l'effect mises à jour : `[processingDocumentIdsKey, queryClient, dealId]`.
  - Guard test ajouté dans `documents-tab-evidence-invalidation.test.ts` : grep `processingStatus !== "PROCESSING"` + grep `hasTerminalTransition` à proximité de l'invalidation `evidenceHealth.byDeal`.
  - Invariant balance test relaxé : `evidenceHealthCount >= dealsDetailCount` (vs strict equality) pour autoriser des invalidations evidence-health indépendantes (le polling n'invalide pas `deals.detail`).

### État Phase 8.2
- 1 fichier source modifié : `src/components/deals/documents-tab.tsx` (polling effect : détection transition + invalidation conditionnelle + deps mises à jour).
- 1 fichier tests modifié : `src/components/deals/__tests__/documents-tab-evidence-invalidation.test.ts` (invariant balance relaxé `>=`, +1 test Codex round 25 P1 sur le polling path).
- Tests : **412/412 unit pass** (de 411 à 412 — **+1 nouveau**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 8.2 = done. Re-soumission Codex round 26 pour greenlight Phase 9 (backfill).

### Action — Phase 8.3 (correction post-review Codex round 26)
Codex round 26 a validé le polling Phase 8.2 mais flaggé 1 race résiduelle dans le pipeline d'extraction.

- **P1 race terminal-doc-before-evidence** : `completeDocumentExtractionRun` (`extraction-pipeline.ts:488`) flippe le `processingStatus` du document à `COMPLETED/FAILED/etc.` **AVANT** que `runEvidenceForDocument` (`extraction-pipeline.ts:511`) finisse de persister les `EvidenceSignal`. Côté UI, le polling 5s peut donc :
  1. Voir le doc terminal
  2. Invalider `evidenceHealth.byDeal` immédiatement
  3. Refetch retourne un bundle **vide** (les signaux ne sont pas encore en DB)
  4. Cache le bundle vide pour 30s `staleTime`
  → panel/badges silencieusement vides jusqu'à la prochaine mutation. Cette race ferme exactement le trou Phase 8.2 essayait de fermer.

  Fix minimal (option 1 Codex) : **double invalidation immediate + deferred**.
  - Sur `hasTerminalTransition`, exécute `invalidateEvidenceHealth()` immédiatement (couvre le cas evidence rapide < 100ms)
  - Puis schedule un second `setTimeout(4000ms)` qui rejoue l'invalidation (couvre la fenêtre race typique : extraction evidence se termine bien sous 4s)
  - Constante `TERMINAL_EVIDENCE_RACE_FOLLOWUP_MS = 4_000` nommée pour rendre le compromis lisible (et facile à tuner)
  - Tracking des timeouts pending dans un `Set<number>` pour cleanup sur unmount → pas de fuite mémoire, pas d'invalidation après démontage du composant

  Option 2 (signal backend "evidence completed" via `DocumentExtractionProgress.phase`) volontairement non-retenue pour ce fix-up — elle impliquerait un endpoint ou une refonte du SSE qui dépasse le scope review.

### État Phase 8.3
- 1 fichier source modifié : `src/components/deals/documents-tab.tsx` :
  - Constante `TERMINAL_EVIDENCE_RACE_FOLLOWUP_MS = 4_000`.
  - `Set<number> pendingFollowupTimeouts` pour tracker les timeouts différés.
  - Helper `invalidateEvidenceHealth()` extrait pour réutilisation immediate + deferred.
  - Sur `hasTerminalTransition` : invalidation immédiate + `setTimeout(4s)` qui rejoue + `delete(timeoutId)` après firing + guard `if (!cancelled)`.
  - Cleanup de l'effect : `for (const id of pendingFollowupTimeouts) window.clearTimeout(id)` + `clear()`.
- 1 fichier tests modifié : `src/components/deals/__tests__/documents-tab-evidence-invalidation.test.ts` (+1 test Codex round 26 P1 : grep `window.setTimeout` + `invalidateEvidenceHealth` à proximité + grep `pendingFollowupTimeouts` + grep `window.clearTimeout` dans le cleanup).
- Tests : **413/413 unit pass** (de 412 à 413 — **+1 nouveau**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- 0 régression.
- Tasks Phase 8.3 = done. Re-soumission Codex round 27 pour greenlight Phase 9 (backfill).

### Action — Phase 9 (Evidence backfill script)
Greenlight Codex round 27 reçu. Phase 9 = dernière phase du plan 9-vertical-slices. Objectif : enrichir rétroactivement les `EvidenceSignal` pour les documents créés avant le déploiement des Phases 1-6. Décisions produit validées avec l'utilisateur :

- **Surface : script CLI Node** `scripts/backfill/evidence-signals.ts` (vs Inngest one-shot). Raisons : ops one-shot, pas de feature produit durable ; pas de surface de risque admin ; audit-friendly (logs locaux + JSON summary) ; idempotence native via `runEvidenceForDocument` + `createEvidenceSignal` (P2002 dedupe).
- **Strategy idempotence : skip par défaut, `--force` pour rejouer**. Critère de skip **précis** (vs bool simple) pour éviter la false-skip : vérifier qu'un signal `signalScopeKey === "run:<latestRunId>"` existe pour le doc, PAS juste "any signal exists" — sinon un vieux signal `filename`-scope pourrait masquer un doc qui n'a JAMAIS eu son run OCR traité.

**Helper isolé pour testabilité** : `src/services/evidence/backfill-skip-decision.ts` (~95 lignes pure, 2 prisma reads max). Décision en 4 cas :
- `--force` → process, 0 DB read
- Pas de terminal extractionRun → skip (`no_terminal_extraction_run`)
- ≥1 signal scoped `run:<latestRunId>` → skip (`latest_run_already_processed`)
- Sinon → process (`missing_signals_for_latest_run`)

**Script CLI** (~330 lignes) :
- Args : `--deal-id <id>` | `--all` (mutex requis), `--limit N`, `--dry-run`, `--only-completed` (défaut true), `--include-non-completed` (override), `--since <ISO>`, `--force`, `--summary-out <path>`.
- Query : `prisma.document.findMany({ where: { dealId?, processingStatus?, uploadedAt? }, orderBy: [uploadedAt, id], take: limit })`.
- Pour chaque doc : `shouldBackfillDocument` → si skip, log + continue ; si dry-run, log "would_process" + continue ; sinon `runEvidenceForDocument(prisma, { documentId })` (laisse le helper read+decrypt `extractedText` lui-même via la catch-up path existante).
- Per-doc log line stdout : `OK / skip / dry / FAIL` + signals/claims persisted/deduped + attachments + promoted + reason.
- Summary JSON écrit dans `docs-private/backfills/evidence-signals-<ISO-ts>.json` (path déjà gitignored via `/docs-private`). Contenu : args, totals (candidates/skipped/processed/wouldProcess/failed + sommes signals/claims/attachments), perDoc array complet.
- Disconnect Prisma en `.finally()`.

**Méthode d'exécution recommandée** (sans coupler aux 3 deals dans le code) :
1. Dry-run par deal test : `npx dotenv -e .env.local -- npx tsx scripts/backfill/evidence-signals.ts --deal-id <Avekapeti> --dry-run`
2. Apply test deal : retirer `--dry-run`
3. Élargir aux 2 autres test deals (FurLove, E4N)
4. `--all --limit 50` pour palette représentative
5. `--all` complet une fois confiance acquise

### État Phase 9
- 2 fichiers source ajoutés :
  - `src/services/evidence/backfill-skip-decision.ts` (~95 lignes, helper pure testable).
  - `scripts/backfill/evidence-signals.ts` (~330 lignes, CLI runnable).
- 1 fichier source modifié : `src/services/evidence/index.ts` (export `shouldBackfillDocument` + 3 types `BackfillSkipDecision`/`BackfillSkipReason`/`ShouldBackfillOptions`).
- 1 fichier tests ajouté : `src/services/evidence/__tests__/backfill-skip-decision.test.ts` (6 tests : --force bypass + 0 DB read, no terminal run → skip, run avec signal → skip, run sans signal → process, false-skip guard explicite vérifie WHERE.signalScopeKey === "run:<id>", terminal-statuses correctes `[READY, READY_WITH_WARNINGS, BLOCKED]`).
- Tests : **419/419 unit pass** (de 413 à 419 — **+6 nouveaux**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- `npx prisma validate` clean.
- CLI boot test OK : `npx tsx scripts/backfill/evidence-signals.ts` sans args → erreur attendue `"Either --deal-id <id> or --all is required"`.
- 0 régression.
- Tasks Phase 9 = done. Re-soumission Codex round 28 pour audit final du plan complet 9 phases.

### Action — Phase 9.1 (corrections post-review Codex round 28)
Codex round 28 a validé le squelette Phase 9 mais flaggé 1 P1 critique + 1 P2.

- **P1 skip masque silencieusement des extractors manquants** : la première version du helper utilisait `findFirst({ signalScopeKey: run:<latestRunId> })` qui retournait n'importe quel signal scopé au run. Or `runEvidenceForDocument` persiste **deux familles** distinctes : temporal (`TEMPORAL_EXTRACTOR_VERSION`) puis claims (`CLAIMS_EXTRACTOR_VERSION`). Si un doc avait déjà du temporal mais pas de claims (e.g. crash partiel pipeline, ou claims extractor ajouté après une première extraction), le backfill skippait → claims jamais créés. Symétrique dans l'autre sens.

  Fix structurel : la décision vérifie maintenant la **couverture par extractor** via constante `RUN_SCOPED_EXTRACTOR_VERSIONS_REQUIRED = [TEMPORAL_EXTRACTOR_VERSION, CLAIMS_EXTRACTOR_VERSION]`. Le helper fait un `findMany({ where: { signalScopeKey: run:<id>, extractorVersion: { in: required } }, distinct: ["extractorVersion"] })`, calcule l'ensemble `missing = required - present` et :
  - `missing.length === 0` → skip avec `coveredExtractorVersions[]`
  - `missing.length > 0` → process avec `missingExtractorVersions[]` exposé dans la décision et propagé dans le log per-doc + summary
  - Hook `options.requiredExtractorVersions` pour permettre l'override dans les tests (sans coupler aux constantes réelles)
  - Quand un nouvel extractor run-scoped sera ajouté à `runEvidenceForDocument`, il suffira d'ajouter sa version constante à `RUN_SCOPED_EXTRACTOR_VERSIONS_REQUIRED` pour que le backfill détecte les docs un-enriched.

  **Limitation connue** (Codex round 28, deferred P3) : les extractors qui produisent légitimement zéro signal (e.g. doc sans claim financière) sont indistinguables de "extractor jamais exécuté" sans un ledger. Ces docs seront re-processés à chaque backfill. Coût acceptable (extractors idempotents + rapides) ; un futur `BackfillRunLedger(documentId, extractionRunId, extractorVersion, completedAt)` fermera ce trou.

- **P2 --limit appliqué avant skip** : ancien `take: args.limit` dans le SQL → `--all --limit 50` sur un corpus déjà couvert traitait zéro doc.

  Fix : sémantique de `--limit` changée pour "processed/would_process count" (post-skip). Nouvelle option `--max-candidates` pour le safety cap SQL (défaut `10_000` pour `--all`, unlimited pour `--deal-id`). Boucle break early dès que `processedOrWouldProcess >= args.limit`, flag `limitReached: boolean` exposé dans le summary JSON. Skipped docs ne consomment PAS de budget.

### État Phase 9.1
- 2 fichiers source modifiés :
  - `src/services/evidence/backfill-skip-decision.ts` : type `BackfillSkipDecision` étendu (`coveredExtractorVersions[]` + `missingExtractorVersions[]`, `existingExtractorVersion` retiré), constante `RUN_SCOPED_EXTRACTOR_VERSIONS_REQUIRED` exportée, helper réécrit en `findMany distinct` per-extractor-version, option `requiredExtractorVersions` pour tests.
  - `scripts/backfill/evidence-signals.ts` : ajout `--max-candidates` (défaut 10000 pour `--all`), `--limit` post-skip avec break-early, `limitReached` dans totals, suppression de `existingExtractorVersion`, ajout `coveredExtractorVersions[]`/`missingExtractorVersions[]` dans `PerDocResult` et logs.
- 1 fichier tests modifié : `src/services/evidence/__tests__/backfill-skip-decision.test.ts` réécrit avec 9 tests (de 6 à 9, **+3 nouveaux** : Codex P1 temporal-only-process, Codex P1 claims-only-process, default required versions smoke test). Tests existants migrés au nouveau schéma (mock `findMany` avec versions présentes vs `findFirst`).
- Tests : **422/422 unit pass** (de 419 à 422 — **+3 nouveaux**). 6 skipped DB-gated.
- `npx tsc --noEmit` clean.
- CLI boot tests OK : sans args → erreur attendue ; `--all --limit foo` → `Invalid --limit` ; `--all --max-candidates foo` → `Invalid --max-candidates`.
- 0 régression.
- Tasks Phase 9.1 = done. Re-soumission Codex round 29 pour audit final du plan complet 9 phases.

**Plan complet 9 phases** ✅ :
- Phase 0 ✅ audit + crypto/encryption verification
- Phase 1 ✅ EvidenceSignal schema + composite FK + crypto fields + signalScopeKey
- Phase 2 ✅ temporal extractor (7 patterns déterministes)
- Phase 3 ✅ promotion to sourceDate (race-safe atomic updateMany)
- Phase 4 ✅ attachment linker (Gmail + standard patterns, signal-only)
- Phase 5 ✅ agent prelude (per-doc + global temporal header + cache fingerprint)
- Phase 6 ✅ financial claims (claims-extractor, nearest-marker classification bounded)
- Phase 7 ✅ contradictions + freshness + missing evidence (health-report.ts)
- Phase 8 ✅ UI surface (API + hook + panel + per-doc badges + race fix terminal-doc-before-evidence)
- Phase 9 ✅ backfill CLI + skip-decision helper avec coverage par extractor (Codex 28)

### Fichiers
- `docs-private/evidence-engine-audit.md` (nouveau)
- `docs-private/evidence-engine-phase1-schema.md` (nouveau)
- `scripts/debug/audit-evidence-deals.mjs` (nouveau, untracked)
- `scripts/backfill/evidence-signals.ts` (nouveau, Phase 9)
- `docs-private/backfills/` (créé runtime, gitignored)

---
## 2026-05-15 — Upload/OCR Phase 5 fix-up #3 (scénario 6 step 3 déterministe via /download)

### Contexte
Ré-audit Codex du fix-up #2 — P2 résiduel : le step 3 utilisait `/retry` après `UPDATE storageUrl=NULL`, mais `canRetryPage()` peut court-circuiter avant `downloadFile()` (page déjà retried, status non éligible, etc.). Donc le smoke peut "passer" sans jamais exercer la branche storagePath. Codex a suggéré soit forcer une page NEEDS_REVIEW soit, plus simple, utiliser un endpoint qui télécharge toujours le blob.

### Action
- Scénario 6 step 3 réécrit pour utiliser **`GET /api/documents/[documentId]/download`** au lieu du retry. Cette route n'a pas de pré-condition extraction-state — elle fait `auth → ownership check → downloadFile(storageUrl ?? storagePath) → renvoie les bytes`. Donc `downloadFile()` est GARANTI atteint, et le smoke prouve réellement la branche storagePath-fallback.
- Pass criteria : 200 + bytes après `UPDATE storageUrl=NULL`. Fail signal : 500 + `TypeError [ERR_INVALID_URL]` dans les logs serveur.
- Le retry (steps 1 + 2) reste le smoke OCR happy-path séparé, sans pré-conditions sur `downloadFile`.

### État
- `npx tsc --noEmit` : clean.
- 0 octet NUL dans tous les fichiers Phase 5 touchés.
- Pas de nouveau code ni de tests dans ce fix-up (uniquement le runbook).

### Fichiers
`docs-private/e2e-release-gate.md` (scénario 6 step 3, pass criteria, summary table).

---
## 2026-05-15 — Upload/OCR Phase 5 fix-up #2 (storagePath Blob bug + runbook réponses API)

### Contexte
Ré-audit Codex du fix-up #1 :
- **P1** : `downloadFile` en mode Vercel Blob passait `storagePath` (un pathname comme `deals/<id>/abc.pdf`) directement à `fetch()` → `Invalid URL` pour les rows `storageUrl=NULL`. Le scénario 6 du runbook ne forçait jamais cette branche → bug non détecté. Le pattern `storageUrl ?? storagePath` est pourtant utilisé partout (retry, process, ocr, pipeline, delete-cascade).
- **P2a** : Le runbook lisait mal les réponses API — `/process` répond `{ data: { extractionRunId } }` mais le runbook annonçait `{ extractionRunId }` racine ; `/progress` répond `{ data: progress }` mais le `jq` lisait `phase/percent` à la racine.
- **P2b** : Scénario 6 "refund-on-failure" pas déterministe — pas de moyen reproductible de forcer un échec OCR.

### Action

**P1 — bug storagePath en mode Blob corrigé (`src/services/storage/index.ts`)**
- Dans la branche `isVercelBlobConfigured`, si l'input n'est pas `http(s)://`, résoudre le pathname en URL via `@vercel/blob.head(urlOrPathname)` (accepte les deux formes) puis `fetch(info.url)`. URLs absolues passent through. Le mode local reste inchangé.
- Nouveau test `src/services/storage/__tests__/download-file-blob.test.ts` (4) : pathname → head + fetch ; URL → pas de head ; `http://` accepté aussi ; non-OK fetch throw. Stub `BLOB_READ_WRITE_TOKEN` au top-level AVANT l'import dynamique (un `beforeAll` aurait été trop tard, la constante module est figée).

**P2a — runbook aligné sur les vraies réponses API (`docs-private/e2e-release-gate.md`)**
- Scénario 2 progress poll : `jq '.data | {phase, percent, ...}'`.
- Scénario 5 reprocess : capture `.data.extractionRunId`, pass criteria mis à jour `{ data: { extractionRunId, documentId, processingStatus } }`.

**P2b — scénario 6 réécrit déterministe**
- Step 1 : retry page 1 du fixture `image-only.pdf` (déterministe, page 1 existe toujours).
- **Step 3 (nouveau)** : `psql UPDATE Document SET storageUrl=NULL`, puis retry à nouveau → en mode Blob ce step ECHOUERAIT sans le fix P1 (Invalid URL), il PASSE avec. Smoke réel de la branche storagePath-only. Mode local non affecté (note explicite).
- **Refund-on-failure** : explicitement déclaré **unit-only** dans cette gate, avec pointer vers les unit tests qui prouvent l'invariant (`document-extraction-inngest.test.ts`, `extraction-pipeline.test.ts`, idempotency key du `/retry` route). Forcer une vraie failure OCR live demanderait un flag invasif ; honnête de l'admettre.

### État
- `npx tsc --noEmit` : clean.
- `npx vitest run` : **140 fichiers · 1164/1166** (2 skipped) — vs 1160 avant = +4 (test storage). Aucune régression sur le full run cette fois (les flaky `financial-auditor` se sont comportés).
- `scripts/e2e/generate-fixtures.ts`, `smoke-setup.ts`, `smoke-teardown.ts`, `advisory-lock-live.ts` : tous toujours OK (non touchés).

### Fichiers
`src/services/storage/index.ts`, `src/services/storage/__tests__/download-file-blob.test.ts` (nouveau), `docs-private/e2e-release-gate.md`.

### Registres
- `errors.md` : entrée STORAGE (`downloadFile` Blob pathname) + index.
- Le runbook `🐞 Bugs found` liste désormais les 2 bugs trouvés par Phase 5 (advisory lock + downloadFile).

---
## 2026-05-15 — Upload/OCR Phase 5 fix-up (release gate reproductible + NULs stripped)

### Contexte
Audit Codex Phase 5 : P1 — le runbook 1/2/5/6 listait des fixtures "needed" sans les fournir/générer + plaçait des `<DEAL_ID>`/`<DOC_ID>`/`<PAGE_N>` sans setup/teardown ; un deal au hasard renvoie 404/403 car la route exige `deal.userId === currentUser.id` et `BYPASS_AUTH` se résout en `dev-user-001`. P2 — `errors.md` et `agentic-mistakes.md` contenaient encore de vrais octets NUL (0x00) écrits par mes Edits décrivant le bug NUL.

### Action

**P2 — octets NUL strippés des registres**
- `perl -i -pe 's/\x00/\\0/g' errors.md agentic-mistakes.md`. Vérifié : 0 NUL restants ; `rg` ne traite plus les fichiers comme binaires.

**P1 — release gate reproductible pour 1/2/5/6**
- `scripts/e2e/generate-fixtures.ts` (nouveau) : génère `text-native.pdf` (texte sélectable via `pdf-lib`) et `image-only.pdf` (rasterisation PNG via `pdf-to-img` réintégrée dans un PDF sans couche texte → force l'OCR). Aucun binaire commité, regénérable à volonté. Utilise uniquement des deps déjà présentes.
- `scripts/e2e/smoke-setup.ts` (nouveau) : upsert le dev user `dev-user-001` (mirror de `getOrCreateUser`), crée un Deal frais nommé `E2E-SMOKE-<runId>`, imprime `DEAL_ID=...` parseable par `eval`. Sans ça, l'upload renvoie 404/403.
- `scripts/e2e/smoke-teardown.ts` (nouveau) : **deux gardes de sécurité** — refuse de delete si le deal n'est pas `dev-user-001` ET si son `name` ne commence pas par `E2E-SMOKE-`. Nettoie les blobs AVANT le cascade prisma (pour ne pas perdre les `storageUrl`), puis `prisma.deal.delete` cascade les Documents / ExtractionRuns / Pages via `onDelete: Cascade`.
- `docs-private/e2e-release-gate.md` : runbook réécrit. Setup/teardown sections explicites. Chaque scénario 1/2/5/6 a des commandes curl utilisant `$DEAL_ID`, `$DOC_ID`, `$DOC_ID_OCR`, `$PROGRESS_ID`, `$PAGE_N` capturés depuis les sorties précédentes (`jq`, `uuidgen`). Scénario 2 passe un `progressId` explicite pour pouvoir poller `/api/documents/upload/progress/$PROGRESS_ID` sans la modal UI. Scénario 6 inclut une requête psql pour choisir une page basse-confidence à retry + une requête sur `CreditTransaction` pour vérifier le refund.
- `.gitignore` : `/scripts/e2e/fixtures/` (artefacts regénérables, non commités).

### État
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers verts + 2 fichiers flaky (`agent-pipeline` / `sequential-pipeline` — le `financial-auditor` smoke timeout à 5005ms sous charge parallèle, sans rapport avec ces changements). En isolation : 47/47 verts. Total : 1157/1162 (2 skipped), ou 1160/1162 en isolation des flakys connus.
- `scripts/e2e/generate-fixtures.ts` exécuté → 2 PDF produits (1308 et 52839 octets).
- `scripts/e2e/advisory-lock-live.ts` (Phase 5 #1) : toujours PASS (non touché ce round).
- 0 octet NUL dans les registres (vérifié via `grep -aPc '\x00'`).

### Fichiers
`scripts/e2e/generate-fixtures.ts`, `scripts/e2e/smoke-setup.ts`, `scripts/e2e/smoke-teardown.ts` (nouveaux), `docs-private/e2e-release-gate.md`, `.gitignore`, `errors.md`, `agentic-mistakes.md` (NUL strip).

---
## 2026-05-14 — Upload/OCR Phase 5 (E2E release gate — validation, pas de refactor)

### Contexte
Gate de release : prouver que le flux réel upload/OCR fonctionne, sans refactor. 8 scénarios. Split validé avec l'utilisateur : scénario 8 auto-exécuté ici (lock live, sans écriture) ; scénarios 3/4/7 déjà couverts par la suite Phase 4.1–4.5 ; scénarios 1/2/5/6 livrés en runbook de smoke reproductible (nécessitent la stack complète + crédits OpenRouter).

### 🐞 Bug trouvé et corrigé
`acquireDocumentLineageLock` faisait `tx.$queryRaw` sur `SELECT pg_advisory_xact_lock(...)`. `pg_advisory_xact_lock` retourne `void` → `$queryRaw` throw `P2010 — Failed to deserialize column of type 'void'` en runtime. **L'advisory lock n'a jamais fonctionné** ; chaque upload de version / promotion aurait throw en prod. Masqué par les tests mockés. Fix : `$queryRaw` → `$executeRaw` (exécute le statement, prend le lock, ne désérialise rien). Probé live sur 3 formes possibles. Vérifié live : scénario 8 PASS.

### Action

**Fix du bug (`extraction-runs.ts`)**
- `acquireDocumentLineageLock` : `tx.$queryRaw` → `tx.$executeRaw` + commentaire expliquant pourquoi (`void` non désérialisable).
- 4 fichiers de tests mis à jour : mock `$queryRaw` → `$executeRaw` (`promote-document-version`, `complete-extraction-run-atomic`, `extraction-reuse`, `phase3-leak-findings`).

**Scénario 8 — advisory lock live (`scripts/e2e/advisory-lock-live.ts`, nouveau)**
- Script reproductible, aucune écriture de table : prouve que `acquireDocumentLineageLock` sérialise bien deux transactions concurrentes sur le même lineage, ne bloque pas des lineages différents, et fonctionne via l'URL pgbouncer pooled. Exécuté → **PASS** sur les 3 sous-tests.

**Runbook de smoke (`docs-private/e2e-release-gate.md`, nouveau)**
- Scénarios 1/2/5/6 : prérequis, commandes exactes (curl + psql read-only), critères pass/fail, signaux d'échec. À exécuter par l'utilisateur contre la stack locale.
- Tableau récapitulatif pass/fail des 8 scénarios + carte scénario→test pour 3/4/7 + résultat live du scénario 8 + le bug trouvé.

### État
| # | Scénario | Statut |
|---|---|---|
| 3 | Nouvelle version échoue → ancien reste isLatest | ✅ PASS (suite Phase 4.x) |
| 4 | Nouvelle version réussit → candidate promue | ✅ PASS (suite Phase 4.x) |
| 7 | Timeout forcé → FAILED + refund + pas d'oscillation | ✅ PASS (suite Phase 4.x) |
| 8 | Advisory lock live Postgres | ✅ PASS (script exécuté) |
| 1,2,5,6 | Flux full-stack | ⏳ Runbook livré, à exécuter par l'utilisateur |

- `npx tsc --noEmit` : clean.
- `npx vitest run` : 139 fichiers · **1160/1162** (2 skipped) — le fix du bug ne casse rien.

### Fichiers
`src/services/documents/extraction-runs.ts`, `scripts/e2e/advisory-lock-live.ts` (nouveau), `docs-private/e2e-release-gate.md` (nouveau), + 4 fichiers de tests (mock `$queryRaw`→`$executeRaw`).

### Registres
- `errors.md` : entrée DB ($queryRaw void).
- `agentic-mistakes.md` : entrée TESTING (SQL brut couvert seulement par des mocks → 2 bugs runtime non détectés ; tout chemin SQL brut doit avoir un test live-DB).

---
## 2026-05-14 — Upload/OCR Phase 4.5 (tests — Gate Audit 4 : invariants de durabilité)

### Contexte
Phase finale du plan Codex : prouver les 4 critères du Gate Audit 4 — absence d'état oscillant, retries idempotents, crash recovery, ancien document préservé si nouvelle version failed. L'essentiel a été couvert au fil des sous-phases (chacune auditée avec tests RED par Codex) ; Phase 4.5 = combler les gaps réels + cartographier la couverture. Pas de nouveau "golden" corpus : les invariants de durabilité sont comportementaux, pas des sorties figées (les goldens d'extraction Excel/docx/pptx existants restent hors scope durabilité).

### Action — gaps comblés

**Gap réel : version preservation on FAILURE (`complete-extraction-run-atomic.test.ts`)**
- Nouveau test : une finalisation FAILED (corpus vide) ne déclenche JAMAIS la promotion — assert que rien du chemin de promotion ne tourne (pas d'advisory lock `$queryRaw`, pas de `findUnique` lineage, pas de `updateMany` démote). L'ancien document `isLatest` n'est jamais touché → ancien préservé.
- Nouveau test : une finalisation COMPLETED fait le flip COMPLET via `completeDocumentExtractionRun` — démote l'ancien `isLatest` du lineage (`updateMany` scopé) ET promeut le candidat, dans la même transaction, démote-avant-promote. (Couvrait avant : promotion testée isolément dans `promote-document-version.test.ts` ; le flip via `completeDocumentExtractionRun` n'était pas asserté.)

**Crash recovery explicite (`extraction-pipeline.test.ts`)**
- Nouveau test labellisé : un retry sur un run encore PROCESSING (crash AVANT le commit atomique) → le pipeline ne court-circuite pas, re-run `smartExtract` + `completeDocumentExtractionRun`, finalise proprement. (Le chemin existait via le happy-path mais n'était pas labellisé "crash recovery".)

### Carte de couverture — Gate Audit 4
- **Absence d'état oscillant** : `progress-monotone-guards.test.ts` (16 — gardes DB monotones run + progress) ; `promote-document-version.test.ts` (monotone par version, advisory lock) ; `extraction-pipeline.test.ts` (drop des callbacks tardifs après abort).
- **Retries idempotents** : `extraction-pipeline.test.ts` (retry sur run terminal SUCCESS = no-op ; sur FAILED = throw ; republie le progress terminal) ; `document-extraction-inngest.test.ts` (refund idempotent via `dispatchRefundKey`, réconciliation crédits) ; `process/route.test.ts` (event id déterministe keyé sur `extractionRunId`).
- **Crash recovery** : `extraction-pipeline.test.ts` (retry sur PROCESSING re-run [nouveau] ; `completeDocumentExtractionRun` throw → run terminalisé, pas d'orphelin ; downloadFile/smartExtract throw → run+document terminalisés) ; `document-extraction-inngest.test.ts` (`compensate-failed-extraction` terminalise run+document défensivement).
- **Ancien document préservé** : `complete-extraction-run-atomic.test.ts` (FAILED → pas de promotion [nouveau] ; COMPLETED → flip complet [nouveau]) ; `promote-document-version.test.ts` (gate COMPLETED, monotone) ; `upload/route.test.ts` (nouvelle version créée candidate `isLatest: false`, pas de démote eager).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 139 fichiers · **1160/1162** (2 skipped) — vs 1157 = +3.

### Fichiers
`src/services/documents/__tests__/complete-extraction-run-atomic.test.ts`, `src/services/documents/__tests__/extraction-pipeline.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.4 fix-up #2 (callbacks tardifs — gardes monotones)

### Contexte
Audit Codex Phase 4.4 fix-up — P1 : le `smartExtract` perdant continue en arrière-plan après que la race timeout a gagné. S'il émet ensuite des callbacks `onProgress`, ils peuvent réécrire l'état APRÈS le FAILED : `markExtractionRunProgress` / `recordExtractionPageProgress` faisaient un `update` non gardé → run FAILED reflippé PROCESSING ; `setDocumentExtractionProgress` pouvait écraser une phase terminale `failed`/`completed` par `page_processed` → progress row non-terminal → modal poll à l'infini. Casse l'invariant Phase 4.1 "pas d'état oscillant".

### Action — défense en profondeur sur 3 couches

**Garde callback (`extraction-pipeline.ts`)**
- `onProgress` du pipeline : `if (budgetController.signal.aborted) return` en tête. Première ligne de défense — une fois le budget déclenché, les callbacks du `smartExtract` perdant ne font rien.

**Garde DB monotone — run (`extraction-runs.ts`)**
- Constante `LIVE_RUN_STATUSES = ["PENDING", "PROCESSING"]` (tout le reste — READY, READY_WITH_WARNINGS, BLOCKED, FAILED — est TERMINAL). Réutilisée aussi par `terminalizeExtractionRunAsFailed`.
- `markExtractionRunProgress` : `update` → `updateMany` scopé `status: { in: LIVE }`. Un callback tardif sur un run terminal = no-op 0-ligne. La transition légitime PROCESSING → FAILED passe toujours (PROCESSING est LIVE).
- `recordExtractionPageProgress` : early-return si le run est terminal (read en tête, skip l'encryption + l'upsert) + `update` final → `updateMany` scopé LIVE (backstop atomique pour la fenêtre TOCTOU).

**Garde DB monotone — progress upload (`extraction-progress.ts`)**
- `setDocumentExtractionProgress` : phase terminale (`completed`/`failed`) → upsert (gagne toujours, idempotent). Phase non-terminale → `updateMany` scopé `phase: { notIn: ["completed","failed"] }` ; si 0 ligne → `create` (ligne absente) avec catch P2002 swallowed (writer concurrent terminal). Garde monotone race-free, pas de TOCTOU read-then-write.

### Tests (+17)
- `progress-monotone-guards.test.ts` (16, nouveau) : `markExtractionRunProgress` scopé LIVE + transition PROCESSING→FAILED non bloquée ; `recordExtractionPageProgress` no-op sur run terminal (FAILED/READY/READY_WITH_WARNINGS/BLOCKED/absent) ; `setDocumentExtractionProgress` phase terminale → upsert, phase non-terminale → updateMany scopé, create si absent, P2002 swallowed, autre erreur re-throw.
- `extraction-pipeline.test.ts` (+1) : RED — budget gagne, puis callbacks tardifs `page_processed`/`native_extracted` du `smartExtract` perdant → la garde `onProgress` les drop, zéro nouvelle écriture de progress après abort.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 139 fichiers · **1157/1159** (2 skipped) — vs 1140 = +17.

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/services/documents/extraction-progress.ts`, `src/services/documents/extraction-pipeline.ts`, `src/services/documents/__tests__/progress-monotone-guards.test.ts` (nouveau), `src/services/documents/__tests__/extraction-pipeline.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.4 fix-up (budget GLOBAL réel — race + abort)

### Contexte
Audit Codex Phase 4.4 — P1 : le budget 8 min n'était pas un *vrai* budget global. Le pipeline faisait `budgetController.abort()` puis `await smartExtract(...)` jusqu'à résolution. Les boucles OCR ne checkent le signal qu'entre batchs ; un appel non-coopératif (requête LLM en vol bornée à 90s ; surtout les providers structurés Google/Azure dont les `fetch` n'ont ni signal ni timeout) peut laisser `smartExtract` pendant au-delà de 8 min → le run ne passe pas FAILED à l'heure. P2 : le code `EXTRACTION_TIMEOUT` n'était pas persisté de façon stable (seul `error.message` finissait dans `blockedReason`, sans préfixe stable).

### Action

**P1 — race contre une deadline (`extraction-pipeline.ts`)**
- Le budget combine désormais DEUX mécanismes, aucun suffisant seul :
  1. `budgetController` threadé dans `smartExtract` → les boucles OCR coopératives s'arrêtent (winddown du travail de fond, pas de fuite de compute illimitée).
  2. `budgetDeadline` (Promise qui `reject` à l'expiration du timer) **racé** contre `smartExtract` → le PIPELINE réagit à la deadline même si un sous-appel non-coopératif n'a pas rendu la main.
- `extraction = await Promise.race([extractionPromise, budgetDeadline])`. Ce n'est PAS le vieux `Promise.race` décoratif : ici le signal EST threadé et aborte vraiment le coopératif ; la race garantit juste que le pipeline ne *bloque* pas sur le non-coopératif.
- `extractionPromise.catch(() => undefined)` pour éviter une unhandled rejection si `smartExtract` rejette après que la race a déjà tranché.
- Post-race : `if (budgetController.signal.aborted) throw budgetExceededError()` — couvre le cas où les boucles coopératives ont rendu un partiel pile au déclenchement (la race peut résoudre avec le partiel). Un corpus partiel strict-mode n'est jamais finalisé COMPLETED.

**P2 — code stable persisté**
- `budgetExceededError()` produit un message préfixé `EXTRACTION_TIMEOUT: ...`. Ce préfixe stable finit dans `blockedReason` via `terminalizeExtractionRunAsFailed(runId, error.message)` → greppable pour audit/UI/runbook.

### Tests (+1, 3 au total dans le describe Phase 4.4)
- Nouveau test P1 : `smartExtract` qui ne résout JAMAIS (`new Promise(() => {})`) → `runDocumentExtractionPipeline` rejette quand même `EXTRACTION_TIMEOUT` à `EXTRACTION_TIME_BUDGET_MS` (fake timers). Prouve le budget global.
- Test renommé/clarifié : `smartExtract` qui rend un partiel coopératif au budget → rejet via le post-check `signal.aborted`.
- Les deux assertent `terminalizeExtractionRunAsFailed` appelé avec un reason `/^EXTRACTION_TIMEOUT:/` (P2).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 138 fichiers · **1140/1142** (2 skipped) — vs 1139 = +1.

### Fichiers
`src/services/documents/extraction-pipeline.ts`, `src/services/documents/__tests__/extraction-pipeline.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.4 (budget temps d'extraction réel — AbortController)

### Contexte
Plan Codex item 4 : "soft timeout → real budget". L'ancien upload route avait un soft-timeout *décoratif* (`Promise.race` contre un timer qui n'abortait rien — `smartExtract` continuait à tourner en arrière-plan). Supprimé en Phase 4.2. Résultat actuel : le pipeline durable n'a AUCUN budget temps — une extraction OCR pathologique (PDF scanné volumineux, `maxOCRPages: Infinity`) peut tourner jusqu'à ce que l'infra Inngest la tue (non gracieux, run laissé PROCESSING). Phase 4.4 ajoute un VRAI budget qui aborte effectivement le travail.

### Décisions (validées avec l'utilisateur)
- **Budget dépassé → hard fail + refund** : run+document FAILED avec `EXTRACTION_TIMEOUT`, refund via la machinery existante. Un corpus partiel strict-mode (pages manquantes = financials manquants) n'est pas fiable. Réutilise tout l'existant, pas de scope creep readiness-gate.
- **Valeur : 8 minutes** (`EXTRACTION_TIME_BUDGET_MS`), soft budget interne documenté, doit déclencher avant toute limite infra Inngest. Tunable.

### Action

**Threading de l'AbortSignal dans la chaîne OCR (`ocr-service.ts`)**
- `signal?: AbortSignal` ajouté à `smartExtract`, `extractTextWithOCR`, `selectiveOCR`, `processSelectedPdfPages`, `processAllPdfPages`, `runStructuredProviderPlan`, `runVisualOCRPlan`.
- Les 2 boucles feuilles (`processSelectedPdfPages`, `processAllPdfPages`) checkent `signal?.aborted` en tête de chaque itération de batch → `break` → retournent les pages déjà traitées (partiel). `runStructuredProviderPlan` early-return si aborted (skip l'appel provider potentiellement lent).
- Granularité : check entre batchs. L'OCR par requête est déjà borné à 90s (`OCR_REQUEST_TIMEOUT_MS`) → dépassement max après le déclenchement du budget ≈ 1 batch (~90s). Pas de threading dans `generateOCRCompletion` (v1).

**Budget réel dans le pipeline (`extraction-pipeline.ts`)**
- `EXTRACTION_TIME_BUDGET_MS = 8 * 60_000` exporté + documenté.
- `runExtractionWork` arme un `AbortController` + `setTimeout(abort, budget)`, passe `signal` à `smartExtract`, `clearTimeout` via `.finally()`.
- Après `smartExtract` : si `budgetController.signal.aborted` → `throw ExtractionPipelineError("EXTRACTION_TIMEOUT")`. Le catch externe du pipeline terminalise run+document FAILED, publie `failed`, re-throw → le catch Inngest refund. `EXTRACTION_TIMEOUT` ajouté à l'union de codes. Aucun changement Inngest (passe par la machinery FAILED existante).

### Tests (+5)
- `extraction-pipeline.test.ts` (+2) : budget non dépassé → `AbortSignal` frais non-aborté threadé, COMPLETED normal, timer nettoyé ; budget déclenché mid-extraction (fake timers) → `EXTRACTION_TIMEOUT` + run+document terminalisés FAILED + `completeDocumentExtractionRun` jamais appelé.
- `ocr-service-abort-budget.test.ts` (3, nouveau) : `selectiveOCR` avec signal pré-aborté → stop AVANT tout rendering, 0 page ; sans signal → rendering effectué (preuve que le signal est le gate) ; abort après le 1er batch → 2e batch jamais scheduled.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 138 fichiers · **1139/1141** (2 skipped) — vs 1134 = +5. (Note : un 1er run a montré du flakiness parallèle non lié — circuit-breaker / financial-auditor ; 2e run full green, fichiers concernés verts en isolation.)

### Fichiers
`src/services/pdf/ocr-service.ts`, `src/services/documents/extraction-pipeline.ts`, `src/services/documents/__tests__/extraction-pipeline.test.ts`, `src/services/pdf/__tests__/ocr-service-abort-budget.test.ts` (nouveau).

---
## 2026-05-14 — Upload/OCR Phase 4.3 fix-up #2 (clé d'advisory lock sans NUL)

### Contexte
Ré-audit Codex du fix-up #1 — P1 : `acquireDocumentLineageLock` construisait sa clé avec des octets NUL (0x00) comme séparateur, passés à `hashtext()` comme `text`. PostgreSQL refuse les NUL dans `text` → `$queryRaw` aurait throw au runtime avant de protéger la section critique, à chaque upload et chaque promotion. Non détecté : `$queryRaw` mocké, assertions sur le contenu de la clé seulement.

### Action
- `acquireDocumentLineageLock` : clé construite via `JSON.stringify(["doc-lineage", dealId, name, corpusParentDocumentId ?? ""])` — jamais de NUL brut, délimitation non ambiguë (échappement JSON).
- Test renforcé (`promote-document-version.test.ts`) : `name` contenant un espace, `expect(key).not.toContain("\0")`, `expect(JSON.parse(key)).toEqual([...])`.
- Test DB live réel (`SELECT pg_advisory_xact_lock(hashtext($key))`) → Phase 4.5.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers · **1134/1136** (2 skipped).

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/services/documents/__tests__/promote-document-version.test.ts`.

### Registres
- `errors.md` : entrée DB (clé NUL) + annotation sur l'entrée CONCURRENCE.
- `agentic-mistakes.md` : entrée VÉRIFICATION (Read tool a masqué les NUL, j'ai failli rejeter un finding Codex correct → toujours `od -c` pour les questions au niveau octet).

---
## 2026-05-14 — Upload/OCR Phase 4.3 fix-up (sérialisation concurrence — advisory lock par lineage)

### Contexte
Audit Codex Phase 4.3 — P1 : la garantie "monotone / pas d'oscillation" tenait en séquentiel mais pas en concurrence. `promoteDocumentVersionTx` faisait un check `newerLatest` puis, plus tard, démotait/promouvait — sans isolation ni lock. Scénario : v2 et v3 candidates terminent quasi simultanément ; tx v2 lit "pas de newer latest" pendant que v3 est encore candidate, v3 promeut et commit, puis v2 reprend, démote v3 et promeut v2 → le latest repart en arrière. Note non-bloquante liée : `existingDoc.version + 1` hors transaction → deux uploads concurrents du même filename créent deux v2.

### Action

**Advisory lock transactionnel par lineage (`extraction-runs.ts`)**
- `acquireDocumentLineageLock(tx, lineage)` : `SELECT pg_advisory_xact_lock(hashtext(key))` où `key` dérive de `(dealId, name, corpusParentDocumentId)`. Lock tenu jusqu'à la fin de la transaction. Collisions `hashtext` → au pire deux lineages non liés se sérialisent occasionnellement, jamais d'incorrection.
- `promoteDocumentVersionTx` : prend le lock AVANT le check `newerLatest` et les writes. Le check-then-act est désormais une section critique sérialisée par lineage. Re-read de `processingStatus` DANS le lock (un reprocess concurrent peut avoir bougé le doc hors COMPLETED entre le read pré-lock et le lock). Re-trace du scénario Codex avec le lock : tx v2 prend le lock, tx v3 bloque ; v2 démote v1/promeut v2, commit, libère ; v3 prend le lock, `newerLatest` voit v2... ou ordre inverse : v3 promeut, v2 prend le lock, `newerLatest` trouve v3 (version > 2) → return, v2 reste candidate. Monotone dans les deux cas.
- Un seul lock par transaction (un document = un lineage) → pas de risque de deadlock par ordre de lock.

**Création de version sous lock (`upload/route.ts`)**
- Requête `existingDoc` supprimée de son ancien emplacement. Assignation de version + `document.create` déplacés dans un `prisma.$transaction` qui prend d'abord `acquireDocumentLineageLock`.
- `version = MAX(version) + 1` sur TOUT le lineage (plus seulement la row `isLatest: true`) → deux candidates in-flight obtiennent des numéros de version distincts.
- `isLatest: priorVersionInLineage ? false : true`, `parentDocumentId` = la plus haute version du lineage. Transaction courte (lock + 1 findFirst + 1 create) — l'upload blob reste hors transaction.
- `existingDoc` renommé `priorVersion` (sémantique : plus haute version du lineage, plus "la row isLatest").

### Tests (+5)
- `promote-document-version.test.ts` (+4) : lock pris AVANT le check `newerLatest` et les writes (ordre) ; clé de lock dérivée du tuple lineage ; pas de lock pour un doc non-COMPLETED (fast-exit) ; re-read sous lock → bail si un reprocess concurrent a bougé le doc hors COMPLETED.
- `upload/route.test.ts` (+1) : version assignée + row créée dans un `$transaction` lock-protégé ; `acquireDocumentLineageLock` appelé avec le tuple lineage ; lineage read = `MAX(version)` (orderBy version desc) ; lock avant le read.
- tx mocks étendus (`$queryRaw`, `$transaction`) dans `complete-extraction-run-atomic.test.ts`, `extraction-reuse.test.ts`, `phase3-leak-findings.test.ts`, `upload/route.test.ts`.

### Note (non corrigé ici, suivi explicite)
Index unique partiel "un seul `isLatest: true` par lineage" (filet DB) : suggéré "idéalement" par Codex. Non fait — nécessite une migration SQL brute (Prisma n'exprime pas un index partiel avec `COALESCE` pour gérer le NULL de `corpusParentDocumentId`) + un passage de nettoyage des données existantes potentiellement non conformes. Les locks ferment la race au niveau applicatif ; l'index reste un défense-en-profondeur à planifier séparément.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers · **1134/1136** (2 skipped) — vs 1129 = +5.

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/app/api/documents/upload/route.ts`, `src/services/documents/__tests__/promote-document-version.test.ts`, `complete-extraction-run-atomic.test.ts`, `extraction-reuse.test.ts`, `phase3-leak-findings.test.ts`, `upload/__tests__/route.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.3 (version candidate / isLatest après COMPLETED)

### Contexte
Trou de durabilité versions : à l'upload d'une nouvelle version (même nom + deal), l'ancien document était démoté `isLatest: false` IMMÉDIATEMENT, puis le nouveau créé `isLatest: true`. Si l'extraction de la nouvelle version échouait ensuite, le deal pointait sur un document cassé sans fallback `isLatest`. Exigence Codex : nouvelle version = candidate, `isLatest` bascule seulement après extraction COMPLETED, ancien document préservé si la nouvelle version échoue, pas d'état oscillant.

### Action

**Helper de promotion (`extraction-runs.ts`)**
- `promoteDocumentVersionTx(tx, documentId)` : promotion lineage-scopée, gated COMPLETED, monotone par version.
  - Gate COMPLETED : un document PENDING/PROCESSING/FAILED ne promeut jamais → ancien préservé.
  - Lineage = `(dealId, name, corpusParentDocumentId)` (le tuple exact que l'upload route utilise pour détecter "même document réuploadé").
  - Monotone : si une version strictement plus récente détient déjà `isLatest`, le candidat (plus ancien) reste candidat → pas d'oscillation (une vieille version qui complète tard ne démote pas un winner plus récent).
  - Démote tous les autres `isLatest` du lineage puis promeut le candidat → exactement un `isLatest: true` par lineage.
- `promoteDocumentVersion({ documentId })` : wrapper standalone (`$transaction`) pour les call sites hors transaction.

**Promotion atomique — path PDF durable + reuse**
- `completeDocumentExtractionRun` : appelle `promoteDocumentVersionTx` dans la MÊME transaction que le statut terminal du run, quand `hasUsableCorpus` (le pont COMPLETED ⟺ succès). Aucun nouveau param ni changement Inngest/pipeline.
- `extraction-reuse.ts` : `promoteDocumentVersionTx` dans la transaction de clonage existante (reuse finalise COMPLETED immédiatement, pas de fenêtre PROCESSING).

**Upload route (`upload/route.ts`)**
- Suppression du démote eager de l'ancienne version.
- `prisma.document.create` : `isLatest: existingDoc ? false : true` — nouvelle version = candidate, document neuf = `isLatest: true` (rien à préserver).
- Fin de route : `promoteDocumentVersion` pour les paths inline (image/Excel/Word/PowerPoint) une fois le statut final COMPLETED connu — gardé par `file.type !== "application/pdf"` (PDF durable promeut dans le pipeline, reuse dans sa propre transaction).

### Tests (+12)
- `promote-document-version.test.ts` (10, nouveau) : gate COMPLETED (PENDING/PROCESSING/FAILED → pas de promotion), document absent, démote lineage-scopé + promote, scoping par corpusParentDocumentId, monotone (version plus récente déjà isLatest → pas de promotion), document neuf = no-op inoffensif, wrapper `$transaction`.
- `complete-extraction-run-atomic.test.ts` : tx mock étendu (findUnique/findFirst/updateMany) ; assertion order run → finalize → promote dans la même transaction.
- `upload/__tests__/route.test.ts` (+2) : document neuf créé `isLatest: true` ; version réuploadée créée `isLatest: false` SANS démote eager de l'ancien.
- `extraction-reuse.test.ts` + `phase3-leak-findings.test.ts` : tx mocks étendus pour la promotion.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 137 fichiers · **1129/1131** (2 skipped) — vs 1117 = +12.

### Fichiers
`src/services/documents/extraction-runs.ts`, `src/services/documents/extraction-reuse.ts`, `src/app/api/documents/upload/route.ts`, `src/services/documents/__tests__/promote-document-version.test.ts` (nouveau), `complete-extraction-run-atomic.test.ts`, `extraction-reuse.test.ts`, `phase3-leak-findings.test.ts`, `upload/__tests__/route.test.ts`.

---
## 2026-05-14 — Upload/OCR Phase 4.2 step 2 fix-up (contrat async client + progress terminal sur retry)

### Contexte
Audit Codex du step 2 : 2×P1 + 1×P2. Le serveur a bien migré en async mais le contrat client n'a pas suivi.
- P1a : la modal upload ne pollait pas réellement le progress async (`handleUploadAll` tear-down immédiat).
- P1b : `inngest.send` qui throw → route retournait quand même 201 → toast "succès" alors que l'OCR ne tournera jamais.
- P2 : un retry sur run terminal ne republiait pas le progress terminal → progress row bloqué non-terminal.

### Action

**P1a — modal upload poll réellement l'extraction durable (`file-upload.tsx`)**
- `FileToUpload.status` += `"extracting"`. `UploadApiResult` += `extraction?.pending`.
- `uploadFile` retourne `{ ok, pending, progressId }` ; un PDF `pending` → statut `"extracting"`, `onUploadComplete` différé.
- `handleUploadAll` : si un fichier est `pending`, garde `isUploading` + `activeProgressId` vivants, stocke les counts dans `deferredCountsRef`, ne tear-down PAS.
- Nouveau `useEffect` terminal-watcher : `serverProgress.phase` ∈ {completed, failed} → settle le fichier (`success`/`error`), tear-down, `onAllComplete` avec les counts finaux. Le poller existant continue (isUploading reste true).
- Rendu : `"extracting"` affiché comme un état en cours (spinner bleu).

**P1b — échec d'enqueue → erreur, pas succès (`upload/route.ts`)**
- La branche catch d'enqueue throw `UploadRequestError(503)` au lieu de continuer vers un 201. Le client le transforme en exception → fichier `error`, pas de success toast. Régression Phase 1 fermée.

**P2 — pipeline republie le progress terminal sur retry (`extraction-pipeline.ts`)**
- Branche d'idempotence : run terminal SUCCESS → `publishUploadProgress({ phase: "completed" })` avant `return summarizeExistingRun`. Run terminal FAILED → `publishUploadProgress({ phase: "failed" })` avant `throw`. Idempotent.

### Tests (4 nouveaux)
- `extraction-pipeline.test.ts` (4) : retry terminal READY/READY_WITH_WARNINGS/BLOCKED republie `completed` (it.each) ; retry terminal FAILED republie `failed` avant de throw.
- `upload/__tests__/route.test.ts` : test ajusté — `inngest.send` throw → **503** (plus 201) + refund + terminalize.
- Client `file-upload.tsx` : couvert par tsc + revue (même pattern que le terminal-watcher du audit dialog Phase 4.1 ; pas de RTL dans ce repo).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1117/1117** tests (vs 1113 = +4).

### Registres
- `errors.md` : index + 2 nouvelles entrées (UX + DURABILITÉ). Entrée step 2 annotée "Ce qui N'A PAS fonctionné".

### Dette UX connue (non-bloquante, validée par Codex)
- `file-upload.tsx` est mono-pending : en multi-upload avec plusieurs PDF async, seul le dernier `progressId` est suivi en direct par la modal. Compteurs/toasts peuvent être incomplets dans ce cas. La DB et la liste se rattrapent via le polling des documents PROCESSING. Single-PDF (cas courant) entièrement correct. À traiter comme dette UX réelle si le multi-upload devient fréquent.

---
## 2026-05-14 — Upload/OCR Phase 4.2 step 2 (migration du path PDF de l'upload vers le durable pipeline)

### Contexte
Step 1 (sweep truthiness) audité OK. Step 2 = le cœur de Phase 4.2 : sortir l'extraction PDF de la route HTTP `/api/documents/upload`. Le path PDF faisait `smartExtract` inline (~300 lignes) avec un soft-timeout `setTimeout` décoratif — sur Vercel un PDF long est tronqué sans cleanup.

### Action

**Pipeline `runDocumentExtractionPipeline` étendu**
- Nouveau param `progressPublishing: { uploadProgressId, userId, documentName }` → publie `DocumentExtractionProgress` aux phases started / native_extracted / page_processed / completed / failed (best-effort, ne fait jamais échouer l'extraction). Le poller upload client voit la vraie progression backend.
- Résultat enrichi de `actualCredits` (dérivé de `manifest.creditEstimate.estimatedCredits`).
- `summarizeExistingRun` re-dérive `actualCredits` depuis le run persisté (idempotence retry).

**Inngest function `documentExtractionFunction` étendue**
- Event data : `reconcileCredits?`, `uploadProgressId?`, `documentName?`.
- Forward `progressPublishing` au pipeline.
- Step `reconcile-extraction-credits` (succès, si `reconcileCredits`) : `actualCredits` vs `chargedCredits` → delta charge (`extraction:delta:${runId}`) ou refund (`extraction:reconcile-refund:${runId}`). Idempotent. Le /process flow omet `reconcileCredits` (comportement inchangé).
- Step `trigger-thesis-reextract` (succès, si `reason === "upload"`) : déplacé depuis l'upload route — le document n'atteint COMPLETED que dans la fonction Inngest désormais. Non-bloquant.

**Upload route — path PDF migré**
- Remplacement de ~300 lignes de `smartExtract` inline + soft-timeout décoratif par : `estimatePdfExtractionCost` → pre-charge worst-case → `document.update PROCESSING` → `startDocumentExtractionRun` → `inngest.send('document/extraction.run')`.
- Catch pré-enqueue : refund + `terminalizeExtractionRunAsFailed` + document FAILED (jamais de run orphelin).
- Réponse : `response.extraction = { ...vides, pending: true }` pour un PDF enqueued. Le client poll le progress endpoint.
- Imports nettoyés : `markExtractionRunProgress`, `recordExtractionPageProgress`, `completeDocumentExtractionRun`, `getBlockingPageNumbersFromManifest`, `formatExtractionTierSummary` retirés (plus utilisés sur la surface upload).
- Images / Excel / Word / PowerPoint restent inline (truthiness corrigée step 1) — migration durable ultérieure.

### Tests (16 nouveaux)
- `extraction-pipeline.test.ts` (4) : actualCredits du manifest, progress started→completed publié, progress failed sur throw, pas de progress si `progressPublishing` omis.
- `document-extraction-inngest.test.ts` (8) : reconciliation refund (actual < charged), delta charge (actual > charged), no-op (actual == charged), pas de reconciliation si `reconcileCredits` absent, refund-fail loggé ; thesis re-extract déclenché si thesis existe, pas si absente, pas si `reason !== "upload"`.
- `upload/__tests__/route.test.ts` (4) : event `document/extraction.run` shape + `reconcileCredits: true`, pre-charge AVANT `inngest.send` (ordering), 402 + pas d'enqueue si pre-charge échoue, refund + `terminalizeExtractionRunAsFailed` + document FAILED si `inngest.send` throw.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1113/1113** tests (vs 1097 = +16).

### Registres
- `errors.md` : index + 1 nouvelle entrée ARCHITECTURE.

---
## 2026-05-14 — Upload/OCR Phase 4.2 step 1 (sweep truthiness — gate Codex)

### Contexte
Feu vert Phase 4.2 de Codex, avec gate explicite : les paths legacy upload/OCR qui décident COMPLETED/FAILED via la truthiness brute (`result.text ? ...`) doivent passer à `hasUsableExtractionCorpus()` OU être migrés derrière le durable pipeline. Step 1 = le sweep truthiness (surgical, le gate nommé). Step 2 (à suivre) = migration du path PDF de l'upload vers enqueue Inngest.

### Action — `hasUsableExtractionCorpus` appliqué aux 6 sites inline legacy
- `recordDocumentExtractionRun` (extraction-runs.ts) : `status = hasUsableCorpus ? mapRunStatus(manifest) : "FAILED"` + `readyForAnalysis` gated. Miroir de `completeDocumentExtractionRun`. Couvre les paths image + Office qui utilisent cette fonction.
- Route OCR (`/api/documents/[documentId]/ocr`) : `processingStatus`/`extractedText` gated sur `hasUsableExtractionCorpus(result.text)`.
- Upload route, 4 paths inline :
  - PDF inline : `result.text ? "COMPLETED" : "FAILED"` → `pdfCorpusUsable`.
  - Image : `processingStatus: "COMPLETED"` inconditionnel → `imageCorpusUsable`.
  - Excel : `processingStatus: "COMPLETED"` inconditionnel → `excelCorpusUsable`.
  - Word : idem → `wordCorpusUsable`.
  - PowerPoint : idem → `pptCorpusUsable`.
- Plus aucun site qui décide COMPLETED/FAILED sans passer par le helper partagé.

### Tests (7 nouveaux)
- `extraction-runs.test.ts` (5) : `hasUsableExtractionCorpus` direct — texte réel / vide / whitespace-only / null-undefined / single char.
- `complete-extraction-run-atomic.test.ts` (2) : `recordDocumentExtractionRun` corpus vide → run FAILED même sur manifest `ready_with_warnings` ; corpus non-vide → statut manifest préservé.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1097/1097** tests (vs 1090 = +7). Note : 3 échecs transitoires observés sur un run (smoke tests agent `financial-auditor` timeout 5005ms sous charge parallèle) — confirmés flaky : `agent-pipeline` passe 35/35 en isolation, re-run complet 1097/1097 vert.

### Hors scope step 1 (→ Phase 4.2 step 2)
- Migration du path PDF de l'upload route vers le durable pipeline (enqueue Inngest + reconciliation crédits + publication progress). Les paths image/Office restent inline pour l'instant (truthiness désormais correcte).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ.

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up #4 (helper partagé hasUsableExtractionCorpus)

### Contexte
Audit Codex : le fix-up #3 n'a corrigé QUE `completeDocumentExtractionRun`. Le caller pipeline gardait `const isSuccess = Boolean(extraction.text)`. Pour un corpus whitespace-only : `completeDocumentExtractionRun` force le run FAILED, mais le pipeline construit `documentFinalization` COMPLETED et retourne `status: "COMPLETED"` → divergence run FAILED / document COMPLETED / API COMPLETED + pas de refund.

### Action
- Nouveau helper exporté `hasUsableExtractionCorpus(text)` dans `extraction-runs.ts` — `typeof text === "string" && text.trim().length > 0`. Source unique de vérité.
- `completeDocumentExtractionRun` : `hasUsableCorpus = hasUsableExtractionCorpus(params.text)`.
- `runDocumentExtractionPipeline` : `isSuccess = hasUsableExtractionCorpus(extraction.text)` (remplace `Boolean(extraction.text)`).
- Plus aucune définition dupliquée du "succès d'extraction".

### Tests (1 nouveau)
- `extraction-pipeline.test.ts` : `P1: treats a whitespace-only corpus as a FAILURE (no run/document/API divergence)` (RED→GREEN — `text: "   \n  \t "` + manifest `ready_with_warnings` + `pagesProcessed: 3` → pipeline throw `EXTRACTION_FAILED` + `documentFinalization.data.processingStatus === "FAILED"`).
- Le mock du pipeline test inclut la VRAIE logique de `hasUsableExtractionCorpus` (pas de stub) pour exercer exactement la même définition.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1090/1090** tests (vs 1089 = +1).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ. Entrée fix-up #3 annotée "Ce qui N'A PAS fonctionné" (corrigeait qu'un des 2 call sites).

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up #3 (corpus vide → run forcé FAILED)

### Contexte
Audit Codex : le chemin `text === ""` pouvait encore produire un run terminal non-FAILED. `completeDocumentExtractionRun` mappait le statut du run uniquement depuis le manifest (`mapRunStatus`), sans tenir compte d'un corpus final vide. Le chemin OCR peut retourner `success: true` avec `pagesProcessed > 0` mais `composeOCRText` → `""` (toutes les pages OCR ont `text.length === 0`). Résultat : run `READY_WITH_WARNINGS`/`BLOCKED` + document FAILED → retry no-op sur le run terminal-success → incohérence permanente.

### Action
- `completeDocumentExtractionRun` : `const hasUsableCorpus = params.text.trim().length > 0;` → `status = hasUsableCorpus ? mapRunStatus(manifest) : "FAILED"`. `readyForAnalysis` également gated sur `hasUsableCorpus`.
- Le statut du run ne peut plus contredire "pas de texte exploitable".

### Tests (2 nouveaux dans complete-extraction-run-atomic.test.ts)
- `P1: forces run status FAILED when the final corpus is empty, even if the manifest says ready_with_warnings` (RED→GREEN — manifest `ready_with_warnings` + `pagesProcessed: 3` + `text: "   \n  "` → run FAILED).
- `keeps the manifest-derived status when the corpus is non-empty` (non-régression — corpus réel → READY_WITH_WARNINGS préservé).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1089/1089** tests (vs 1087 = +2).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ.

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up #2 (finalisation succès atomique run + document)

### Contexte
Audit Codex post-fix-up : le commit "succès" n'était pas atomique. `completeDocumentExtractionRun()` terminalisait le run, PUIS `prisma.document.update()` séparément. Crash entre les deux → run terminal-success + document non finalisé, et le retry `summarizeExistingRun` ne re-mute pas le document → run READY + document inexploitable.

### Action

**`completeDocumentExtractionRun` — param `documentFinalization`**
- Nouveau param optionnel `documentFinalization: { documentId, data: Prisma.DocumentUpdateInput }`.
- Quand fourni : `tx.document.update` s'exécute DANS le même `prisma.$transaction` que la terminalisation du run + création des pages. Atomique tout-ou-rien.
- Callers legacy (upload/ocr routes, non migrés) omettent le param → comportement inchangé.

**Pipeline `runDocumentExtractionPipeline` — section 4+5 fusionnée**
- Construit `documentData` (COMPLETED+extractedText si `isSuccess`, sinon FAILED+errorWarning) et le passe en `documentFinalization` à `completeDocumentExtractionRun`.
- Plus aucun `prisma.document.update` séparé. `latestExtractionRunId` utilise `extractionRunId` directement (connu avant la tx).
- Si la transaction rollback → le run reste PROCESSING → le catch global terminalise → retry re-run propre. Jamais run=READY + document non finalisé.

### Tests (4 nouveaux)
- `extraction-pipeline.test.ts` : `P1 (atomicity): when completeDocumentExtractionRun throws, the run is terminalized FAILED and NO orphan run-READY-without-document is left` (RED→GREEN — simule le crash de la tx de finalisation). + 2 tests existants adaptés (assert `documentFinalization` au lieu de `prisma.document.update` séparé).
- `complete-extraction-run-atomic.test.ts` (3 tests) : document update DANS la même tx (même client tx, ordering run→doc), legacy sans `documentFinalization` ne touche pas le document, throw dans la tx propagé au caller.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 136 fichiers · **1087/1087** tests (vs 1083 = +4 : 1 atomicity RED→GREEN + 3 complete-extraction-run-atomic).

### Registres
- `errors.md` : index + 1 nouvelle entrée DURABILITÉ.

---
## 2026-05-14 — Upload/OCR Phase 4.1 fix-up (durabilité : terminaliser runs + compenser FAILED idempotemment)

### Contexte
Audit Codex post-Phase-4.1 a trouvé 4 trous de durabilité (3×P1 + 1×P2) :
- P1.1 : la compensation/catch marquait `Document` FAILED mais pas le `DocumentExtractionRun` → run stuck PROCESSING.
- P1.2 : un retry Inngest voyant un run FAILED retournait `status: "FAILED"` comme succès → pas de refund.
- P1.3 : /process pre-enqueue catch laissait le run orphelin PROCESSING.
- P2 : le client affichait "Extraction terminée" sur le 202 async.

### Action

**Nouveau helper `terminalizeExtractionRunAsFailed(runId, reason)` (extraction-runs.ts)**
- `updateMany WHERE id AND status IN [PENDING, PROCESSING]` → `status: FAILED`.
- Idempotent (no-op si déjà terminal), retourne le count des rows transitionnées. Safe à appeler depuis tous les catch.

**P1.1 — Terminaliser le run dans tous les catch**
- Pipeline : `runDocumentExtractionPipeline` wrappe le travail lourd dans `runExtractionWork` ; un try/catch global terminalise run + document avant re-throw. La garde MIME a migré dans `runExtractionWork` (un non-PDF enqueued terminalise quand même son run).
- Inngest function : le step `compensate-failed-extraction` appelle aussi `terminalizeExtractionRunAsFailed` (défensif si le pipeline crash avant son propre catch).
- /process route : catch pré-enqueue terminalise via `orphanRunId`.

**P1.2 — Compenser les runs FAILED idempotemment**
- Branche d'idempotence du pipeline : run terminal SUCCESS (READY/READY_WITH_WARNINGS/BLOCKED) → `summarizeExistingRun` retourne le résumé caché. Run terminal FAILED → **throw** `ExtractionPipelineError("...", "EXTRACTION_FAILED")` → le retry Inngest passe par le catch → refund idempotent via `dispatchRefundKey`.
- `summarizeExistingRun` ne gère plus le cas FAILED (param `_runStatus` restreint aux 3 statuts SUCCESS).

**P1.3 — /process pre-enqueue catch terminalise le run orphelin**
- Tracker `orphanRunId` : set après `startDocumentExtractionRun`, remis à `null` après `inngest.send` succès. Le catch terminalise si non-null.

**P2 — Client polling-aware (document-extraction-audit-dialog.tsx)**
- `reprocessMutation.onSuccess` stocke `extractionRunId` dans `reprocessRunId`, toast "lancee — traitement en cours" (plus "terminee").
- `useQuery` du audit : `refetchInterval: reprocessRunId ? 3000 : false`.
- `useEffect` terminal-watcher : quand `latestRun.id === reprocessRunId` ET status terminal → clear, toast final (terminee/echouee), invalide readiness.
- `extractionActionPending` inclut `reprocessRunId !== null` → barre de progression maintenue pendant tout le traitement durable.
- `notifyDocumentUpdated` wrappé en `useCallback`.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 135 fichiers · **1083/1083** tests (vs 1080 Phase 4.1 = +3 : P1.2 FAILED-throw, +2 P1.1 terminalize ; idempotency it.each 4→3 cas + 1 test P1.2 dédié ; +1 test /process "no terminalize on success").

### Registres
- `errors.md` : index + 4 nouvelles entrées (3 DURABILITÉ + 1 UX).

---
## 2026-05-14 — Upload/OCR Phase 4.1 (durable pipeline — vertical slice /process route)

### Contexte
Feu vert Phase 4. Phase 4.1 = plus petit vertical slice auditable : Inngest function + service `runDocumentExtractionPipeline` + /process route bascule en enqueue + tests idempotency/crash recovery. Upload (PDF + images + Office docs) et /retry restent inline pour 4.2/4.3.

### Action

**Nouveau service `src/services/documents/extraction-pipeline.ts`**
- `runDocumentExtractionPipeline({ documentId, extractionRunId })` : contient la logique d'extraction (download + smartExtract + completeRun + updateDocument).
- Idempotent : si le run est en état terminal (READY/READY_WITH_WARNINGS/BLOCKED/FAILED), retourne le résumé caché sans re-exécuter.
- Page-level upsert via `recordExtractionPageProgress(runId, pageNumber)` → mid-extraction retry safe.
- Throw `ExtractionPipelineError(code)` avec codes : DOCUMENT_NOT_FOUND / RUN_NOT_FOUND / MIME_UNSUPPORTED / NO_STORAGE / DOWNLOAD_FAILED / EXTRACTION_FAILED.
- PDF only (4.1). Images / Excel / PowerPoint / Word à venir.

**Nouvelle Inngest function `documentExtractionFunction`**
- Event : `document/extraction.run` avec data `{ documentId, extractionRunId, userId, dealId, reason, creditAction?, chargedCredits?, dispatchRefundKey? }`.
- Retries : 1. Concurrency : 3 / `event.data.userId`.
- `step.run('run-extraction-pipeline')` → appelle le service.
- Sur throw : `step.run('compensate-failed-extraction')` → `refundCreditAmount(idempotencyKey=dispatchRefundKey)` + `prisma.document.updateMany({ where: { id, processingStatus: "PROCESSING" }, data: { processingStatus: "FAILED" }})`.
- Si refund retourne `{ success: false }` → log via `logger.error` (user reste débité, surfaceé pour audit).
- Registered dans `functions[]` array.

**Route `/api/documents/[documentId]/process` réécrite (de 327 → 230 lignes)**
- 1. Auth + validation + ownership + running analysis check.
- 2. PDF + storage check (`storageUrl ?? storagePath`).
- 3. Atomic PROCESSING claim (`updateMany where: { id, NOT PROCESSING }`).
- 4. Deduct credits (avec idempotency key `extraction:reprocess:${docId}:${requestId}`).
- 5. `startDocumentExtractionRun`.
- 6. `inngest.send({ id: 'document-extraction:${runId}', name: 'document/extraction.run', data: {...} })`.
- 7. Return 202 `{ data: { documentId, extractionRunId, processingStatus: "PROCESSING" }, creditsCharged }`.
- Pre-enqueue catch : refund + revert PROCESSING claim.
- `maxDuration` : 300 → 30 (HTTP work bounded).

**Tests (24 nouveaux)**
- `extraction-pipeline.test.ts` (12 tests) :
  - Happy path : smartExtract → COMPLETED + shape attendue.
  - requiresOCR flag quand manifest a hard blockers.
  - Idempotency : re-run sur READY/READY_WITH_WARNINGS/BLOCKED/FAILED = no-op (no smartExtract, no document update).
  - Error paths : DOCUMENT_NOT_FOUND, MIME_UNSUPPORTED, RUN_NOT_FOUND, NO_STORAGE, EXTRACTION_FAILED, DOWNLOAD_FAILED.
- `/process/__tests__/route.test.ts` (8 tests) :
  - 202 + enqueue with deterministic event id `document-extraction:${runId}`.
  - Deduct BEFORE send (ordering assertion).
  - 402 + revert PROCESSING quand credit deduction fails.
  - 409 race-condition guard.
  - Refund + revert PROCESSING quand `inngest.send` throw.
  - 400 non-PDF, 403 unowned.
- `document-extraction-inngest.test.ts` (4 tests) :
  - Succès → result returned, no compensation.
  - Pipeline throw → refund + mark FAILED + re-throw.
  - Refund retournant `{ success: false }` → log error, document quand même FAILED.
  - chargedCredits=0 → skip refund.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 135 fichiers · **1080/1080** tests (vs 1056 Phase 3 = +24 : 12 pipeline + 8 route + 4 Inngest).

### Hors scope Phase 4.1 (à venir)
- Phase 4.2 : Upload route bascule en enqueue (PDF first, puis images / Office).
- Phase 4.3 : Version candidate / `isLatest` post-COMPLETED.
- Phase 4.4 : Soft timeout / abort budget réel.
- Phase 4.5 : Tests crash-recovery integration + golden runbook.

---
## 2026-05-13 — Upload/OCR Phase 3 textPreview fail-closed (audit Codex P2)

### Contexte
Mon fix Phase 3.5(d) prétendait fail-closed sur textPreview corrompu, mais utilisait `safeDecrypt` qui swallow l'erreur silencieusement. Le try/catch externe était code mort. Repro live Codex : preview base64 corrompu → `isEncrypted=true, safeDecryptReturnedOriginal=true, clonedDecryptsToOriginalCiphertext=true` (le ciphertext corrompu était propagé tel quel dans la nouvelle row).

### Action

**TDD : 1 test RED écrit AVANT fix**
- "fail-closed: a corrupted encrypted-looking textPreview on the source must throw" — flip d'un byte dans l'auth tag, vérifie que le clonage throw au lieu de propager.

**API encryption.ts — miroir strict pour les strings**
- Nouveau `tryDecryptText(text): DecryptedTextResult` qui retourne `{ kind: "plaintext" | "decrypted" | "corrupted", value?, reason? }`. Pattern identique à `tryDecryptJsonField`.
- `safeDecrypt` documentée explicitement comme "swallow errors" → réservée au display, jamais aux security gates.

**Fix extraction-reuse**
- `reEncryptTextPreviewForReuse` réécrit en switch sur `result.kind`. `corrupted` → throw `CorruptedSourceArtifactError`. Plus de `safeDecrypt` dans le chemin fail-closed.

### Verrouillage par tests (encryption.test.ts)
- 4 tests directs sur `tryDecryptText` : plaintext / decrypted / corrupted / "differs from safeDecrypt" — ce dernier prouve explicitement que les deux helpers divergent sur un input corrompu (exactement le piège que mon fix précédent contenait).
- 4 tests directs sur `tryDecryptJsonField` : absent / plaintext / decrypted / corrupted.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 132 fichiers · **1056/1056** tests (vs 1047 = +9 nouveaux : 1 leak + 8 helper).

### Registres
- `errors.md` : 1 nouvelle entrée SÉCURITÉ.
- `agentic-mistakes.md` : 1 nouvelle entrée API-DESIGN — "réutilisé safeDecrypt dans un fail-closed, try/catch code mort". Avec la note ironique que je venais d'écrire 5 minutes plus tôt une entrée sur "API qui collapse erreurs en sentinel = anti-pattern pour gates" et que j'ai immédiatement réintroduit le même anti-pattern.

---
## 2026-05-13 — Upload/OCR Phase 3 fail-closed sur envelope corrompue (audit Codex P1)

### Contexte
Audit Codex post-Phase-3.5 a trouvé un fail-open résiduel : `safeDecryptJsonField` retournait `null` pour 3 sémantiques distinctes (absent / legacy null / envelope corrompue), et `isPageArtifactToxic` interprétait ce null comme "pas d'artifact vérifiable" → return false sur une envelope chiffrée indéchiffrable. Repro live Codex : `{state:null, toxic:false}` avec `artifact = { _enc: "ad1", data: "not-valid-ciphertext", v: 1 }`. Même bug dans `extraction-reuse.reEncryptArtifactForReuse` qui transformait silencieusement les envelopes corrompues en `Prisma.DbNull`.

### Action

**TDD : 2 tests RED écrits AVANT fix**
- "fail-closed: a corrupted envelope must be toxic, not silently 'no artifact'" — vérifie `isPageArtifactToxic({ _enc: "ad1", data: "garbage", v: 1 }) === true`.
- "fail-closed: a corrupted envelope on the source must NOT be cloned as Prisma.DbNull" — vérifie que `reuseCompletedExtractionForContentHash` throw quand la source a une envelope indéchiffrable.

**API encryption.ts — nouveau type discriminé**
- `DecryptedJsonFieldResult<T>` : `{ kind: "absent" | "plaintext" | "decrypted" | "corrupted", value?, reason? }`.
- `tryDecryptJsonField(value)` retourne ce résultat (callers security-sensitive).
- `safeDecryptJsonField` réécrite comme wrapper qui collapse absent+corrupted en null (rétrocompat).

**Fix toxic gate (extraction-readiness-policy.ts)**
- `isPageArtifactToxic` : check explicite `if (isEncryptedJsonField(artifact))` → `tryDecryptJsonField(...)` → si `kind === "corrupted"`, return true (toxic) AVANT le check `state === null`.
- Une envelope chiffrée structurellement valide qui ne décrypte pas est désormais bloquée par le gate UNVERIFIED_ARTIFACT.

**Fix extraction-reuse**
- `reEncryptArtifactForReuse` réécrit en switch sur `result.kind`. `corrupted` → throw `CorruptedSourceArtifactError`. La transaction Prisma rollback ; le caller fall back sur une vraie ré-extraction.
- `reEncryptTextPreviewForReuse` : si la string ressemble à du chiffré (`isEncrypted`) mais ne décrypte pas, throw aussi.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 132 fichiers · **1047/1047** tests (vs 1045 = +2 nouveaux fail-closed tests).

### Registres
- `errors.md` : 1 nouvelle entrée SÉCURITÉ.
- `agentic-mistakes.md` : 1 nouvelle entrée API-DESIGN — helper "ergonomique" qui collapse des erreurs en sentinel `null` est anti-pattern pour les security gates.

---
## 2026-05-13 — Upload/OCR Phase 3 fix-up (3 sites de lecture artifact ratés — audit Codex P1)

### Contexte
Audit Codex post-Phase 3 a identifié 3 chemins de lecture du champ `artifact` que mon mapping Phase 3.0 avait ratés. Chaque site est un fail-open silencieux du chiffrement Phase 3 :
1. (P1) `extraction-readiness-policy.readPageVerificationState` ne déchiffrait pas → `isPageArtifactToxic(encrypted)` → toujours false → bypass UNVERIFIED_ARTIFACT.
2. (P1) `evidence-ledger.asRecord` ne déchiffrait pas → 0 tables/charts/numericClaims pour tous les agents downstream.
3. (P1) `extraction-reuse` clonait `artifact`/`textPreview` verbatim → une source legacy plaintext produisait une nouvelle row plaintext (re-fuite du corpus).

Demandé en bonus : tests qui ÉCHOUENT aujourd'hui (TDD style) pour chaque bug avant le fix.

### Action

**Méthode : 3 tests RED écrits AVANT fix** (`phase3-leak-findings.test.ts`)
- "flags a parse_failed artifact as toxic whether stored encrypted or plaintext" — vérifie que `isPageArtifactToxic` opère sur les deux formats.
- "returns identical structured counts for encrypted vs plaintext artifacts" — vérifie que le ledger compte les mêmes claims peu importe le format.
- "writes ENCRYPTED artifact + textPreview to the target row even when the source is legacy plaintext" — vérifie qu'un clone reuse ne propage pas le plaintext.
- + 2 régression-guards : clean encrypted reste non-toxic / source déjà encrypted ne fuit pas.

**Fix 3.5(a) — extraction-readiness-policy déchiffre transparently**
- Import `safeDecryptJsonField` dans `extraction-readiness-policy.ts`.
- `readPageVerificationState` et `readVerificationEvidence` font le décrypt en première ligne.
- Tous les callers existants (`isPageArtifactToxic`, plus 3 sites externes) deviennent corrects sans changement de signature.
- Le commentaire d'en-tête "Ne doit dependre d'AUCUN autre module interne" assoupli explicitement pour autoriser `@/lib/encryption` (leaf utility, zéro deps internes).

**Fix 3.5(b) — evidence-ledger.asRecord déchiffre transparently**
- Une seule fonction `asRecord` modifiée pour faire `safeDecryptJsonField(value)` AVANT le type check.
- Les 2 sites de consommation (`buildEvidenceLedgerFromContext` + `countNumericClaims`) deviennent corrects sans changement.

**Fix 3.5(c) — extraction-reuse re-encrypte au clonage**
- Deux nouveaux helpers `reEncryptArtifactForReuse(stored)` + `reEncryptTextPreviewForReuse(stored)` dans `extraction-reuse.ts`.
- Pipeline : `safeDecryptJsonField/safeDecrypt` (handle legacy + encrypted) → `encryptJsonField/encryptText` (fresh IV).
- La target row est TOUJOURS chiffrée, peu importe le format de la source.

### Audit transversal final
- `grep -rnE "page\.artifact"` : 8 sites recensés, tous passent par `safeDecryptJsonField` ou un helper Phase 3.
- `grep -rnE "page\.textPreview"` : 1 site (extraction-reuse), passe par `reEncryptTextPreviewForReuse`.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 132 fichiers · **1045/1045** tests (vs 1040 Phase 3 = +5 nouveaux : 3 RED→GREEN + 2 régression-guards).

### Registres
- `errors.md` : index + 3 nouvelles entrées détaillées (1 SÉCURITÉ + 2 RGPD).
- `agentic-mistakes.md` : 1 nouvelle entrée RECHERCHE — mapping de surface trop étroit (grep sur pattern d'usage au lieu du nom de champ).

---
## 2026-05-13 — Upload/OCR Phase 3 (Privacy DB — chiffrement artifact + textPreview)

### Contexte
Feu vert Codex pour Phase 3 avec exigence non négociable : chiffrement + compat lecture legacy plaintext + tests non-régression sur `DocumentExtractionPage.artifact`, `textPreview` et claims structurés. Gate Codex : "refuse si du texte OCR brut reste lisible en DB hors `Document.extractedText`, sauf metadata non sensible justifiée".

### Action

**3.1 — Helpers chiffrement JSON (compat legacy)**
- `src/lib/encryption.ts` : nouveau `encryptJsonField(value)` qui sérialise + chiffre en AES-256-GCM, retourne `{ _enc: "ad1", data, v: 1 }`.
- `isEncryptedJsonField(value)` : strict envelope detection.
- `safeDecryptJsonField<T>(value)` : (a) envelope → decrypt + JSON.parse, (b) plaintext object → return as-is (legacy compat), (c) null → null, (d) corrupted envelope → null + console.warn.
- 7 tests dédiés couvrant round-trip, IV unique, null inputs, legacy plaintext verbatim, corrupted ciphertext, unicode/nested.

**3.2 — Chiffrer toutes les écritures**
- Wrapper centralisé `encryptExtractionPagePayload({ artifact, textPreview })` dans `extraction-runs.ts`.
- Sites modifiés :
  - `extraction-runs.ts:recordExtractionPageProgress` (upsert).
  - `extraction-runs.ts:buildExtractionPageCreateInput` (batch create via recordDocumentExtractionRun + completeDocumentExtractionRun).
  - `retry/route.ts` (success path via wrapper, failed path via `encryptText` direct).
- `extraction-reuse.ts` non modifié : le clonage copie envelope/plaintext as-is, fonctionne uniformément à la lecture.

**3.3 — Déchiffrer toutes les lectures avec compat legacy**
- `extraction-audit/route.ts` : `safeDecryptJsonField(page.artifact)` + `safeDecrypt(page.textPreview)` avant sérialisation client. Toutes les introspections (`extractArtifactProvider`, `extractArtifactVerification`, `extractSemanticAssessment`, `buildPageEvidenceSummary`) opèrent sur le payload décrypté.
- `extraction-runs.ts:getBlockingPageNumbersFromStoredPages` : `safeDecryptJsonField(page.artifact)` avant `extractSemanticAssessment`.
- `retry/route.ts:canRetryPage` : `safeDecryptJsonField(page.artifact)` avant introspection des tables/charts/numericClaims.
- `document-context-retriever.ts:formatExtractionPageArtifact` : décryption avant build du prompt LLM.
- `ocr-service.ts:normalizeDocumentPageArtifact` : décryption avant validation du cache OCR par hash d'image.

**3.4 — Tests non-régression (`phase3-encryption-compat.test.ts`)**
- 12 tests qui prouvent les 3 invariants gate Codex :
  - (a) `encryptExtractionPagePayload` ne laisse AUCUNE substring du corpus brut lisible dans la forme stockée (audit gate principal).
  - (b) Round-trip exact via `safeDecryptJsonField` + `safeDecrypt`.
  - (c) Legacy plaintext rows retournées verbatim (zero migration).
  - (d) Décision blocking IDENTIQUE pour rows legacy vs encrypted (le risque le plus chiant : un audit dialog qui diverge selon la date d'extraction).
  - (e) Tables / charts / numericClaims / visualBlocks survivent avec égalité stricte.
  - (f) Phase 1 extraction-reuse reste correct (envelope copy → décryption).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 131 fichiers · **1040/1040** tests (vs 1021 pré-Phase 3 = +19 nouveaux : 7 helper + 12 non-régression).

### Migration / rollout
- Aucune migration de schema requise. Le format envelope tient dans le champ Json existant.
- Aucun backfill DB requis. La compat legacy est résolue à la lecture par `safeDecryptJsonField`.
- L'env `DOCUMENT_ENCRYPTION_KEY` est déjà en place (utilisée par `Document.extractedText`).

---
## 2026-05-13 — Upload/OCR Phase 2 résiduel (storageUrl ?? storagePath dans OCR/reprocess)

### Contexte
Codex a feu vert pour Phase 3 mais demande de boucler un P2 résiduel : 3 routes OCR-adjacent bloquaient encore sur `document.storageUrl` seul alors que (1) le schema permet `storagePath` sans `storageUrl` (rows local-dev / legacy), (2) download/preview/delete savaient déjà fallback. Inconsistance connue à fermer maintenant.

### Action
- `process/route.ts:91`, `ocr/route.ts:63`, `retry/route.ts:79` : remplacés par `const storageTarget = document.storageUrl ?? document.storagePath;` + check `!storageTarget` + `downloadFile(storageTarget)`. Message d'erreur : "Document has no storage reference".
- Test ajouté : `retry/__tests__/route.test.ts` "downloads using storagePath when storageUrl is null" — assertion que downloadFile est appelé avec le storagePath quand storageUrl est null.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 130 fichiers · **1021/1021** tests (vs 1020 fix-up = +1 nouveau test storagePath-only).

---
## 2026-05-13 — Upload/OCR Phase 2 fix-up (post-audit Codex P1/P2)

### Contexte
Codex a refusé le gate Phase 2 pour 4 problèmes :
1. (P1) `validateTemporaryBlobUrl` ne bindait pas `blobUrl` à `blobPathname` → cleanup = primitive de delete arbitraire (caller authentifié choisit ce qu'on supprime).
2. (P1) Cleanup armé avant ownership prouvée → première early-return supprime un blob potentiel d'un autre tenant.
3. (P1) `/api/documents/upload/client` n'exigeait pas `pathname.startsWith(\`tmp/document-uploads/${dealId}/\`)` → token généré pour upload dans le namespace d'un autre deal.
4. (P2) Temp pathname incluait le filename original (leak avant cleanup).
5. (P2) Incohérence `storageUrl` seul vs `storageUrl ?? storagePath` (mask, delete document).
Demandé en bonus : tests route upload immédiats (pas Phase 5).

### Action

**P1.1 — Binding strict blobUrl ↔ blobPathname**
- `validateTemporaryBlobUrl` (route.ts) : après les checks domaine + préfixe, extraire `decodeURIComponent(new URL(blobUrl).pathname).replace(/^\/+/, "")` et exiger `=== blobPathname`. Sinon throw UploadRequestError 400. Garantie : tout blob qu'on delete dans un cleanup est bien celui que le caller a déclaré.

**P1.2 — Cleanup armé seulement après ownership**
- POST handler réordonné. Tous les early-returns pré-ownership utilisent `NextResponse.json` direct (pas de cleanup, le blob temp n'est pas prouvé comme étant à nous).
- `cleanupSourceUpload` armé UNIQUEMENT après : (a) URL↔pathname binding, (b) `pathname.startsWith(\`tmp/document-uploads/${dealId}/\`)`, (c) `deal.findFirst({ id: dealId, userId })` succès.
- `bailWithCleanup` créé après l'arming, utilisé pour toutes les checks post-ownership (parent doc, running analysis, MIME, size, signature, dedup).

**P1.3 — Durcir upload/client**
- `onBeforeGenerateToken` (client/route.ts) : nouveau check `pathname.startsWith(\`tmp/document-uploads/${parsedPayload.dealId}/\`)`. Sinon ClientUploadTokenError 400. Empêche un caller de générer un token pour le namespace d'un autre deal.

**P2.1 — Temp pathname opaque**
- `buildTemporaryBlobPathname(dealId: string)` (file-upload.tsx) : `tmp/document-uploads/${dealId}/${crypto.randomUUID()}.enc`. Le filename original n'apparaît plus dans le path Vercel Blob public-readable. Reste dans le body JSON (HTTPS-only).

**P2.2 — Harmonisation storageUrl ?? storagePath**
- `maskDocumentStorage` (deals/[dealId]/route.ts) : strip `storageUrl` ET `storagePath`, compute `hasStorage: Boolean(storageUrl ?? storagePath)`.
- DELETE `/api/documents/:id` : target = `document.storageUrl ?? document.storagePath`.
- Ajout `storagePath: true` au prisma select GET+PATCH deal pour que le mask voie les deux.

**Tests route upload (5 nouveaux, dans `upload/__tests__/route.test.ts`)**
1. blobUrl pathname mismatch blobPathname → 400, deleteFile NOT called, dealFindFirst NOT called.
2. blobPathname dealId segment ≠ body dealId → 400, deleteFile NOT called, dealFindFirst NOT called.
3. Unowned deal (deal.findFirst null) → 404, fetch NOT called, deleteFile NOT called.
4. Owned deal + MIME invalid → 400, fetch NOT called (MIME check pre-fetchBuffer), deleteFile called once sur l'URL temp bound.
5. Multipart + uploadFile success + document.create throws → 500, deleteFile called once sur l'URL finale (cleanup catch-block).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 130 fichiers · **1020/1020** tests (vs 1015 Phase 2 = +5 nouveaux tests route upload).

### Registres
- `errors.md` : 5 nouvelles entrées (3 SÉCURITÉ + 1 RGPD + 1 QA), index complété.
- `agentic-mistakes.md` : 2 nouvelles entrées (SÉCURITÉ-RAISONNEMENT : raté la primitive de delete arbitraire / TESTING : renvoyé tests sécurité à Phase 5 par confort).

---
## 2026-05-13 — Upload/OCR Phase 2 (Blob / Storage — audité par Codex)

### Contexte
Avec Phase 1 gate verte (clerkFetch sweep + refund honnête), passage à Phase 2 du plan Codex sur la surface Blob/Storage. Cinq sous-tâches :
1. Valider deal ownership / running analysis / parent doc / dealId-vs-pathname AVANT de fetch/décrypt le Blob client.
2. Nettoyer le temp blob sur tous les early-returns du handler upload.
3. Tracker le blob final et le cleanup si Document.create / update échoue.
4. DELETE deal doit cascade-delete les blobs documents (pas seulement les rows DB).
5. Remplacer `deals/${dealId}/${filename}` par une clé opaque random + retirer `storageUrl` des réponses client.

### Action

**2.1 — Validation pre-fetch (deferred buffer)**
- `UploadInput` type réécrit avec `source: "multipart" | "blob"` + `fetchBuffer: () => Promise<Buffer>` différé. Plus de fetch direct dans `readBlobUploadInput`.
- POST handler : ordre `deal ownership → parent ownership → running analysis → MIME → size → fetchBuffer()`. Le blob distant n'est pull/décrypté QUE si toutes les checks cheap passent.
- Nouvelle check `blobPathname.startsWith(\`tmp/document-uploads/${dealId}/\`)` : bloque la substitution cross-deal d'un blob temp.

**2.2 — Cleanup temp blob (early-returns)**
- Helper centralisé `bailWithCleanup(status, payload)` qui fait `await cleanupUploadSource; cleanupSourceUpload = null; return NextResponse.json(...)`.
- 7+ early-returns réécrits via ce helper : `!file`, `!dealId`, dealId CUID invalid, blob pathname mismatch, deal not found, parent CUID invalid, parent not found, running analysis, MIME/size, signature, dedup. Avant : seuls MIME/size/signature/dedup faisaient le cleanup.

**2.3 — Cleanup blob final si DB échoue**
- Variable `cleanupFinalBlob: (() => Promise<void>) | null = null` au top du handler. Armée juste après `uploadFile()` (final blob créé). Désarmée juste après `prisma.document.create()` (le row commit garantit que le blob est référencé en DB).
- Catch block enrichi : appelle `cleanupFinalBlob()` si encore armée, en plus du `cleanupSourceUpload`. Si le cleanup échoue, on log `console.warn` sans masquer l'erreur originale.

**2.4 — DELETE deal cascade blobs**
- `src/app/api/deals/[dealId]/route.ts` DELETE : avant `prisma.deal.delete`, `prisma.document.findMany({ where: { dealId }})` puis boucle tolérante aux échecs (try/catch par blob, agrégation dans `blobDeletionErrors[]`).
- Réponse JSON inclut `blobDeletionFailures: number` pour visibilité.
- `console.warn` détaille les blobs qui n'ont pas pu être supprimés (already-deleted, 410, network) — la DB cascade procède quand même.
- 3 nouveaux tests dans `[dealId]/__tests__/route.test.ts` : success path (ordre blob avant DB), 1 blob failure / DB cascade quand même, 404 deal pas owné (aucune storage operation).

**2.5 — Clé opaque blob + suppression storageUrl client**
- Nouveau storage key : `deals/${dealId}/${randomUUID()}${safeExtension}` (au lieu de `deals/${dealId}/${sanitizedFilename}`). dealId prefix conservé pour ops legibility ; filename retiré du path (le `Document.name` DB le conserve pour l'UI).
- Toutes les responses qui sérialisaient `storageUrl` :
  - GET/PATCH `/api/deals/:dealId` : helper `maskDocumentStorage()` transforme `documents[i].storageUrl: string | null` → `documents[i].hasStorage: boolean`.
  - GET/PATCH `/api/documents/:id` : strip `storageUrl` + `storagePath`, ajout `hasStorage`.
  - POST `/api/documents/upload` : même stripping ; type `SafeDocumentResponse` (Omit + hasStorage).
  - SSR `/(dashboard)/deals/[dealId]/page.tsx` : strip dans le map avant de passer aux client components.
- Client : `UploadedDocumentSummary`, `Document` (documents-tab), `DocumentPreviewDialog` props : `storageUrl: string | null` → `hasStorage: boolean`. Gate `disabled={!doc.storageUrl}` → `disabled={!doc.hasStorage}`.

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 129 fichiers · **1015/1015** tests passés (vs 1012 avant Phase 2 = +3 tests DELETE cascade).

### Hors scope Phase 2 (renvoyé aux phases suivantes)
- Phase 3 : chiffrer/neutraliser `DocumentExtractionPage.artifact` + `textPreview` + autres champs OCR brut en DB.
- Phase 4 : Inngest, idempotency, soft timeout, versioning.
- Phase 5 : route tests complets upload (incl. assertions pre-fetch ordering), goldens, fixtures.

---
## 2026-05-13 — Upload/OCR Phase 1 fix-up (post-audit Codex)

### Contexte
Audit Codex sur Phase 1 a remonté deux P1 :
1. Gate clerkFetch pas vraiment vert : `extraction-quality-badge.tsx:367` (POST `/api/documents/:id/ocr`) restait en `fetch` brut, ainsi que `text-preview-dialog.tsx`, `corpus/email-form.tsx` et `corpus/note-form.tsx` (`/api/documents/text`).
2. La branche 422 du retry route annonçait `refundedCredits: 2` en dur sans vérifier le résultat de `refundCreditAmount` — si la provider de crédits retournait `{ success: false }` ou throwait, l'utilisateur restait débité mais l'API affirmait le contraire.

### Action

**Sweep clerkFetch complet (4 fichiers supplémentaires)**
- `extraction-quality-badge.tsx` : `POST /api/documents/:id/ocr` → `clerkFetch`.
- `text-preview-dialog.tsx` : `GET /api/documents/:id?includeText=1` → `clerkFetch`.
- `corpus/email-form.tsx` + `corpus/note-form.tsx` : `POST /api/documents/text` → `clerkFetch`.
- Sanity grep final `grep -rnE "fetch\(['\"\`]/api/(documents|deals/[^/]+/staleness)"` = vide.

**Refund honnête (retry + process routes)**
- `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts` branche 422 :
  - Capture du résultat de `refundCreditAmount` dans `let refundedCredits = 0; let refundFailed = false;`.
  - `try / catch` autour de l'appel pour distinguer throw vs `{ success: false }`.
  - `refundedCredits` set uniquement si `refund?.success === true`, sinon `refundFailed = true` + `console.error` détaillé.
  - Réponse JSON inclut le **vrai** `refundedCredits` (0 ou 2) + `refundFailed` pour le client.
- Catch block du même route : passage de `.catch(() => undefined)` à try/catch avec log explicite "user remains debited".
- `src/app/api/documents/[documentId]/process/route.ts` symétrique sur la branche 500 et le catch.

**Tests refund failure**
- `retry/__tests__/route.test.ts` : 2 nouveaux tests :
  - `refundCreditAmount.mockResolvedValue({ success: false })` → payload `refundedCredits: 0, refundFailed: true`, `console.error` appelé.
  - `refundCreditAmount.mockRejectedValue(new Error("network unreachable"))` → idem.
- Total retry route tests : 4/4 verts.

**Registres**
- `agentic-mistakes.md` : 2 nouvelles entrées (RECHERCHE — sweep grep trop étroit ; COMMUNICATION — refund annoncé sans vérif).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run` : 129 fichiers · **1012/1012** tests passés (vs 1010 avant ce fix-up).

---
## 2026-05-13 — Upload/OCR Phase 1 (hotfix critique audité par Codex)

### Contexte
Codex a livré un plan en 5 phases après audit upload/OCR. Phase 1 = hotfix critique avant tout autre refactor. Quatre points : (1) fuite cross-tenant dans le cache d'extraction par contentHash, (2) Authorization Bearer manquant sur la surface upload/OCR (workaround Clerk SDK), (3) UX upload (failed déclenchait toast success + auto-close ; progress pouvait régresser 36% → 1%), (4) retry OCR (credits non refundés sur échec, requiresOCR jamais remis à false).

### Action

**1.1 Tenant isolation du cache d'extraction**
- Extrait `reuseCompletedExtractionForContentHash` de `src/app/api/documents/upload/route.ts` (~190 lignes) vers `src/services/documents/extraction-reuse.ts` pour testabilité.
- Ajout d'un paramètre `userId` et d'un filtre `deal: { userId }` sur le `findFirst` source.
- Avant : même hash + COMPLETED + extractionRuns READY suffisaient à cloner les artifacts entre tenants (fuite OCR/text/pages). Après : reuse strictement intra-tenant.
- Test : `src/services/documents/__tests__/extraction-reuse.test.ts` (3 tests, dont assertion explicite du filtre `deal: { userId }`).

**1.2 clerkFetch sur la surface upload/OCR**
- `file-upload.tsx` : `/api/documents/upload`, `/api/documents/upload/client` (token Blob), upload final blob → `clerkFetch`.
- `documents-tab.tsx` : staleness, GET document, PATCH (rename), DELETE → `clerkFetch`.
- `document-extraction-audit-dialog.tsx` : extraction-audit, extraction-decision, /process, /extraction-pages/:n/retry (single + batch) → `clerkFetch`.
- `analysis-panel.tsx` : extraction-decision → `clerkFetch`.
- `corpus/attachment-input.tsx` : `/api/documents/upload` → `clerkFetch`.
- Bypasse le `__session` cookie périmé sur preview Vercel (cf. errors.md 2026-05-13 AUTH).
- Test : `src/lib/__tests__/clerk-fetch.test.ts` (4 tests : Bearer attaché, respect des headers user, fallback session-less, server-side no-op).

**1.3 UX upload**
- `mergeMonotonicProgress(prev, next)` extrait comme fonction pure exportée. Empêche tout retour en arrière du percent affiché, sauf phases terminales `completed`/`failed` qui bypassent.
- `applyServerProgress` (callback du composant) utilise ce merge à la place de `setServerProgress(payload)` direct. Le `setServerProgress(null)` reste pour les resets explicites entre fichiers.
- `onAllComplete` signature changée : `() => void` → `(summary: { successCount, errorCount }) => void`. `handleUploadAll` agrège les retours de `uploadFile`.
- `DocumentUploadDialog.handleAllComplete` : si `successCount === 0`, plus de toast "Documents uploadés avec succès" et plus d'auto-close. Si mix succès/échec, toast hybride. Si tout réussi, comportement préservé.
- Test : `src/components/deals/__tests__/file-upload-progress.test.ts` (6 tests : pas de prev, monotonie, hausse autorisée, terminal completed/failed bypass).

**1.4 Retry OCR**
- `src/app/api/documents/[documentId]/extraction-pages/[pageNumber]/retry/route.ts` :
  - Branche 422 (OCR retry returns no usable text) : avant retournait 422 sans rembourser les 2 crédits débités. Maintenant : `refundCreditAmount` avec `idempotencyKey: extraction:refund:supreme-page:${requestId}`, réponse inclut `refundedCredits`.
  - Branche succès : avant `requiresOCR: true` posé inconditionnellement dans la transaction (signifiait "OCR a tourné" mais l'UI lit "OCR encore requis"). Maintenant : si `refreshRunExtractionStats(...).readyForAnalysis === true`, on update `Document.requiresOCR = false` après la transaction.
- `src/app/api/documents/[documentId]/process/route.ts` : symétrique. Branche extraction text vide (500) refund les crédits debités via `EXTRACTION_HIGH_PAGE` avec idempotencyKey reproc-id. Réponse inclut `refundedCredits`.
- Test : `src/app/api/documents/.../retry/__tests__/route.test.ts` (2 tests : selectiveOCR retournant texte vide → refund ; selectiveOCR retournant `success: false` → refund).

### État tests
- `npx tsc --noEmit` : clean.
- `npx vitest run --config vitest.unit.config.ts` : 129 fichiers, 1010 tests passés, 0 régression.

### Hors scope Phase 1 (renvoyé aux phases suivantes du plan Codex)
- Phase 2 : Blob/Storage (ownership deal vs blobUrl, clé opaque random, cleanup blob temp/final, delete deal cascade).
- Phase 3 : Privacy DB (chiffrer/neutraliser `DocumentExtractionPage.artifact` + `textPreview`).
- Phase 4 : Durabilité jobs (Inngest, idempotency, soft timeout, versioning).
- Phase 5 : Route tests, goldens, fixtures OCR capped/skipped.

---
## 2026-05-13 — Pipeline visuelle : ne plus bloquer review après visual extraction réussie

### Contexte
Sur un PDF dont la nouvelle pipeline avait OCR'd 27 pages en high_fidelity + supreme tier avec succès (`quality=100%`), l'UI affichait toujours un dialog "Review requis - Qualité 100%" avec "OCR recommandé" et un bouton "Activer OCR" — alors que l'OCR était déjà fait. L'utilisateur a souligné que c'était précisément ce que la refonte de pipeline était censée éliminer.

### Action
`src/services/documents/extraction-runs.ts:isBlockingReviewPage` :
- Nouveau champ `ocrProcessed?: boolean` sur `ExtractionPageReviewShape`.
- Quand `ocrProcessed === true`, la page n'est plus blocking que pour :
  - Erreur fatale explicite (`did not complete`, `returned no text`, `could not be extracted reliably`), OR
  - `semanticSufficiency === "insufficient"` AND `analyticalValueScore >= 70` (seuil rehaussé de 35 → 70).
- Branche `shouldBlockIfStructureMissing` désactivée post-OCR : la pipeline visuelle ÉTAIT le moyen de capturer la structure ; insister ne donne rien de plus.
- Pages non OCR'd conservent les seuils existants.
- `getBlockingPageNumbersFromStoredPages` étendu pour propager `ocrProcessed` depuis le DB (champ déjà persisté sur `DocumentExtractionPage`).

Effet en cascade : pour les nouvelles extractions où la pipeline visuelle réussit, `blockingPages.length === 0` → `requiresOCR === false` (cf. `upload/route.ts:783`) → le badge passe en vert "Quality X%" et le dialog "Review requis" + "OCR recommandé" ne s'affiche plus.

### Tests
- `npx vitest run src/services/documents/__tests__/extraction-runs.test.ts` → 5/5 ✅
- `npx vitest run src/services/pdf/__tests__/golden-corpus.test.ts` → 3/3 ✅

### Limitation
Les documents extraits AVANT ce fix gardent leur `extractionMetrics.blockingPages` figé dans le DB. Le dialog s'affichera sur eux tant qu'ils ne sont pas re-extraits (bouton "Réessayer l'extraction" ou backfill).

---
## 2026-05-13 — Fix double bug upload : progress Redis-less + Clerk 404 cookie sync

### Contexte
Test live sur preview Vercel (Chrome DevTools MCP) après le bump 6.39.3. Deux bugs distincts identifiés et corrigés ensemble :
1. **Progress data:null permanent** — l'UI restait figée à 35% car `setDocumentExtractionProgress` écrivait dans un `InMemoryStore` isolé par invocation Vercel (`UPSTASH_REDIS_*` non configuré). Les polls dans une autre invocation lisaient une Map vide → `{data:null}`.
2. **Clerk 404 après JWT expiry** — le bump SDK 6.39.3 n'a PAS suffi. Le cookie `__session` reste expiré côté browser tandis que `__session_Gu_eEu8y` est rafraîchi. Le middleware Clerk lit le mauvais cookie.

### Bug 1 — Migration du progress vers Postgres
- Nouveau modèle Prisma `DocumentExtractionProgress` (id=progressId UUID, userId, documentId, phase, pageCount, pagesProcessed, percent, message, expiresAt). TTL 15 min géré dans `getDocumentExtractionProgress` (best-effort cleanup à la lecture).
- Migration SQL `prisma/migrations/20260513115614_document_extraction_progress/`.
- `src/services/documents/extraction-progress.ts` réécrit pour utiliser `prisma.documentExtractionProgress.upsert/findUnique` au lieu du `getStore()`.
- `package.json` : `build` passe à `prisma migrate deploy && next build` pour que les migrations s'appliquent automatiquement sur Vercel (idempotent — n'applique que les pending).

### Bug 2 — Wrapper `clerkFetch` avec Bearer token
- Vérifié dans `node_modules/@clerk/backend/dist/internal.js:910` : `return this.sessionTokenInCookie || this.tokenInHeader;` → le middleware fait fallback sur Authorization header si cookie expiré.
- Nouveau `src/lib/clerk-fetch.ts` : wrapper minimal qui appelle `Clerk.session.getToken()` côté browser et attache `Authorization: Bearer <jwt>` à la requête. Solution générique applicable à n'importe quel endpoint API.
- `src/components/deals/file-upload.tsx` : `fetch(...)` du polling progress remplacé par `clerkFetch(...)`. Autres usages de `fetch` (staleness, etc.) à wrapper progressivement si nécessaire.

### À valider après rebuild preview
- L'UI affiche les vraies valeurs de progress (page count, %) au lieu de rester figée à 35%.
- Aucun 404 sur `/api/documents/upload/progress/...` même après ≥2 cycles d'expiry JWT (>2 min).

---
## 2026-05-13 — Bump @clerk/nextjs 6.36.8 → 6.39.3 (fix preview JWT cookie sync)

### Contexte
Sur les preview Vercel (Clerk en `pk_test_…`), les requêtes API basculent en 404 après ~1 min d'inactivité, alors que l'UI reste loggée. Diag live via Chrome DevTools MCP : le SDK Clerk rafraîchit `__session_Gu_eEu8y` (cookie suffixé par instance) mais pas `__session` (sans suffixe), que lit le middleware. Le middleware reçoit donc un JWT expiré et renvoie la page HTML 404 (visible dans `x-clerk-auth-message: JWT is expired … session_refresh_session_token_ineligible`).

### Action
- `@clerk/nextjs` `^6.36.8` → `^6.39.3` (latest 6.x) via `npm install`. APIs utilisées (clerkMiddleware, auth, currentUser, ClerkProvider, useUser, SignIn/SignUp/UserButton, useClerk) stables sur la fenêtre — pas de breaking change attendu.

### Action complémentaire (côté Clerk Dashboard, hors code)
- Allonger "Session token lifetime" de 60 s à 5-10 min côté instance preview/dev pour réduire la fenêtre d'expo au bug, le temps de valider le fix SDK.

### À valider
- Re-déployer la preview puis refaire un upload long (>3 min) et vérifier qu'aucun 404 n'apparaît sur le polling progress ni sur `/api/deals/*/staleness`.

---
## 2026-05-11 — vault: Création Obsidian-AngelDesk-Brain (LLM Wiki Karpathy)

Création du vault Obsidian de référence pour Angel Desk selon le pattern LLM Wiki Karpathy (déjà éprouvé sur Obsidian-Netgem-Brain). Le vault devient la référence ultime indexée et navigable pour toutes les connaissances projet : doctrine, agents, systèmes, projets, synthèses docs.

### Localisation
- `/Users/sacharebbouh/Documents/Obsidian/Obsidian-AngelDesk-Brain/`

### Contenu (163 pages + raw snapshot)
- **01_Companies** (6) : Angel Desk, Anthropic, OpenRouter, Neon, Clerk, Vercel.
- **02_People** (1) : Sacha Rebbouh.
- **03_Projects** (10) : Refonte 41 Agents, Arc-Light, Fact Store, Live Coaching, AI Board, Reflexion/Consensus, DB Exploitation, Audit Personas, Truncation, Corpus Upload Stabilization.
- **04_Products** (15) : hubs Angel Desk + Tier 0/1/2/3 + Board + Chat + Orchestrator + Maintenance + Context Engine + Funding DB + Fact Store + Live Coaching + Reflexion + Consensus.
- **05_Documents** (30) : synthèses des .md du repo (CLAUDE, reference.yaml, dbagents, errors, changes-log, ai-board, FACT-STORE-SPEC, LIVE-COACHING-SPEC, REFLEXION-CONSENSUS, DB-EXPLOITATION, AGENT-REFONTE, audit-personas, truncation, investor, exec-summary, product-overview, pitch-deck × 2, market-research × 2, workinprogress, arc-light, README, + 7 docs/engines).
- **06_Concepts** (85) : doctrine (12), architecture/infra (10), métier (10), Tier 0 (3) + Tier 1 (13) + Tier 2 (22) + Tier 3 (8) + Board (3) + Maintenance (4) = 53 agents documentés.
- **07_Sources** (5) : Anthropic API, OpenRouter, shadcn ui, Vercel Blob, Neon.
- **_MOC** (7) : hubs humains de navigation.
- **_Templates** (9), **CLAUDE.md** (schema vault), **README.md**, **index.md** (catalogue), **log.md** (journal append-only).
- **raw/snapshots/2026-05-11/** : 31 fichiers copiés depuis angeldesk repo (immutable Karpathy).

### Doctrine inscrite dans le vault
- Anti-prescriptive : aucune page ne dit "Angel Desk recommande X" (cf. règle N°1 projet).
- 5 directives anti-hallucination appliquées au contenu du vault (citation systématique, [UNCERTAIN]/[UNVERIFIED] si extrapolation).
- Anti-doublon primordial avant toute écriture (cf. `_LLM-WIKI-PATTERN.md` Sacha).
- Workflows : ingest / query / lint / snapshot codifiés dans `CLAUDE.md` du vault.

### Vérification finale
- 163 pages content, 0 lien cassé réel (8 placeholders pédagogiques dans templates/CLAUDE.md vault).
- Index exhaustif machine-lisible (`index.md`) + 7 MOCs humains.
- Seed log dans `log.md`.

### À enrichir au prochain ingest dédié
- reference.yaml (1782 lignes), investor.md (5014 lignes), REFLEXION-CONSENSUS-ENGINES.md (4216 lignes) : lecture intégrale et synthèse approfondie.
- 10 experts Tier 2 marqués `agent_status: spec` (Biotech, EdTech, PropTech, Mobility, FoodTech, HRTech, LegalTech, Cybersecurity, SpaceTech, Creator).

### MAJ 2026-05-12 (lectures intégrales COMPLÈTES — session unique)

**Toutes les lectures restantes complétées en session.** Aucun "à enrichir" / "à approfondir" résiduel dans le vault.

- FACT-STORE-SPEC (1262L restantes), investor.md (2914L restantes), REFLEXION-CONSENSUS-ENGINES (2596L restantes), AGENT-REFONTE (1052L restantes), audit-failles (362L restantes), LIVE-COACHING (544L restantes), dbagents (951L restantes) → **TOUTES lues intégralement (~9700L)**.
- 22 Tier 2 experts source code confirmé tous IMPL. Pages mises à jour `spec` → `active`.
- Prisma schema.prisma lu (2502L, 50+ modèles + enums).
- 6 docs short pitch-deck/pitch-deck-slides/gemini-market-research/market-research-gemini/workinprogress/arc-light-renderer-spike : lus intégralement et enrichis.
- 2 nouveaux concepts créés : [[Sector Standards Management]] + [[Calculs Arithmétiques en Code]].
- 2 nouvelles entités créées : [[ChatGPT]] + [[Claude]] (mentionnés comme concurrents DIY).
- **189 pages content au final** (vs 187 phase 16-23, vs 163 seed initial).
- 0 lien cassé.
- Audit-failles personas : status 102/102 ✅ COMPLÉTÉE (4 waves × ~180h effort).
- Live Coaching : 7/7 phases ✅ complétées.

### MAJ 2026-05-11 (ingest enrichissement — même session)
**Phases 16-23 exécutées** : lecture intégrale reference.yaml + chunks substantiels investor.md / REFLEXION-CONSENSUS / AGENT-REFONTE / audit-failles / LIVE-COACHING / dbagents.

**+24 pages ajoutées** :
- 12 concepts : [[Sublimation]], [[L'IA Augmentée]], [[Analyse Vivante (V1-V2-V3)]], [[Data Reliability Classification]], [[Temporal Detection]], [[Pricing Model & Credits]], [[Persona Marie]], [[Anti-DIY Pitfalls]], [[Question Persistence]], [[ROI Simulator]], [[Challenge Partner]], [[Track Record Visible]].
- 12 entités : 7 concurrents (Harmonic $1.45B, Hebbia $700M, AlphaSense $4B, PitchBook, CB Insights, Dealroom, Carta) + 5 stack additions (Inngest, Ably, Recall.ai, Deepgram, Fly.io).

**8 pages massivement enrichies** :
- Doc - reference.yaml (Bible Technique) : 34 sections couvertes (TAM/SAM/SOM, scoring methodology, Board AI 4 LLMs, Live Coaching pipeline 6 composants, engines V3.0, anti-hallucination 60+ fichiers, moat triple, pricing crédits 6 packs, persona Marie, unit economics, 7 objections, roadmap).
- Doc - investor.md : 200+ lignes de synthèse, flag des divergences vs reference.yaml (positioning, count agents, pricing).
- Doc - REFLEXION-CONSENSUS-ENGINES : V3.0 complet (types TypeScript, system prompts, source hierarchy 5 ranks).
- Doc - AGENT-REFONTE-PROMPT : anti-patterns + standards + format sortie par agent + discrepancy count agents.
- Doc - audit-failles-personas : TOP 10 failles convergentes + 25 CRITICAL + 9 verdicts personas.
- Doc - dbagents.md : 4 agents détaillés + tests validés (Brave Search + DeepSeek option A) + Telegram bot + Schema Prisma + coûts $2.50-5/mois.
- Consensus Engine + Reflexion Engine + Live Coaching System (pages hubs).

**Vault final** : **187 pages content** (+15% vs seed initial 163), 0 lien cassé réel.

**Découvertes critiques captées** :
1. Positionnement actualisé reference.yaml 2026-03-10 : ancien claim BA-only obsolète.
2. Drift count agents (44 vs 41 vs 40 vs 38 selon les docs).
3. Mono-modèle Gemini 3 Flash hardcodé = CRITICAL (4 personas convergent — F02 dans audit).
4. Scoring 100% LLM non déterministe = CRITICAL (F03).
5. Pricing model : passage FREE/PRO 249€ → crédits 6 packs.
6. Sublimation/L'IA Augmentée/Analyse Vivante = 3 moats marketing centraux (pas formalisés au seed).

---
## 2026-04-22 — fix: Suppression middleware.ts deprecie (Next.js 16)

Next.js 16 a deprecie la convention `middleware.ts` au profit de `proxy.ts`. Les deux fichiers coexistaient (contenu quasi-identique), ce qui bloquait le dev server au demarrage avec "Both middleware file and proxy file are detected".

### Fichiers
- `src/middleware.ts` **supprime** (doublon de `src/proxy.ts`)
- `src/proxy.ts` conserve (clerkMiddleware + BYPASS_AUTH + isPublicRoute identiques)

---
## 2026-04-17 — fix: Audit-driven hardening — 24+ items P0/P1/P2 corriges (pipeline, credits, UI, board, chat)

Suite a 5 audits paralleles (orchestrator, UI, API/data, credits, board/chat) qui ont
identifie 24+ bugs dont 13 P0 (money / fonctionnel), corrections chirurgicales pour
un systeme thesis-first production-ready.

### P0 — Fonctionnel & money
1. **Checkpoint manquant sur pause** (`orchestrator/index.ts`) : `saveCheckpoint` desormais appele pendant pauseAfterThesis. Avant : `resumeAnalysis` throwait "no checkpoint" → continue/contest casse.
2. **Thesis stale sur resume** (`orchestrator/index.ts`) : `resumeAnalysis` rehydrate enrichedContext.thesis via thesisService.getLatest(). Avant : Tier 1/2/3 reconciler repartaient sans contexte.
3. **Non-fatal thesis fail + refund** (`orchestrator/index.ts`) : si thesis-extractor null avec pauseAfterThesis=true, l'analyse abort FAILED. Avant : silent fallthrough sans gate.
4. **/decision refund mint 2cr** (`decision/route.ts`) : valide mode="full_analysis" + refundedAt=null avant refund. Avant : route mintait 2cr pour n'importe quel deal avec these.
5. **Admin backfill idempotency** (`backfill/route.ts`) : key stable `admin-thesis-backfill:${admin}:${deal}:${prevThesisId}`. Avant : Date.now() = double-charge sur click.
6. **Admin + upload double-charge** (`inngest.ts`) : thesisReextractFunction skip BA deduct si triggeredByAdminId. Avant : admin 2cr + BA 1cr meme operation.
7. **Thesis.create() race** (`thesis/index.ts`) : advisory lock Postgres pg_advisory_xact_lock + SERIALIZABLE + updateMany({isLatest:false}). Avant : 2 rows isLatest=true possibles.
8. **Refund amounts alignes 3cr partout** (decision route + modal) : 5cr Deep Dive - 2cr Tier0/extraction = 3cr. Avant : modal 2cr, phase3 3cr, mismatch.
9. **Null event broadcast** (`decision/route.ts`) : inngest.send skip si pausedAnalysis null. Avant : analysisId:null pollue.
10. **THESIS_DEBATE invisible** (`ai-board-panel.tsx` + nouveau `thesis-debate-view.tsx`) : filter roundType, render dedie avec solidite/critique/recommandations. Avant : persist DB mais UI vide.
11. **Chat intent THESIS dead code** (`deal-chat-agent.ts`) : classifier liste THESIS + keywords (these, why-now, moat, YC, Thiel, PMF, monopoly, contrarian). Avant : jamais emis.
12. **5 directives anti-hallucination** (`thesis/types.ts` helper + 4 prompts injectes) : CLAUDE.md respecte. Avant : violations dans thesis-extractor + YC/Thiel/Angel Desk.
13. **Chat thesisBypass hardcoded false** (`chat/[dealId]/route.ts`) : propage depuis Analysis.thesisBypass. Avant : chat ignorait le bypass BA.

### P1 — Robustesse
14. **compensate double-compensation** (`inngest.ts`) : phase3 fail apres paused=true → refund PARTIEL 3cr au lieu de integral 5cr. Avant : user gagne 5cr + these.
15. **Rebuttal cap race** (`thesis/index.ts` + routes) : recordDecision("contest") en tx SERIALIZABLE avec SELECT FOR UPDATE. Retourne null si race → routes refund + 429.
16. **Rate limits** (decision 10/min + rebuttal 5/min) : checkRateLimitDistributed.
17. **Deals/page orderBy** sur include theses.
18. **getHistory pagination** take=20 par defaut.

### P2 — UX & consistance
19. **thesis_only mode label** ajoute.
20. **ThesisPayload.createdAt** exposé → RevisionBanner utilise vrai timestamp.
21. **Modal auto-open race guard** : !!thesis required.
22. **Alerts board capped** top 10 severity-sorted + "+N autres".
23. **Thesis section en tete chat prompt** : resume avant deal info pour anti-truncation.
24. **Thesis-extractor + reconciler dans contract penalty list**.
25. **Legacy refund marque refundedAt** : audit trail complet.
26. **Devise incohérence** : `$1M+`, `$2M+` → `€1M+`, `€2M+` dans angel-desk.ts.

### Validations
- `npx tsc --noEmit` → 0 erreur
- `npx vitest run` → 559/559 tests verts (mock prisma mis a jour : updateMany, $executeRawUnsafe, $transaction avec options)

---
## 2026-04-17 — feat: Thesis-first completeness — 3 UI components + chat loader + deals-table + admin backfill + transition Quick Scan

Complete du rollout thesis-first avec les 6 items manquants par rapport au plan initial :

1. **ThesisFrameworksExpand** — composant collapsible affichant les 3 lunettes (YC/Thiel/Angel Desk) en detail : verdict + confiance + question centrale + claims testes (supported/contradicted/unverifiable/partial) + strengths + failures + summary. Toggle global + toggle par framework. Injecte dans AnalysisPanel apres ThesisHeroCard.
2. **ThesisRevisionBanner** — banner affiche quand une nouvelle version de these apparait (v2+). Calcule automatiquement le diff verdict / confiance / reformulation / load-bearing (ajoutees / supprimees / modifiees). Bouton "Voir diff complet" ouvre dialog avec comparaison avant/apres per-field. Dismiss persist localement.
3. **ThesisStaleBadge** — badge sur deals pre-migration (variant="inline" dans deals-table, variant="full" pour page deal). CTA "Lancer Deep Dive" route vers la page deal + loading state pendant le declenchement.
4. **Chat IA context loader** — `/api/chat/[dealId]` charge desormais `thesisService.getLatest(dealId)` et l'injecte dans `FullChatContext.thesis`. `DealChatAgent.buildContextPrompt()` formate la these complete (reformulation, probleme, solution, why-now, moat, path-to-exit, verdict, load-bearing, alertes, 3 lunettes). L'intent `THESIS` dispose maintenant du contexte necessaire pour repondre.
5. **deals-table thesis column** — nouvelle colonne "Thèse" entre Score et Statut. Affiche le verdict avec `THESIS_VERDICT_CONFIG` (labels courts : Très solide / Solide / Contrastée / Fragile / Non validée). Fallback sur `ThesisStaleBadge` pour deals sans these. Sort canonique sur l'ordre du verdict (meilleur→pire), deals sans these en bas. Query Prisma etendue avec `include: { theses: { where: { isLatest: true } } }`.
6. **Admin backfill** — `/api/admin/thesis/backfill` (GET liste candidats + POST declenche re-extract, 2cr facturees admin, idempotent par dealId). Page `/admin/thesis` avec liste des deals sans these (200 max), search, bouton backfill individuel + bouton batch avec confirm. Client component `AdminThesisBackfillClient` gere les etats loading/done/error par deal.
7. **THESIS_VERDICT_CONFIG** — config dedie dans `ui-configs.ts` avec `label` long, `shortLabel` pour table, `color`, `bg`, `description` par verdict. Reutilisable partout où la these s'affiche.
8. **Quick Scan retire de l'UI** — `pricing-content.tsx` retire la card QUICK_SCAN + ajoute cards `THESIS_REBUTTAL` + `THESIS_REEXTRACT`. Banner explicite "Quick Scan remplacé par Deep Dive thesis-first" en tete avec detail du nouveau flow (5cr inclut these, stop possible avec refund 3cr). `analysis-panel.tsx` : retrait du fallback `tier1_complete` → `analysisType` toujours `full_analysis`.
9. **base-agent contract** — `getRequiredOutputContractFields()` etendu avec entries pour `thesis-extractor` (11 champs : reformulated / problem / solution / whyNow / verdict / confidence / loadBearing / alerts / ycLens / thielLens / angelDeskLens) et `thesis-reconciler` (5 champs). Active la verification contractStatus pour ces agents (PARTIAL_UNVERIFIED si manquants).
10. **Meta-gate dans Tier3Results** — `Tier3Results` accepte `thesisVerdict` + `thesisBypass`. Si these fragile sans bypass : notice rouge "Score global non applicable" au lieu du SynthesisScorerCard. AnalysisPanel propage les props depuis `thesis?.verdict` + `thesis?.thesisBypass` (lu depuis l'analyse liee via le route API thesis).
11. **API thesis route enriche** — `/api/deals/[id]/thesis` retourne desormais history avec `reformulated` / `problem` / `solution` / `whyNow` / `moat` / `pathToExit` / `loadBearing` (pour le diff RevisionBanner) + `thesisBypass` lu depuis l'analyse liee la plus recente.

### Fichiers nouveaux
- `src/components/deals/thesis/thesis-frameworks-expand.tsx`
- `src/components/deals/thesis/thesis-revision-banner.tsx`
- `src/components/deals/thesis/thesis-stale-badge.tsx`
- `src/components/admin/admin-thesis-backfill-client.tsx`
- `src/app/(dashboard)/admin/thesis/page.tsx`
- `src/app/api/admin/thesis/backfill/route.ts`

### Fichiers modifies
- `src/lib/ui-configs.ts` — THESIS_VERDICT_CONFIG.
- `src/components/deals/analysis-panel.tsx` — imports FrameworksExpand + RevisionBanner + ThesisStaleBadge, types ThesisPayload enrichis, detection previousThesisVersion via history, propagation thesisVerdict/thesisBypass vers Tier3Results, retrait fallback tier1_complete.
- `src/components/deals/deals-table.tsx` — colonne Thèse, sort thesisVerdict, ThesisStaleBadge inline.
- `src/components/deals/deals-view-toggle.tsx` — Deal.thesisVerdict optionnel.
- `src/components/deals/tier3-results.tsx` — props thesisVerdict/thesisBypass, meta-gate notice, masquage SynthesisScorerCard si thesisGated.
- `src/app/(dashboard)/deals/page.tsx` — include theses (isLatest) dans getDeals, flatten thesisVerdict.
- `src/app/(dashboard)/pricing/pricing-content.tsx` — retrait QUICK_SCAN, ajout THESIS_REBUTTAL + THESIS_REEXTRACT, banner transition.
- `src/app/api/chat/[dealId]/route.ts` — thesisService.getLatest() injecte dans FullChatContext.thesis.
- `src/app/api/deals/[dealId]/thesis/route.ts` — history enrichie + thesisBypass propage.
- `src/agents/chat/deal-chat-agent.ts` — FullChatContext.thesis + formatage section these dans buildContextPrompt.
- `src/agents/base-agent.ts` — contract fields pour thesis-extractor et thesis-reconciler.

### Commandes validation
```bash
npx tsc --noEmit  # 0 erreur
npx vitest run    # 559/559 tests verts
```

---
## 2026-04-17 — feat: Thesis-first pipeline pause + Board round THESIS_DEBATE + meta-gate + auto re-extraction

Suite au delivery thesis-first de base, implementation des 5 items deferes :
1. **Inngest waitForEvent** : pipeline d'analyse splittee en 3 phases — `phase1-extract-thesis` → `step.waitForEvent('analysis/thesis.decision', 24h)` → `phase3-post-thesis`. Le BA dispose de 24h pour decider (stop / continue / contest). Sur timeout : full refund + analyse expired. Sur stop : partial refund (3cr sur 5).
2. **AnalysisPanel integration** : `ThesisHeroCard` injecte en haut des resultats d'analyse, polling toutes les 5s de `/api/deals/[id]/thesis`, ouverture automatique de `ThesisReviewModal` des que `hasPendingDecision=true`. Decision BA → invalidation cache → pipeline reprend.
3. **Board round THESIS_DEBATE** : nouveau round 0 execute AVANT les DEBATE rounds classiques. Les 4 membres IA (Claude/GPT/Gemini/Grok) debattent la solidite de la these (score 0-100, weakest assumption, major critique, recommandations). Persist en `AIBoardRound` avec `roundType=THESIS_DEBATE`.
4. **Meta-gate UI** : `VerdictPanel` masque le score global si `thesisVerdict ∈ {alert_dominant, vigilance}` et `!thesisBypass`. Affiche notice "Score non applicable — these jugee fragile". `SynthesisDealScorerAgent` applique la regle 4 post-LLM : cap 50/100 si these fragile sans bypass.
5. **Auto re-extraction** : sur upload d'un nouveau document, si le deal a deja une these persistee, emission de l'event Inngest `analysis/thesis.reextract`. Nouvelle Inngest function `thesisReextractFunction` : facture 1cr (idempotent), re-lance extraction via `orchestrator.runAnalysis({pauseAfterThesis:true, forceRefresh:true})`, refund sur echec.

### Fichiers modifies
- `src/agents/orchestrator/types.ts` — `AnalysisOptions.pauseAfterThesis` + `PausedAnalysisResult` + pass-through dans `AdvancedAnalysisOptions`.
- `src/agents/orchestrator/index.ts` — pause post-thesis (persist intermediate results + emit `analysis/thesis.review-required` event + early return), nouvelle methode publique `continueAnalysisAfterThesis(analysisId, decision, {thesisBypass})` qui route sur completeAnalysis (stop/timeout) ou resumeAnalysis (continue/contest).
- `src/agents/tier3/synthesis-deal-scorer.ts` — regle 4 : cap score a 50 si `thesisVerdict ∈ {alert_dominant, vigilance} && !thesisBypass`.
- `src/lib/inngest.ts` — `dealAnalysisFunction` splittee en 3 `step.run` avec `step.waitForEvent('analysis/thesis.decision', 24h)` au milieu. Nouvelle fonction `thesisReextractFunction` triggeree par `analysis/thesis.reextract`. Helper `compensateFailedAnalysis` factorise le refund.
- `src/app/api/deals/[dealId]/thesis/decision/route.ts` — emit `analysis/thesis.decision` event apres persistance. Refund partiel uniquement pour analyses deja COMPLETED (legacy) ; les RUNNING/paused sont gerees par Inngest phase3.
- `src/app/api/documents/upload/route.ts` — apres extraction COMPLETED, si deal a une these, emit `analysis/thesis.reextract`.
- `src/components/deals/verdict-panel.tsx` — props `thesisVerdict`/`thesisBypass`/`thesisDecision`. Logic `thesisGated`. Top accent line rouge, score ring masquee, notice "Score non applicable".
- `src/components/deals/analysis-panel.tsx` — imports `ThesisHeroCard` + `ThesisReviewModal`. Query `thesis.byDeal` avec polling 5s. Auto-open modal sur `hasPendingDecision=true`. Callback `handleThesisDecided` invalide les caches et toast.
- `src/lib/query-keys.ts` — `queryKeys.thesis.byDeal(dealId)`.
- `src/agents/board/types.ts` — `BoardInput.thesis` (nullable) + nouveau `ThesisDebateResponse`.
- `src/agents/board/board-orchestrator.ts` — `prepareInputPackage` charge la these via `thesisService.getLatest()`. Round 0 (`runThesisDebate`) execute AVANT les initial analyses. Persist en `AIBoardRound` avec `roundType=THESIS_DEBATE`.
- `src/agents/board/board-member.ts` — nouvelle methode `debateThesis(input)` + prompt `buildThesisDebatePrompt` : evaluation adherence/solidity/weakest-assumption/major-critique/recommandations.

### Commandes validation
```bash
npx tsc --noEmit  # 0 erreur
npx vitest run    # 559/559 tests verts
```

---
## 2026-04-17 — feat: Thesis-first architecture (extractor + reconciler + frameworks + bifurcation)

Refonte fondamentale de l'analyse : avant de parler equipe/marche/finances, on teste
la THESE d'investissement de la societe. Extraite par AI en Tier 0.5, confrontee a
3 frameworks (YC, Thiel, Angel Desk), reconciliee avec les findings Tier 1/2/3,
bifurcation BA (Stop / Continue / Contest + rebuttal 1cr).

### Phase 1 — Schema + Agents backend
**Fichiers :**
- `prisma/schema.prisma` — nouveau modele `Thesis`, enum `RedFlagCategory` += `THESIS` + `THESIS_VS_REALITY`, enum `RoundType` += `THESIS_DEBATE`, enum `CreditAction` += `THESIS_REBUTTAL` + `THESIS_REEXTRACT`. `Analysis` : nouveaux champs `thesisId` (FK), `thesisDecision`, `thesisDecisionAt`, `thesisBypass`.
- `prisma/migrations/20260417120000_thesis_first_architecture/migration.sql` — migration idempotente (appliquee sur Neon). Cree table `Thesis` + indexes + FK CASCADE, etend les enums, ajoute les colonnes sur `Analysis`.
- `src/agents/thesis/types.ts` — types partages : `ThesisVerdict`, `LoadBearingAssumption`, `FrameworkClaim`, `FrameworkLens`, `ThesisAlert`, `ThesisExtractorOutput`, `ThesisReconcilerOutput`, `RebuttalJudgeOutput`. Helper `worstVerdict()` pour la doctrine "worst-of-3".
- `src/agents/thesis/frameworks/yc.ts` — lunette YC (problem reality, PMF path, distribution, retention, why-now, moat PMF-driven).
- `src/agents/thesis/frameworks/thiel.ts` — lunette Thiel (contrarian truth, 10x, proprietary tech, network effects, monopoly path, timing).
- `src/agents/thesis/frameworks/angel-desk.ts` — lunette Angel Desk **elargi au spectre investisseur prive** (BA solo + groupe d'angels + family office + syndicate, pas juste BA solo). Exit realisable, ticket compatibility, dilution control, key-person risk, liquidity path, instrument protection.
- `src/agents/tier0/thesis-extractor.ts` — agent Tier 0.5 : extrait reformulated/problem/solution/whyNow/moat/pathToExit, identifie 3-5 load-bearing assumptions, lance les 3 lunettes en parallele, verdict worst-of-3.
- `src/agents/tier3/thesis-reconciler.ts` — agent Tier 3 : confronte la these initiale aux findings Tier 1/2 (financial-auditor, market-intel, competitive-intel, team-investigator, customer-intel), emet red flags `THESIS_VS_REALITY`, met a jour verdict (cap amelioration +1 cran max, degradation non cappee).
- `src/agents/thesis/rebuttal-judge.ts` — agent one-shot declenche par action BA. Juge un rebuttal ecrit (valid / rejected) avec critere de rigueur strict (~80% rejected attendus).
- `src/services/thesis/index.ts` — service persistance : create (versioning auto-incremente), getLatest, getHistory, applyReconciliation, recordDecision, recordRebuttalVerdict, hasReachedRebuttalCap (3 max/deal), isStale, listDashboard cross-deals.
- `src/agents/thesis/__tests__/types.test.ts` + `src/services/thesis/__tests__/thesis-service.test.ts` — 21 tests couvrant worstVerdict doctrine + CRUD + versioning + rebuttal cap + isStale.

### Phase 2 — Orchestrateur + Tier 3 integration
**Fichiers :**
- `src/agents/orchestrator/index.ts` — nouvelle methode `runThesisExtraction()` appelee en Tier 0.5 dans `runFullAnalysis` (apres fact-extractor + deck-coherence + context-engine, avant Tier 1 phases). Persiste la these via `thesisService.create()`, linke `Analysis.thesisId`, injecte dans `enrichedContext.thesis` pour propagation downstream. Apres thesis-reconciler (Tier 3), appelle `thesisService.applyReconciliation()` pour persister le verdict raffine.
- `src/agents/orchestrator/agent-registry.ts` — `getTier3Agents()` retourne maintenant 7 agents (+ `thesis-reconciler`).
- `src/agents/orchestrator/types.ts` — `TIER3_BATCHES_AFTER_TIER2` : nouveau batch `["thesis-reconciler"]` AVANT `synthesis-deal-scorer` (pour que le scorer voie le verdict raffine).
- `src/agents/tier3/index.ts` — exports ajoutes.
- `src/agents/types.ts` — `EnrichedAgentContext.thesis` ajoute (champs reformulated/problem/solution/whyNow/moat/pathToExit/verdict/confidence/loadBearing/alertsCount/ycVerdict/thielVerdict/angelDeskVerdict).
- `src/services/credits/types.ts` — `CreditActionType` += `THESIS_REBUTTAL` (1cr), `THESIS_REEXTRACT` (1cr). `QUICK_SCAN` marque DEPRECATED (valeur conservee pour historique transactions).
- `src/services/credits/usage-gate.ts` — `getActionDescription()` complete pour les nouveaux types.
- `src/app/api/analyze/route.ts` — **Quick Scan retire de l'offre**. `analyzeSchema` rejette les nouveaux types `screening`/`quick_scan`/`tier1_complete`. Message de transition : "Quick Scan a ete remplace par Deep Dive". Defaut = `full_dd`. `getAnalysisTier` mis a jour.
- `src/agents/__tests__/agent-pipeline.test.ts` — test mis a jour : tier3Agents = 7 (avec thesis-reconciler).

**Simplification documentee :** L'Inngest `waitForEvent` pour PAUSE mi-pipeline (stop/continue/contest avant Tier 1/2/3) n'est PAS implemente dans cette version. Le pipeline tourne complet, la bifurcation se fait cote UI post-completion via modal non-dismissible. Le compute Tier 1/2/3 est toujours depense meme sur Stop, mais le rendu UI est gate par `thesisDecision`. Evolution Phase 2b : split `runAnalysis` en 2 steps Inngest avec `step.waitForEvent('thesis.decision', { timeout: '24h' })` + handler dedie pour reprendre le pipeline. Reporte pour eviter un refactor massif risque du orchestrateur (3794 lignes).

### Phase 3 — Endpoints API
**Fichiers nouveaux :**
- `src/app/api/deals/[dealId]/thesis/route.ts` — `GET` : these courante + historique versions + hasPendingDecision flag. Auth + ownership.
- `src/app/api/deals/[dealId]/thesis/decision/route.ts` — `POST` : enregistre la decision BA (stop | continue | contest). Refund partiel 2cr si stop. `thesisBypass=true` si continue sur verdict fragile. Idempotence double-submit (409 si decision deja posee). Cap rebuttals (3 max/deal).
- `src/app/api/deals/[dealId]/thesis/rebuttal/route.ts` — `POST` : invoque `thesis-rebuttal-judge`. Debite 1cr idempotent (clef `thesis:rebuttal:${thesisId}:${count}`). Refund automatique en cas de crash/echec du juge.
- `src/app/api/thesis/dashboard/route.ts` — `GET` : liste cross-deals avec filtres `verdict` / `sector` / `stage` / `search` / `sortBy` / `sortDir` + pagination (take/skip, cap 100).

### Phase 4 — UI thesis-first (composants V1)
**Fichiers nouveaux :**
- `src/components/deals/thesis/thesis-hero-card.tsx` — HERO card : reformulation longue (3-5 phrases), verdict badge (RECOMMENDATION_CONFIG), structure probleme/solution/whyNow/moat/pathToExit, load-bearing assumptions avec statut (verified/declared/projected/speculative), alertes (toutes affichees, pas limitees a 3 — expand au-dela de 5). Bouton "Decider" et "Voir par framework".
- `src/components/deals/thesis/thesis-review-modal.tsx` — modal non-dismissible (pattern cgu-consent-modal). 3 options : Arreter (refund partiel 2cr) / Continuer / Contester (1cr, textarea 4000 chars max). Appels API /thesis/decision et /thesis/rebuttal. Footer explicite sur le timeout 24h.

**Reportes en Phase 4b :**
- Integration effective de `ThesisHeroCard` dans `AnalysisPanel` (placement HERO, polling pending decision, auto-ouverture du modal) — composants livres, cablage UI a faire.
- `ThesisFrameworksExpand` — toggle 3 lunettes YC/Thiel/AD.
- `ThesisRebuttalDialog` (en partie : integre au ReviewModal).
- `ThesisRevisionBanner` (auto re-extraction sur nouveau doc).
- `ThesisStaleBadge` sur deals pre-migration.
- Meta-gate UI (masquer score global dans `VerdictPanel` si verdict=alert_dominant et !thesisBypass).

### Phase 5 — Dashboard cross-deals
**Fichier nouveau :**
- `src/app/(dashboard)/theses/page.tsx` — page `/theses` : 5 cards count par verdict (very_favorable → alert_dominant), liste des thèses avec click → page deal, deal/secteur/stage/reformulation tronquee + verdict + decision. Server component.

### Phase 6 — Chat intent THESIS
**Fichiers :**
- `src/agents/chat/deal-chat-agent.ts` — ajout de l'intent `"THESIS"` dans le type `ChatIntent` + guidance dedie dans `getIntentGuidance()`. Le chat repond structurement sur verdict / assumptions / raison de la fracture / points d'approfondissement.

**Reporte en Phase 6b :**
- Round `THESIS_DEBATE` dans le Board IA (refactor `board-orchestrator` + `board-member`). Les types enum Prisma sont en place. L'implementation des prompts + ordre des rounds reste a faire.
- Auto re-extraction sur nouveau doc upload (event Inngest `thesis.reextract` + handler).
- Backfill badge UI sur deals pre-migration.

### Decisions utilisateur respectees (dialogue en 6 batches)
- **Nature these** : celle de la societe (pas du BA) — pas de champ user pour rediger these
- **Placement** : Tier 0.5 (extractor) + Tier 3 (reconciler) — 2 passes
- **Frameworks** : YC + Thiel + Angel Desk systematiquement en parallele
- **Framework Angel Desk elargi** : BA solo + groupe d'angels + family office + syndicate (clarifie mid-dialogue)
- **Bifurcation** : Stop / Continuer / Contester (3 boutons modal non-dismissible)
- **Labels verdict** : alignes sur `RECOMMENDATION_CONFIG` existant (signaux très favorables → alerte dominante)
- **Scoring gate** : meta-gate — si thèse fail, score global masque (implementation UI en Phase 4b)
- **Frameworks visibles** : partiellement (expand apres verdict unifie)
- **Conflit thèse vs realite** : nouvelle categorie `THESIS_VS_REALITY` (emise par reconciler)
- **Persistance** : table Thesis + versioning + comparable cross-deals dashboard
- **Edition these** : non editable, rebuttal ecrit (1cr) analyse par rebuttal-judge
- **Quick Scan supprime** — Deep Dive est le tier d'entree (validation explicite user)
- **Bifurcation timeout** : 24h (dans la doc du modal UI ; implementation serveur en Phase 2b)
- **Rebuttal cap** : 3 max/deal (anti-abus)
- **First view BA** : these reformulee longue + verdict + alertes (pas limitees a 3)

### Validation
- `npx prisma migrate deploy` OK (9 migrations appliquees sur Neon prod)
- `npx prisma validate` OK
- `npx prisma generate` OK
- `npx tsc --noEmit` : **0 erreur**
- `npx vitest run` : **559/559 tests verts** (21 nouveaux thesis-*)

### Avant gros tests
1. Tester manuellement le flow Deep Dive sur un deal existant : verifier que thesis-extractor tourne en Tier 0.5 et persiste
2. Tester les 4 endpoints API (GET thesis, POST decision, POST rebuttal, GET dashboard)
3. Exercer la page `/theses`
4. Monitorer les costs LLM : thesis-extractor = 4 LLM calls (1 core + 3 frameworks parallel). Modele complex. Estimer le cout moyen.

---
## 2026-04-16 — feat: Sprint P1 — durcissement complet (securite, data, scoring, UI, perf)

6 vagues livrees, 2 migrations Neon appliquees, 538/538 tests, tsc 0 erreur.

### Vague A — Securite

**Fichiers :**
- `src/app/api/analyze/route.ts` — rate limit par user resserre 5/min -> 2/min.
  Protege du spam + de l'abus couteux (chaque Deep Dive = 41 agents).
- `src/app/api/context/route.ts` — rate limit resserre 10/min -> 3/min. Chaque
  appel Context Engine declenche des calls externes payants (Perplexity, LinkedIn,
  Pappers); 3/min suffit largement au flux normal.
- `next.config.ts` — CSP prod durcie: `unsafe-eval` retire, ajout de
  `challenges.cloudflare.com` (Clerk anti-bot), `api.inngest.com`/`inn.gs`
  (workers), policies `object-src none`, `base-uri self`, `form-action self`.
  Migration nonce-based reportee en P2 (necessite middleware dedie + injection
  dans le layout).
- `src/services/context-engine/connectors/website-crawler.ts` — tous les champs
  issus du HTML crawle (title, description, content, testimonials, clients,
  teamMembers, pricingPlans, jobOpenings, features, integrations) passent par
  `sanitizeForLLM` avec caps explicites (content: 40KB, textes: 256-1024 chars).
  Protege contre les injections adversaire ("Ignore previous instructions...")
  dans les prompts LLM downstream.

### Vague B — Data integrity + idempotence

**Fichiers :**
- `prisma/schema.prisma` — 3 indexes composites: `Deal[userId,status,createdAt]`,
  `RedFlag[dealId,severity]`, `Analysis[dealId,status,createdAt]`.
- `prisma/migrations/20260416170000_p1_composite_indexes/migration.sql` —
  migration safe (IF NOT EXISTS), appliquee sur Neon.
- `src/services/credits/usage-gate.ts` — `refundCredits()` accepte maintenant
  `options: { analysisId?, idempotencyKey? }`. L'idempotence n'est plus bloquante
  (ancienne cle `(userId, dealId, action='REFUND')` empechait les refunds
  multiples sur le meme deal); nouvelle cle scope par analysisId ou par minute
  d'horloge.
- `src/lib/inngest.ts`, `src/app/api/coaching/reanalyze/route.ts` — appels
  migres avec analysisId / sessionId.
- `src/services/credits/__tests__/credit-flow-e2e.test.ts` — mock `findUnique`
  + champ `idempotencyKey` ajoute dans les transactions simulees (27/27 tests).

### Vague C — Scoring + anti-hallucination

**Fichiers :**
- `src/agents/chat/deal-chat-agent.ts` — `sanitizeAgentNarratives()` applique
  sur la reponse chat + suggestedFollowUps avant retour au client. Regle N°1:
  un BA ne doit jamais recevoir "Investissez !" du chat.
- `src/agents/board/board-orchestrator.ts` — idem sur `consensusPoints`,
  `frictionPoints`, `questionsForFounder`, `votes[].justification` avant
  persistence + emission au client. Les votes LLM peuvent contenir du
  langage prescriptif, le sanitizer les neutralise.
- `src/agents/tier3/synthesis-deal-scorer.ts` — nouvelle Rule 3 post-LLM:
  detecte les agents Tier1 en `contractStatus === "PARTIAL_UNVERIFIED"` et
  applique -2 pts par agent (cap -10), baisse la confidence de -5/agent, injecte
  un keyWeakness explicite. `contractStatus` etait emis mais non consomme; il
  influe maintenant sur le score final.

### Vague D — Facturation

**Fichiers :**
- `prisma/schema.prisma` — `Analysis.refundedAt`, `Analysis.refundAmount` ajoutes.
- `prisma/migrations/20260416180000_p1_analysis_refund_tracking/migration.sql` —
  appliquee sur Neon.
- `src/lib/inngest.ts` — le worker marque `refundedAt`/`refundAmount` quand
  il refund sur echec. Permet au resume flow de savoir si les credits ont deja
  ete rembourses (evite le double-refund sur un resume qui re-fail).
- `src/app/api/analyze/route.ts` — resume logic: si `resumableAnalysis.refundedAt`
  est set, on re-facture la reprise; sinon on continue sans double-charger.
- `src/app/api/documents/upload/route.ts` — OCR image granulaire: 1 credit si
  `file.size < 500KB`, 2 credits sinon. Pricing aligne sur cout reel Vision LLM.
- `src/services/board-credits/index.ts` — `refundCredit()` accepte sessionId
  et construit un idempotencyKey scope fin.

### Vague E — UI/UX

**Fichiers (accents FR + HTML entities) :**
- `src/components/deals/founder-responses.tsx` — "Repondez"->"Répondez",
  "re-analyser"->"ré-analyser".
- `src/components/chat/deal-chat-panel.tsx` — "Debutant"->"Débutant",
  "Intermediaire"->"Intermédiaire".
- `src/components/deals/conditions/simple-mode-form.tsx` — "Montant leve"->
  "Montant levé", "Calculee"->"Dilution calculée", "Ecart theorique"->"Écart théorique".
- `src/components/deals/conditions/conditions-tab.tsx` — 5 messages d'erreur
  avec accents corriges ("doit etre"->"doit être", "depasser la duree"->
  "dépasser la durée", "leve"->"levé", etc.).
- `src/components/deals/conditions/term-sheet-suggestions.tsx` — "Montant leve"->
  "Montant levé", "detecte"->"détecté", "pre-remplir"->"pré-remplir".
- `src/components/deals/red-flags-summary.tsx` — "Eleve"->"Élevé".
- `src/components/shared/score-badge.tsx` — HTML entities `&egrave;`, `&eacute;`,
  `&apos;` remplaces par Unicode natif.

**Fichiers (aria-labels) :**
- `src/components/deals/board/views/arena-view.tsx` — SVG Arena recoit
  `role="img"` + `aria-label` explicite.
- `src/components/deals/documents-tab.tsx` — DropdownMenuTrigger recoit
  `aria-label="Options pour {doc.name}"`.

### Vague F — Perf

**Fichiers :**
- `src/agents/base-agent.ts` — `formatDealContext`:
  - Description capee 10000 -> 4000 chars (~1000 tokens vs ~2500).
  - Founders affichage capee a 8 membres (au-dela: compte + ref people graph).
- Retry LLM exponential backoff: **deja en place** au niveau router
  (`src/services/openrouter/router.ts:calculateBackoff` — `baseDelayMs * 2^attempt`).
  L'item audit P1 etait outdated.

### Items P1 audit deja resolus en P0 ou conception existante

- `financial-auditor` timeout 180s -> 240s: **fait 2026-04-16** (commit `83a4e07`)
- `Analysis.documentIds String[]` FK: **fait P0** (`AnalysisDocument` join table)
- CVE xmldom/defu/effect/flatted: **fait P0** (`npm audit fix`)
- Chat directive 5 (Structured Uncertainty): **deja presente** ligne 306 du
  chat system prompt (audit P1 etait errone)
- Tier3 directives doublees: **deja resolues 2026-03-12** (dedup fait en P2C)
- LLM retry exponential backoff: **deja present** dans le router central

### Items reportes en P2 (decision requise)

Ces items etaient dans l'audit P1 mais necessitent une decision produit ou un
chantier multi-semaines qui depasse le scope P1 courant:

- **Poids Board vs `stage-weights.ts`** — divergence jusqu'a 20 pts. Decision
  produit requise: Board = "investment appeal" (subjectif), Scoring = "DD rigor"
  (objectif). A documenter explicitement dans l'UI ou a aligner dynamiquement.
- **Fichiers monolithiques** — orchestrator/index.ts (3800 lignes),
  tier1-results.tsx (4000), types.ts (3900), synthesis-deal-scorer.ts (1900),
  ocr-service.ts (1600), base-agent.ts (1650). Split par domaine = chantier
  d'une semaine minimum. Bloque les nouvelles features, a prioriser apres
  stabilisation.
- **BaseAgent AsyncLocalStorage** — remplacer l'etat mutable singleton
  (`_totalCost`, `_llmCalls`) par un `RunContext` isolated. Refactor
  transversal sensible (tous les tests d'agents impactes).
- **Conversion 125 composants `'use client'` en RSC** — audit fichier par
  fichier, budget bundle 800KB -> 400KB estime. Travail incremental, 1
  composant = 15-30 min.
- **Stripe Checkout + webhook HMAC** — necessite compte Stripe actif + cle
  webhook + tests e2e avec sandbox. Jusque la, achat manuel via mailto reste
  la voie officielle.
- **Live coaching refund partiel** — disconnect avant la fin ne refund pas
  pro-rata. Demande integration Recall.ai webhook + logique temps ecoule.
- **xlsx -> exceljs** (CVE residuelle) — chantier de 2-3 jours (API differente),
  a planifier pour un sprint dedie.
- **Migration `console.log` hot paths restants** — ~600 appels. Outil: codemod
  ou script sed + PR volumineuse.

### Validation

- `npx prisma migrate deploy` OK (7 migrations appliquees sur Neon prod)
- `npx prisma validate` OK
- `npx prisma generate` OK
- `npx tsc --noEmit` : **0 erreur**
- `npx vitest run` : **538/538 passed**

---
## 2026-04-16 — fix: timeouts Tier1 critiques (financial-auditor, team-investigator)

**Fichiers (2) :**
- `src/agents/tier1/financial-auditor.ts` — `timeoutMs` 180000 -> 240000 (4 min).
  Couvre les gros pitch decks (80+ pages) avec modele complex. Phase B est non-
  fatale depuis le fix 2026-04-13, mais un timeout cascadait sur Tier3 scorer
  (red flags financiers vides, biais optimiste).
- `src/agents/tier1/team-investigator.ts` — `timeoutMs` 120000 -> 180000 (3 min).
  LinkedIn est desormais sequentialise avec retry backoff 429; pour 5 fondateurs
  la latence cumulative peut depasser 120s.

**Valide avant gros tests :** `npx tsc --noEmit` 0 erreur, 538/538 tests.

---
## 2026-04-16 — feat: Sprint P0 — production-readiness (10 fixes bloquants)

Sprint de durcissement complet avant les gros tests. 10 failles P0 traitees en
parallele : orchestration serverless, integrite schema, invariants credits,
observabilite, positionnement anti-hallucination. 538/538 tests verts,
`npx tsc --noEmit` 0 erreur, 19/20 CVE fixees.

### P0.1 + P0.2 + P0.10 — Inngest + pool Neon + FactEvents atomicite

**Fichiers :**
- `src/app/api/analyze/route.ts` — migration complete fire-and-forget -> `inngest.send('analysis/deal.analyze' | 'analysis/deal.resume')`. Rollback credit + deal status si dispatch echoue. Retourne `status: 'QUEUED'`.
- `src/lib/inngest.ts` — cablage de `dealAnalysisFunction` (deja existant) + ajout `dealAnalysisResumeFunction`. Compensation metier (refund + reset deal) dans un step separe quand l'analyse echoue dans le worker. `retries: 1`, `concurrency: 3/user`.
- `src/lib/prisma.ts` — `connection_limit` 25 -> 50 (41 agents en parallele + Inngest concurrency 3/user). `src/lib/__tests__/prisma-pool.test.ts` aligne.
- `src/agents/orchestrator/index.ts` — `createFactEventsBatch` retour verifie et logue si echec (remplace le silent fail). L'atomicite est deja garantie par `prisma.$transaction` interne de `createFactEventsBatch`.

**Probleme resolu :** Les analyses > 5 min (Deep Dive) etaient tronquees
silencieusement par Vercel serverless. Le pool 25 connexions ne suffisait pas
pour 41 agents parallels. Les FactEvents pouvaient etre persistes partiellement
sans que l'orchestrateur le sache.

### P0.3 — Stream polling backoff + select minimal

**Fichiers :**
- `src/app/api/analyze/stream/route.ts` — supprime le fetch de `Analysis.results` (JSON 5-10MB). Select minimal (id, status, completedAgents, totalAgents, summary, timestamps). Backoff exponentiel par type d'analyse (quick=500ms->2s, deep=2s->5s), reset a la progression active. Hard timeout 10 min.
- `src/app/api/analyze/stream/backoff.ts` (nouveau) — `nextStreamBackoffMs`, `getStreamBackoffConfig`, `DEFAULT_STREAM_HARD_TIMEOUT_MS`.
- `src/app/api/analyze/stream/__tests__/backoff.test.ts` (nouveau) — 7 tests (config, reset, doublement, cap, timeout).

**Probleme resolu :** Chaque poll rechargeait le JSON complet de l'analyse
(jusqu'a 360 reads x 5-10MB par analyse). Tres couteux en bande passante Neon
+ Vercel sous charge.

### P0.4 — Extraction pre-check credits avant OCR

**Fichiers :**
- `src/services/pdf/extractor.ts` — ajout `getPdfPageCount()` (lecture `numPages` sans rendu) et `estimatePdfExtractionCost()` (estimation conservatrice worst-case 1 credit/page).
- `src/services/pdf/index.ts` — exports ajoutes.
- `src/services/credits/usage-gate.ts` — ajout `refundCreditAmount()` (refund d'un montant arbitraire avec idempotency key variable). Utilise pour les deltas d'extraction et les refunds sur failure.
- `src/services/credits/index.ts` — exports mis a jour.
- `src/app/api/documents/upload/route.ts` — pre-deduct AVANT `smartExtract()` / `processImageOCR()`. Retourne 402 si credits insuffisants SANS lancer l'OCR. Reconciliation post-extraction : debit delta si reel > estime, refund si reel < estime. Refund integral si l'OCR crash.

**Probleme resolu :** L'OCR etait lance AVANT la verification de credits. Si le
user n'avait pas assez, le compute OpenRouter etait deja consomme et le message
d'erreur etait masque en "file corrupted" generique. Fuite directe de budget
Angel Desk + UX trompeuse.

### P0.5 + P0.6 — Prisma schema hardening + migration

**Fichiers :**
- `prisma/schema.prisma` :
  - `AnalysisExtractionRun.run` ON DELETE : `Restrict` -> `Cascade`
  - `LiveSession.deal` ON DELETE : `SetNull` -> `Cascade`
  - `LiveSession.document` ON DELETE : `SetNull` -> `Cascade`
  - `FactEvent` : `@@unique([dealId, factKey, createdAt, eventType])`
  - Nouveau modele `AnalysisDocument` (table de jointure FK-contrainte, CASCADE des deux cotes). Remplace progressivement `Analysis.documentIds String[]` qui laissait des refs obsoletes apres suppression de documents. Relations bidirectionnelles ajoutees sur `Analysis` et `Document`.
- `prisma/migrations/20260416150000_p0_schema_hardening/migration.sql` (nouveau) — DDL complet : DROP + ADD FK pour les 3 cascade, dedup pre-migration pour FactEvent (DELETE duplicates exact match par cuid-id), CREATE UNIQUE INDEX, CREATE TABLE `AnalysisDocument` + index + FK, backfill `INSERT ... FROM Analysis.documentIds`.
- `src/agents/orchestrator/persistence.ts` — `createAnalysis()` ecrit dans les 2 endroits (legacy `documentIds` + nouvelle jointure `documents`).
- `src/services/analysis-versioning/index.ts` — lecture avec fallback : si la jointure est peuplee, l'utiliser ; sinon fallback sur `documentIds` legacy.

**Probleme resolu :** Suppression de deal en cascade pouvait echouer (Restrict
sur AnalysisExtractionRun), laisser des transcripts orphelins (LiveSession
SetNull), ou contenir des IDs de documents supprimes (String[] sans FK). Les
FactEvents concurrents pouvaient dupliquer la meme entree.

**Migration NON appliquee automatiquement.** A lancer avec `npx prisma migrate
deploy` apres validation sur staging (la dedup FactEvent est destructive — ne
supprime que les duplicates exacts mais requiert verification prealable du
volume).

### P0.7 — 9 fallbacks LLM anti-hallucination

**Fichiers :**
- `src/agents/orchestration/prompts/anti-hallucination.ts` (nouveau) — helper centralise `getFiveAntiHallucinationDirectives()` et `buildFallbackSystemPrompt(role, options)`. Source unique des 5 directives en version complete (verbatim CLAUDE.md).
- `src/agents/board/board-orchestrator.ts` — fallback dedup des key points (~L927) : ajout du `systemPrompt` avec les 5 directives (auparavant : aucune directive).
- `src/agents/tier0/fact-extractor.ts` — fallback meta-evaluation (~L1109) : remplacement du systemPrompt hardcoded avec directives abregees par l'appel au helper (version complete).

Les 7 autres fallbacks (consensus-engine x4, reflexion x3) avaient deja les 5
directives inline. Leur consolidation via le helper est une optimisation P1
(reduction duplication) — non bloquante pour la production-readiness.

**Probleme resolu :** Quand la validation Zod echoue (20-30% des cas en prod),
les fallbacks LLM sans directives anti-hallucination augmentent drastiquement
le taux d'hallucination sur les cas les plus difficiles.

### P0.8 — Feature access backend middleware

**Fichiers :**
- `src/services/credits/feature-access.ts` (nouveau) — `canAccessFeature(userId, feature)`, `assertFeatureAccess(userId, feature)`, classe `FeatureAccessError`, helper `serializeFeatureAccessError(err)`.
- `src/services/credits/__tests__/feature-access.test.ts` (nouveau) — 9 tests (seuils 0/59/60/124/125/300, feature inconnue, assert vs try/catch, serialisation 403).
- `src/services/credits/index.ts` — reexports.
- `src/app/api/v1/keys/route.ts` — POST + DELETE : remplace le legacy `subscriptionStatus === "PRO"` par `assertFeatureAccess(user.id, "api")`. Handler `FeatureAccessError` -> 403 avec payload structure.
- `src/app/api/negotiation/generate/route.ts` — POST : gate `"negotiation"` apres `requireAuth()`. Handler 403 dans le catch.
- `src/app/api/negotiation/update/route.ts` — PATCH : idem.

**Probleme resolu :** Les seuils `FEATURE_ACCESS` (Negotiation=60, API=125) etaient
verifies uniquement au frontend. Un utilisateur pouvait POST directement sur les
routes sans avoir atteint le seuil d'achat cumule -> revenue leak (clef API
creee gratuitement).

### P0.9a — Logger centralise + Sentry durci

**Fichiers :**
- `src/lib/logger.ts` (nouveau) — logger structure avec niveaux (debug/info/warn/error/fatal), redaction automatique des champs PII (email, token, apiKey, clerkId, stripePaymentId, extractedText, prompts, etc.), output JSON en production / console lisible en dev, hook automatique vers Sentry sur error+fatal, breadcrumbs sur warn. API : `logger.info({ ctx }, "msg")` + `logger.child({ bindings })`.
- `sentry.client.config.ts` — `tracesSampleRate: 0.1 -> 0.5`, ajout `release` (VERCEL_GIT_COMMIT_SHA), `environment`, `beforeSend` scrubber (URL params, cookies, headers), `replayIntegration({ maskAllText, blockAllMedia })`, `ignoreErrors` pour les events Next non-bugs.
- `sentry.server.config.ts` — meme trajectoire + beforeSend server-side.
- `sentry.edge.config.ts` — release + environment + tracesSampleRate=0.5.

### P0.9b — Migration console.log -> logger (hot paths critiques)

**Fichiers migres (priorite maximale : routes API d'analyse + credits + orchestration + versioning) :**
- `src/app/api/analyze/route.ts` — tous les `console.error/log` hot paths remplaces.
- `src/agents/orchestrator/persistence.ts` — `logPersistenceError()` utilise maintenant `logger.error`. Blob cache logs via logger.debug/warn.
- `src/services/credits/usage-gate.ts` — 10 sites migres (deductCreditAmount, addCredits, grantFreeCredits, refundCredits, refundCreditAmount, getOrCreateBalance).
- `src/lib/inngest.ts` — 3 sites migres (compensation logic).
- `src/services/analysis-versioning/index.ts` — 4 sites migres.

Le reste des ~700 appels `console.*` (Tier 2/3, UI, connectors) sera migre
progressivement en P1+. La couche observabilite critique (money path + analyse
path) est deja sur Sentry via le logger.

### P0 — npm audit fix

**Commandes :** `npm audit fix` x2 passes. Fixed 19/20 high/moderate CVE :
`@xmldom/xmldom`, `ajv`, `brace-expansion`, `defu`, `effect`, `minimatch`,
`next`, `picomatch`, `rollup`, `serialize-javascript`, `vite`, `yaml`, etc.

**1 CVE restante : `xlsx` (SheetJS)** — prototype pollution + ReDoS. Pas de fix
upstream. Usage circonscrit a la lecture de fichiers Excel en extraction
documents. **Action P1** : remplacer par `exceljs` (fork maintenu) ou sandboxer
l'appel dans un worker isole.

### Validation finale

- `npx prisma validate` OK
- `npx prisma generate` OK
- `npx tsc --noEmit` : **0 erreur**
- `npx vitest run` : **538/538 tests passed** (16 tests P0 ajoutes : 9 feature-access + 7 stream/backoff)
- Migration SQL `20260416150000_p0_schema_hardening` : generee manuellement, NON appliquee (a valider en staging d'abord)

### A faire avant deploy prod

1. Verifier le volume de duplicates FactEvent en prod avant migration (la section `DELETE a USING b WHERE a.id > b.id ...` supprime les duplicates exacts — ne devrait pas etre massif mais a controler).
2. Tester sous charge (10-50 analyses concurrentes) pour valider le pool=50 + concurrency Inngest 3/user.
3. Monitorer Sentry sur la premiere semaine (tracesSampleRate=0.5 genere plus d'events qu'avant).
4. Exercer le flow 402 extraction (upload gros PDF sans credits) pour valider l'UX client.
5. Documenter la nouvelle API feature-access pour les integrateurs API (README ou CHANGELOG API).

---
## 2026-04-16 — feat: evidence ledger, contrats agents, artefacts DOCX/PPTX/Excel

**Evidence ledger (nouveau service) :**
- `src/services/evidence-ledger/index.ts` + tests — registre centralisé des évidences injecté dans le contexte des agents via `formatEvidenceLedgerForPrompt`.

**BaseAgent / agents :**
- `src/agents/base-agent.ts` — `contractStatus` + `contractIssues` dans `AgentResult`, budget documentaire global partagé entre docs, routing doc affiné par relevance.
- `src/agents/document-context-retriever.ts` + tests — sélection de fenêtres documentaires plus fine.
- `src/agents/orchestration/tier1-cross-validation.ts` (+ nouveaux tests) — cross-validation durcie.
- `src/agents/orchestrator/index.ts`, `persistence.ts` — propagation du contrat.
- `src/agents/tier1/financial-auditor.ts`, `tier3/synthesis-deal-scorer.ts`, `tier2/saas-expert.ts`, `types.ts`, `schemas/common.ts` — durcissements.

**Extraction documents :**
- `src/app/api/documents/upload/route.ts` — artefacts structurés pour DOCX, PPTX, Excel ; OCR des médias embarqués.
- `src/services/docx.ts`, `pptx.ts`, `pdf/ocr-service.ts` — extraction enrichie (sections, tables, médias).
- `src/services/documents/extraction-runs.ts` + tests ; routes extraction-audit / retry mises à jour ; dialog UI d'audit étendu.
- `src/services/pdf/__tests__/document-extraction-golden.test.ts` — golden tests étendus.

**Context Engine :**
- `src/services/context-engine/{index,parallel-fetcher,persistence,types}.ts` — persistence et fetcher étendus.

**TypeScript : OK. Commit `9c07c09` poussé sur `main`.**

---
## 2026-04-13 — fix: financial-auditor timeout cascade + LinkedIn rate limit

**Orchestrator abort logic (1 fichier) :**
- `src/agents/orchestrator/index.ts` — Seule Phase A (deck-forensics) est désormais fatale. Phase B (financial-auditor) failure est loggé en warning mais n'aborte plus les 11 agents restants. L'analyse continue en mode dégradé (question-master sans red flags financiers) au lieu de produire 1/13 agents.

**Financial-auditor timeout (1 fichier) :**
- `src/agents/tier1/financial-auditor.ts` — Timeout augmenté de 120s → 180s pour accommoder les gros documents + modèle complex.

**Problème résolu :** Le timeout du financial-auditor cascadait et tuait toute l'analyse (1/13 agents Tier 1, Tier 3 sur du vide, scorer incohérent 7 vs 49).

**TypeScript : 0 erreurs.**

---
## 2026-04-13 — fix: LinkedIn API rate limit 429 — séquentialisation + retry

**Context Engine (1 fichier) :**
- `src/services/context-engine/index.ts` — `buildPeopleGraph()` : remplacé `Promise.all` parallèle par boucle `for...of` séquentielle. Chaque profil LinkedIn est fetché uniquement après le précédent, évitant les 429 rate limits.

**RapidAPI LinkedIn connector (1 fichier) :**
- `src/services/context-engine/connectors/rapidapi-linkedin.ts` — Ajout retry avec backoff sur HTTP 429 : 3 tentatives max avec délais 2s/4s/6s. Cache DB et log sur chaque retry réussi.

**Problème résolu :** 4/5 profils LinkedIn échouaient en 429 car tous fetchés en parallèle. Le team-investigator n'avait les données que d'1 fondateur sur 5.

**TypeScript : 0 erreurs.**

---
## 2026-03-12 — feat: image OCR for JPEG/PNG uploads

**OCR service (1 fichier) :**
- `src/services/pdf/ocr-service.ts` — Ajout `processImageOCR()` : envoie l'image en base64 à GPT-4o Mini Vision via OpenRouter pour extraction texte. Retourne texte, confidence (high/medium/low), coût.
- `src/services/pdf/index.ts` — Export `processImageOCR` ajouté

**Upload route (1 fichier) :**
- `src/app/api/documents/upload/route.ts` — Ajout bloc de traitement image (JPEG/PNG) : passe le buffer à `processImageOCR()`, met à jour le document avec le texte extrait (chiffré), quality score, métriques OCR. Fallback gracieux si OCR échoue (document marqué COMPLETED sans texte).

**Problème résolu :** Les images uploadées restaient en statut "en attente" (PENDING) car aucun bloc de traitement n'existait pour les types image/jpeg et image/png.

**TypeScript : 0 erreurs.**

---
## 2026-03-12 — fix: KillReason/CriticalQuestion type alignment, breadcrumb deal detail, cleanup types split

**Vue Kanban deals (3 fichiers) :**
- `src/components/deals/deals-kanban.tsx` — Nouveau : vue kanban groupant les deals par statut (6 colonnes)
- `src/components/deals/deals-view-toggle.tsx` — Nouveau : toggle liste/kanban avec boutons LayoutList/LayoutGrid
- `src/app/(dashboard)/deals/page.tsx` — Intégration DealsViewToggle, toggle visible dans le CardHeader

**Dark mode toggle (2 fichiers) :**
- `src/components/providers.tsx` — Ajout `ThemeProvider` de next-themes (attribute="class", defaultTheme="light")
- `src/components/layout/sidebar.tsx` — Ajout bouton toggle Sun/Moon dans la section user du sidebar

**Type alignment — Dealbreaker → ABSOLUTE/CONDITIONAL (6 fichiers) :**
- `src/agents/types.ts` — Ajout `CriticalQuestion` type alias, ajout `criticalQuestions` dans `QuestionMasterFindings`
- `src/agents/tier1/question-master.ts` — Fix severity mapping: `CRITICAL→ABSOLUTE`, `HIGH→CONDITIONAL`
- `src/agents/tier3/devils-advocate.ts` — Fix `validKillReasonLevels`, severity mapping, et filtres `dealBreakerLevel`
- `src/components/deals/tier3-results.tsx` — Fix 5 comparaisons `dealBreakerLevel` (`CRITICAL→ABSOLUTE`, `HIGH→CONDITIONAL`)

**Breadcrumb (1 fichier) :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Ajout fil d'Ariane "Deals / {deal.name}" avec `aria-label`

**Cleanup types split (suppression) :**
- Suppression `src/agents/types/` (split incomplet par agent background — fichiers non importés)

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — refactor: ProviderIcon extraction, Cache-Control, DB index, accents supplémentaires

**ProviderIcon extraction (5 fichiers) :**
- `src/components/shared/provider-icon.tsx` — Nouveau : composant partagé avec SVG inline des 4 providers (Anthropic, OpenAI, Google, xAI)
- `src/components/deals/board/board-progress.tsx` — Import partagé, suppression locale, accent "Réponse reçue"
- `src/components/deals/board/board-teaser.tsx` — Import partagé, suppression locale
- `src/components/deals/board/vote-board.tsx` — Import partagé, suppression locale
- `src/components/deals/board/views/chat-view.tsx` — Import partagé, suppression locale

**Cache-Control (1 fichier) :**
- `next.config.ts` — Ajout headers `Cache-Control: public, max-age=31536000, immutable` pour `/_next/static/` et `/fonts/`

**DB Index (1 fichier) :**
- `prisma/schema.prisma` — Ajout index composite `[userId, action]` sur CreditTransaction (optimise lookup refund idempotence)

**Accents supplémentaires (7 fichiers) :**
- `src/components/deals/partial-analysis-banner.tsx` — spécialisée, Détecte, spécifiques, Mémo, structuré, thèse, mitigés, étapes, concrètes
- `src/components/deals/board/ai-board-panel.tsx` — Débat (label)
- `src/components/deals/board/key-points-section.tsx` — supplémentaires
- `src/components/deals/conditions/simple-mode-form.tsx` — supplémentaires, spécifiques
- `src/components/deals/conditions/tranche-editor.tsx` — Détails, supplémentaires, Précisions
- `src/components/deals/conditions/term-sheet-suggestions.tsx` — supplémentaires
- `src/components/deals/conditions/structured-mode-form.tsx` — définie, décrire
- `src/components/onboarding/first-deal-guide.tsx` — étapes
- `src/components/error-boundary.tsx` — résultats

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — feat: admin analytics page

**Nouveau fichier :**
- `src/app/(dashboard)/admin/analytics/page.tsx` — Page server component d'analytics admin avec :
  - Overview cards : total users, deals, analyses completed, credits purchased
  - Recent activity : analyses/jour et users/jour (7 derniers jours) en tables
  - Credit health : balance moyenne, credits consumed, revenue estimate
  - Auth via `requireAdmin()`, queries paralleles via `Promise.all`

---
## 2026-03-12 — fix: accents français manquants dans 20+ composants UI

**Re-audit loop — correction des accents français dans les textes user-facing (20 fichiers) :**

- `src/components/shared/cgu-consent-modal.tsx` — opportunités, résultats, à, données, traitées, modèles, générer, utilisée, entraîner, Générales
- `src/components/shared/linkedin-consent-dialog.tsx` — données, expériences, compétences, légale, intérêt, légitime, à
- `src/components/shared/data-completeness-guide.tsx` — trésorerie, équipe
- `src/components/deals/board/ai-board-panel.tsx` — délibèrent, clés
- `src/components/deals/board/board-progress.tsx` — Débat
- `src/components/deals/board/debate-viewer.tsx` — Débat
- `src/components/deals/extraction-quality-badge.tsx` — Échec, échoué
- `src/components/deals/documents-tab.tsx` — Échec
- `src/components/deals/deck-coherence-report.tsx` — cohérentes, incohérences, détectées, nécessaire, données, supplémentaires, cohérence, recommandée, Vérification
- `src/components/deals/founder-responses.tsx` — réponse (x4), générée, générer, à, traitées, refusé, Ré-analyser
- `src/components/deals/partial-analysis-banner.tsx` — Détecteur, Détecte, données, réelles, incohérences, cachées, Modélisation, scénarios, probabilités
- `src/components/deals/tier1-results.tsx` — Résumé, Stratégique, Insights clés (x2)
- `src/components/deals/tier3-results.tsx` — cohérence
- `src/components/deals/analysis-panel.tsx` — Résumé (x3), exécutif, clés, exporté
- `src/components/deals/team-management.tsx` — conservées, équipe (x2)
- `src/components/deals/conditions/conditions-analysis-cards.tsx` — négocier, défavorables, sous-évalué, clés
- `src/components/deals/conditions/dilution-simulator.tsx` — Résultats
- `src/components/deals/conditions/percentile-comparator.tsx` — médiane (x2)
- `src/components/deals/conditions/structured-mode-form.tsx` — Résumé
- `src/components/deals/suivi-dd/suivi-dd-dashboard.tsx` — traitées, réponses
- `src/components/deals/suivi-dd/suivi-dd-tab.tsx` — Ré-analyser, réponses
- `src/components/chat/deal-chat-panel.tsx` — Résumé, identifiés, métriques, médiane, priorité, négociation (x2), justifiée, données (x2), négocier
- `src/components/onboarding/first-deal-guide.tsx` — métriques, clés, équipe, parallèle, marché, résultats, à
- `src/components/error-boundary.tsx` — résultats

**TypeScript : 0 nouvelles erreurs (2 attendues CGU/Prisma).**

---
## 2026-03-12 — fix: Phase 3A/3B/3C — auth, pricing, CSP, connection pool

**Phase 3A — Auth try/catch (1 fichier) :**
- `src/app/api/analyze/stream/route.ts` — `requireAuth()` wrappé en try/catch → retourne 401 au lieu de crash

**Phase 3B — UX Polish (3 fichiers) :**
- `src/app/(dashboard)/pricing/pricing-content.tsx` — "Pack recommandé : Standard (30 crédits, 99€)" ajouté sous Deal complet + toggle auto-refill masqué + nettoyage imports
- `src/components/shared/disclaimer-banner.tsx` — Retrait `pr-40` excessif, accent "Réduire" corrigé
- `src/app/(dashboard)/dashboard/loading.tsx` — Skeleton 3 colonnes → 4 colonnes

**Phase 3C — Architecture (2 fichiers) :**
- `next.config.ts` — CSP connect-src: ajout `wss://*.ably.io https://*.ably.io`
- `src/lib/prisma.ts` — `connection_limit` 15 → 25, comment mis à jour

**Divers :**
- `vitest.config.ts` — Suppression plugin storybook cassé (pas de `.storybook/` dir)
- `src/lib/__tests__/prisma-pool.test.ts` — Tests mis à jour pour connection_limit=25

**Tests : 498/498 passed.**

---
## 2026-03-12 — feat: CGU/IA consent modal at signup

**Prisma schema (1 fichier) :**
- `prisma/schema.prisma` — Ajout champ `cguAcceptedAt DateTime?` au model User (null = pas encore accepte)

**Composants (2 fichiers crees) :**
- `src/components/shared/cgu-consent-modal.tsx` — Modal non-dismissible (pas de X, pas d'escape, pas de clic exterieur) avec checkbox CGU + bouton "Accepter et continuer", POST vers `/api/user/cgu`
- `src/components/shared/cgu-gate.tsx` — Client wrapper qui affiche le modal si `cguAcceptedAt` est null

**API route (1 fichier cree) :**
- `src/app/api/user/cgu/route.ts` — POST handler : `requireAuth()` + `prisma.user.update({ cguAcceptedAt: new Date() })`

**Layout (1 fichier modifie) :**
- `src/app/(dashboard)/layout.tsx` — Charge l'utilisateur via `getAuthUser()`, wrappe le contenu avec `CguGate` qui affiche le modal si consentement manquant

**Auth (1 fichier modifie) :**
- `src/lib/auth.ts` — Ajout `cguAcceptedAt` au DEV_USER (pre-accepte en dev)

**TypeScript : 2 erreurs attendues (champ `cguAcceptedAt` absent des types Prisma generes — resolu apres `prisma generate`).**

---
## 2026-03-12 — feat: RGPD Art. 20 data portability route

**1 fichier cree :**
- `src/app/api/user/export/route.ts` — `GET /api/user/export` retourne un JSON telechargeable avec toutes les donnees utilisateur : profil, deals (founders, documents metadata, red flags, analyses metadata), credits (balance + transactions), API keys (masquees). Exclut les blobs d'analyse (10MB+), extractedText, et les cles API completes. Requetes paralleles via `Promise.all`. Headers `Content-Disposition` pour telechargement direct.

**TypeScript : 0 erreur sur le fichier.**

---
## 2026-03-12 — fix: Phase 2D/3B/3D — FR labels, Dealbreaker rename, UX polish, credits rollover

**Phase 2D — FR enum labels centralisés (2 fichiers) :**
- `src/lib/ui-configs.ts` — Ajout mappings FR : `BURN_EFFICIENCY_LABELS`, `MOAT_LABELS`, `PMF_LABELS`, `DIVERSIFICATION_LABELS`, `CONCENTRATION_LABELS`, `LEVEL_LABELS` + fonction `getEnumLabel()` avec fallback
- `src/components/deals/tier1-results.tsx` — 7 badges remplacent les enums EN bruts par les labels FR centralisés (EFFICIENT→"Efficace", STRONG_MOAT→"Fort avantage concurrentiel", etc.)

**Phase 3D — Dealbreaker → CriticalCondition (3 fichiers) :**
- `src/services/negotiation/strategist.ts` — Interface `Dealbreaker` → `CriticalCondition` (alias deprecated conservé pour compat)
- `src/services/negotiation/index.ts` — Export `CriticalCondition` ajouté
- `src/agents/tier1/schemas/question-master-schema.ts` — Commentaire JSDoc ajouté sur le champ `dealbreakers`

**Phase 3B — UX Polish (5 fichiers) :**
- `src/components/shared/disclaimer-banner.tsx` — Retrait `pr-40` excessif, accent "Réduire" corrigé
- `src/app/(dashboard)/dashboard/loading.tsx` — Skeleton 3 colonnes → 4 colonnes (aligné avec dashboard réel)
- `src/components/deals/board/views/arena-view.tsx` — Dimensions responsives `h-[240px] sm:h-[300px] lg:h-[400px]`
- `src/app/(dashboard)/pricing/pricing-content.tsx` — Toggle auto-refill masqué (Stripe non intégré), nettoyage imports/state inutiles
- `vitest.config.ts` — Suppression plugin storybook cassé (pas de `.storybook/` dir), config simplifiée

**Phase 3D — Credits rollover cap (1 fichier) :**
- `src/services/credits/usage-gate.ts` — `addCredits()` enforce rollover cap 2x sur auto-refill uniquement (manual purchases sans cap)

**TypeScript : 0 erreurs. Tests : 498/498 passed.**

---
## 2026-03-12 — perf: Phase 2C Performance fixes (export-pdf blob cache, SSR doc select, dedup directives)

**Fix 1 — Export PDF: use Blob cache instead of DB query (3 fichiers) :**
- `src/services/analysis-results/load-results.ts` — Nouveau : fonction `loadResults()` partagee (Blob cache + DB fallback + backfill)
- `src/app/api/deals/[dealId]/export-pdf/route.ts` — Remplace `prisma.analysis.findFirst()` (charge le JSON multi-MB depuis Neon, 30s+) par `loadResults()` depuis le Blob cache (<1s). Metadata chargee separement avec `select` (sans le champ `results`)
- `src/app/api/deals/[dealId]/analyses/route.ts` — Importe `loadResults` depuis le service partage au lieu de la fonction locale

**Fix 2 — Deal SSR: exclure extractedText des documents (1 fichier) :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — `documents: { include: true }` remplace par `select` explicite excluant `extractedText` (200KB+/doc) et `ocrText`

**Fix 3 — Dedup anti-hallucination directives Tier 3 (6 fichiers) :**
- `src/agents/tier3/synthesis-deal-scorer.ts` — Suppression `getAbstentionPermission()`, `getCitationDemand()`, `getSelfAuditDirective()`, `getStructuredUncertaintyDirective()`, `getDataReliabilityDirective()`, `getAnalyticalToneDirective()` (deja auto-injectes par `buildFullSystemPrompt`). Directive 1 (Confidence Threshold) conservee.
- `src/agents/tier3/memo-generator.ts` — Idem
- `src/agents/tier3/devils-advocate.ts` — Idem
- `src/agents/tier3/scenario-modeler.ts` — Idem
- `src/agents/tier3/contradiction-detector.ts` — Idem
- `src/agents/tier3/conditions-analyst.ts` — Idem

**TypeScript : `npx tsc --noEmit` OK, 0 erreurs.**

---
## 2026-03-12 — test: comprehensive score-aggregator test suite (35 tests)

**Fichiers créés (1) :**
- `src/scoring/services/__tests__/score-aggregator.test.ts` — 35 tests couvrant : agrégation normale, scores 0 et 100, input vide, dimension unique, distribution des poids, scores hors limites, dimensions manquantes, filtrage par confidence, structure du résultat, précision moyenne pondérée, toggle confidence weighting, variance attendue, mapping catégorie→dimension, utilitaire createScoredFinding, compteurs metadata, minMetricsForDimension custom

**35/35 tests passed.**

---
## 2026-03-12 — fix: Phase 2E Anti-Hallucination — fallbacks consensus-engine + reflexion

**Fichiers modifiés (2) :**
- `src/agents/orchestration/consensus-engine.ts` — Ajout des 5 directives anti-hallucination (Confidence Threshold, Abstention Permission, Citation Demand, Self-Audit, Structured Uncertainty) dans les 4 fallback LLM calls : debateRound1Fallback, debateRound2 fallback, debateRound3 fallback, arbitrateFallback
- `src/agents/orchestration/reflexion.ts` — Ajout des 5 directives anti-hallucination dans les 3 fallback LLM calls legacy : generateCritiques, identifyDataNeeds, generateImprovements

---
## 2026-03-12 — fix: Phase 2G accessibilité WCAG AA — progressbar crédits

**Fichiers modifiés (1) :**
- `src/components/layout/sidebar.tsx` — Ajout `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` sur la barre de solde crédits (CreditCard)

**Vérifications (2 fichiers déjà OK) :**
- `src/components/deals/board/views/arena-view.tsx` — `aria-label` déjà présent sur les boutons membres
- `src/components/shared/score-badge.tsx` — `tabIndex={0}` déjà présent

---
## 2026-03-12 — fix: Phase 1-2-3 mega-audit corrections

**Phase 1C — Positionnement Règle N°1 UI visible (3 fichiers) :**
- `src/components/shared/severity-legend.tsx` — "avant d'investir" → "avant toute décision"
- `src/components/shared/severity-badge.tsx` — "AVANT d'investir" → "avant toute décision"
- `src/components/chat/deal-chat-panel.tsx` — "avant d'investir" → "avant de me décider"

**Phase 1B — Crédits system (2 fichiers) :**
- `src/services/credits/usage-gate.ts` — Fail-open → fail-closed en prod, double refund idempotence via findFirst
- `src/app/api/analyze/route.ts` — TOCTOU: suppression canAnalyzeDeal(), seul recordDealAnalysis() atomique reste

**Phase 1D — UX critique (3 fichiers) :**
- `src/app/(dashboard)/dashboard/page.tsx` — Carte "Plan" → "Crédits" avec solde + lien /pricing
- `src/components/layout/sidebar.tsx` — "Analytiques" déplacé dans adminNavItems
- `src/app/(dashboard)/pricing/pricing-cta-button.tsx` — Toast Stripe → mailto contact@angeldesk.io

**Phase 2A — Positionnement prompts agents (7 fichiers) :**
- question-master, legal-regulatory, synthesis-deal-scorer, conditions-analyst, benchmark-tool, early-warnings, types.ts

**Phase 2C — Performance :** export-pdf deal+analysis parallélisés
**Phase 2D — Labels :** score-badge aligné ui-configs, tier1-results "Analyse détaillée"
**Phase 2E — Anti-hallucination :** fact-extractor meta-eval directives 2/3/5, board-orchestrator dedup guard
**Phase 3B/3D — Credits :** badge seuils, purchase-modal mailto, canAnalyze >= QUICK_SCAN

**Tests :** schemas verdict corrigé, credit-flow idempotence mock. **463/463 passed.**

---
## 2026-03-12 — fix: Phase 2D accents français + Phase 2G accessibilité WCAG AA

**Phase 2D — Accents français manquants (7 fichiers) :**
- `src/components/deals/board/vote-board.tsx` — "Majorite forte" → "Majorité forte", "Echec" → "Échec", "de debat" → "de débat"
- `src/components/deals/board/views/arena-view.tsx` — "Debat" → "Débat", "Derniere reponse" → "Dernière réponse", "A change de position" → "A changé de position", "les details" → "les détails"
- `src/components/deals/board/views/chat-view.tsx` — "Position changee" → "Position changée", "Reduire" → "Réduire" (x2)
- `src/components/deals/board/views/columns-view.tsx` — "Reduire" → "Réduire" (x2)
- `src/components/deals/board/views/timeline-view.tsx` — "Reduire" → "Réduire"
- `src/components/deals/board/board-teaser.tsx` — "deliberent" → "délibèrent", "Debat structure" → "Débat structuré", "desaccords" → "désaccords", "modeles" → "modèles"
- `src/components/shared/score-badge.tsx` — "modele" → "modèle", "retourne" → "retourné", "Echelle" → "Échelle", "Legende echelle" → "Légende échelle"

**Phase 2G — Accessibilité WCAG AA (3 fichiers) :**
- `src/components/deals/board/views/arena-view.tsx` — Ajout `aria-label` sur les boutons de membres du board
- `src/components/layout/sidebar.tsx` — Ajout `aria-current="page"` sur les liens nav actifs (4 emplacements : desktop main, desktop admin, mobile main, mobile admin)
- `src/components/shared/score-badge.tsx` — Ajout `tabIndex={0}` sur le score badge pour la navigation clavier

---
## 2026-03-12 — feat: user account deletion

**Fichiers créés (2) :**
- `src/app/api/user/route.ts` — DELETE handler: authenticates via `requireAuth()`, deletes Vercel Blob files for documents, then in a Prisma transaction deletes all orphan records (AIBoardSession, ChatConversation, CostEvent, UserBoardCredits, UserDealUsage) and finally the User record (cascading Deal, CreditBalance, CreditTransaction, ApiKey, Webhook, LiveSession and all sub-relations).
- `src/components/settings/delete-account-button.tsx` — Client component with red "Supprimer mon compte" button, shadcn AlertDialog confirmation, loading state, calls DELETE /api/user then Clerk signOut().

**Fichiers modifiés (1) :**
- `src/app/(dashboard)/settings/page.tsx` — Added danger zone card at bottom with DeleteAccountButton, imported AlertTriangle icon.

**`npx tsc --noEmit` : OK (no new errors).**

---
## 2026-03-12 — security: SSRF protection for website crawling/resolving

**Fichier cree (1) :**
- `src/lib/url-validator.ts` — Exports `isPrivateUrl()` and `validatePublicUrl()`. Checks hostname against private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7, fe80::/10), blocks localhost/0.0.0.0, resolves DNS to verify the actual IP is public, and enforces http/https-only protocols.

**Fichiers modifies (2) :**
- `src/services/context-engine/connectors/website-crawler.ts` — Added `validatePublicUrl()` check in `crawlPage()` before every fetch. Private URLs return null (skipped).
- `src/services/context-engine/website-resolver.ts` — Added `validatePublicUrl()` check in `validateUrl()` before the HEAD/GET fetch. Private URLs return false (invalid).

**`npx tsc --noEmit` : OK (no new errors).**

---
## 2026-03-12 — feat: authenticated proxy route for document download

**Fichier créé (1) :**
- `src/app/api/documents/[documentId]/download/route.ts` — GET route that authenticates via `requireAuth()`, verifies deal ownership, then streams the file from Vercel Blob (or local storage) with correct Content-Type and Content-Disposition headers. Returns 404 if not found, 403 if not owned by user.

---
## 2026-03-12 — security: timing-safe CRON_SECRET comparison in cron routes

**Fichiers modifiés (5) :**
- `src/app/api/cron/maintenance/cleaner/route.ts` — `===` replaced with `timingSafeEqual` from `node:crypto`
- `src/app/api/cron/maintenance/sourcer/route.ts` — idem
- `src/app/api/cron/maintenance/completer/route.ts` — idem
- `src/app/api/cron/maintenance/supervisor/check/route.ts` — idem
- `src/app/api/cron/maintenance/supervisor/weekly-report/route.ts` — idem

Handles length mismatch (early return false) before calling `timingSafeEqual` to avoid `RangeError`.

---
## 2026-03-12 — fix: Phase 1 CRITICAL — positionnement, crédits, UX

**Phase 1C — Positionnement Règle N°1 (3 fichiers) :**
- `src/components/shared/severity-legend.tsx` — "avant d'investir" → "avant toute décision"
- `src/components/shared/severity-badge.tsx` — "AVANT d'investir" → "avant toute décision"
- `src/components/chat/deal-chat-panel.tsx` — "avant d'investir" → "avant de me décider"

**Phase 1B — Crédits system (2 fichiers) :**
- `src/services/credits/usage-gate.ts` — Fix 6: Fail-open → fail-closed en production (deductCredits + getOrCreateBalance bloquent si tables absentes en prod). Fix 7: Double refund idempotence (check `creditTransaction.findFirst` avant refund).
- `src/app/api/analyze/route.ts` — Fix 8: Suppression TOCTOU `canAnalyzeDeal()` préalable, seul `recordDealAnalysis()` atomique reste.

**Phase 1D — UX critique (3 fichiers) :**
- `src/app/(dashboard)/dashboard/page.tsx` — Carte "Plan" remplacée par carte "Crédits" avec solde + lien /pricing
- `src/components/layout/sidebar.tsx` — "Analytiques" déplacé dans adminNavItems (visible uniquement pour admins)
- `src/app/(dashboard)/pricing/pricing-cta-button.tsx` — Toast Stripe remplacé par mailto contact@angeldesk.io

**`npx tsc --noEmit` : OK.**

---
## 2026-03-11 — fix: RecommendationBadge affiche les clés brutes au lieu des labels

**Problème :** Sur la page d'analyse Tier 3, les badges de recommandation affichaient `alert_dominant` en texte brut au lieu de "Signaux d'alerte dominants". La raison : `rationale` affichait "Analyse en cours" (fallback).

**Cause racine :**
1. `tier3-results.tsx` avait un `RECOMMENDATION_CONFIG` local (l.71-76) qui shadowait le global de `ui-configs.ts` et ne contenait que les anciennes clés (`invest/pass/wait/negotiate`). Les nouvelles clés (`very_favorable/favorable/contrasted/vigilance/alert_dominant`) n'y étaient pas → fallback sur le texte brut.
2. `synthesis-deal-scorer.ts` cherchait le `rationale` et `action` uniquement dans `data.findings?.recommendation` et `data.investmentRecommendation`, mais le LLM retourne dans `data.recommendation` (conformément au schema Zod). Résultat : fallback "Analyse en cours" et action par défaut "vigilance".

**Fichiers modifiés :**
- `src/components/deals/tier3-results.tsx` — `RECOMMENDATION_BADGE_CONFIG` avec toutes les clés (new + legacy). `RECOMMENDATION_ICONS` idem. `MEMO_RECOMMENDATION_CONFIG` idem.
- `src/agents/tier3/synthesis-deal-scorer.ts` — `rawAction` et `rawRationale` cherchent aussi dans `data.recommendation` et `data.investmentThesis.summary`. `LLMSynthesisResponse` enrichi avec `recommendation` et `investmentThesis`.
- `src/agents/tier3/schemas/synthesis-deal-scorer-schema.ts` — Ajout `rationale` optionnel dans le schema `recommendation`.

---
## 2026-03-11 — fix: déductions crédits manquantes + refunds (Live Coaching, Re-analyse, Analyse)

**Contexte :** Audit complet des routes API a révélé que 2 actions payantes ne déduisaient aucun crédit, et que les refunds en cas d'échec étaient absents.

**A. Live Coaching — check + déduction + refund (2 fichiers) :**
- `src/app/api/live-sessions/route.ts` — Ajout `checkCredits('LIVE_COACHING')` à la création de session. Bloque la création si crédits insuffisants (402).
- `src/app/api/live-sessions/[id]/start/route.ts` — Ajout `deductCredits('LIVE_COACHING')` avant le deploy du bot (8 crédits). Refund automatique via `refundCredits()` si le bot échoue au deploy (2 chemins d'erreur couverts : erreur video_separate_png + erreur générale).

**B. Re-analyse — check + déduction + refund (1 fichier) :**
- `src/app/api/coaching/reanalyze/route.ts` — Ajout `deductCredits('RE_ANALYSIS')` pour les modes targeted/full (3 crédits). Delta mode reste gratuit. Restructuré pour vérifier les préconditions (summary existe) AVANT la déduction. Refund automatique si `triggerTargetedReanalysis()` échoue.

**C. Analyse — refund sur échec (1 fichier) :**
- `src/app/api/analyze/route.ts` — Ajout `refundCredits()` dans le `.catch()` de `orchestrator.runAnalysis()`. Si l'analyse crash complètement, les crédits sont remboursés.

**Tableau final des déductions :**
| Action | Coût | Check | Deduct | Refund |
|--------|------|-------|--------|--------|
| Quick Scan | 1 | canAnalyzeDeal | recordDealAnalysis | refundCredits |
| Deep Dive | 5 | canAnalyzeDeal | recordDealAnalysis | refundCredits |
| AI Board | 10 | canStartBoard | consumeCredit | refundCredit |
| Live Coaching | 8 | checkCredits | deductCredits | refundCredits |
| Re-analyse | 3 | deductCredits | deductCredits | refundCredits |
| Chat | 0 | — | — | — |
| PDF Export | 0 | — | — | — |

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: migration UI complète vers système de crédits (suppression ancien plan Pro/Gratuit)

**Contexte :** Le backend avait déjà migré vers un système de crédits par pack (CREDIT_PACKS, CREDIT_COSTS dans `services/credits/types.ts`), mais l'UI affichait encore l'ancien modèle "Plan Gratuit / Plan Pro à 249€/mois". Migration complète de tous les composants UI.

**A. Nouveau composant — Modale d'achat de crédits (1 fichier) :**
- `src/components/credits/credit-purchase-modal.tsx` — Modale affichant les 5 packs avec prix, auto-sélection du pack couvrant le déficit, badges "Suffisant"/"Populaire", déverrouillage features (Négociation/API) selon totalPurchased.

**B. Credit Badge refonte (1 fichier) :**
- `src/components/credits/credit-badge.tsx` — Remplacé badge "PRO" / "X/Y analyses" par "N crédits" avec Popover dropdown (coûts par action + bouton acheter). Couleur dynamique selon solde (rouge/amber/normal).

**C. Credit Modal refonte (1 fichier) :**
- `src/components/credits/credit-modal.tsx` — Simplifié en wrapper de CreditPurchaseModal. Supprimé ancien type LIMIT_REACHED/UPGRADE_REQUIRED/TIER_LOCKED. Mapping legacy actions (ANALYSIS→DEEP_DIVE, UPDATE→RE_ANALYSIS, BOARD→AI_BOARD).

**D. Sidebar refonte (1 fichier) :**
- `src/components/layout/sidebar.tsx` — Supprimé "Plan Gratuit"/"Plan Pro" + barre d'utilisation mensuelle. Remplacé par carte crédits avec solde, barre visuelle, features débloquées (Quick Scan, Deep Dive, Négociation, API) selon totalPurchased, bouton "Acheter des crédits". Desktop + Mobile.

**E. ProTeaser refonte (1 fichier, 4 variantes) :**
- `src/components/shared/pro-teaser.tsx` — Supprimé toutes les mentions "PRO", "249EUR/mois", "Crown" icon. Remplacé par "crédits", "Coins" icon, "Acheter des crédits"/"Voir les packs de crédits".

**F. Settings page refonte (1 fichier) :**
- `src/app/(dashboard)/settings/page.tsx` — Supprimé carte "Abonnement" (Plan Pro/Gratuit, analyses/mois). Remplacé par carte "Crédits" avec solde, total acheté, dernier pack, features débloquées, lien pricing.

**G. Analysis panel mise à jour (1 fichier) :**
- `src/components/deals/analysis-panel.tsx` — Interface QuotaData migrée vers CreditBalanceInfo. handleAnalyzeClick vérifie le solde crédits au lieu de quota.analyses. CreditModal reçoit les nouvelles props (balance, totalPurchased). Supprimé badge PRO sur PDF export. Type d'analyse (`analysisType`) déterminé par le solde crédits (canAffordDeepDive) au lieu de subscriptionPlan. Ajout `effectivePlan` dérivé de la présence de résultats Tier 2/3 pour afficher correctement les résultats payés (corrige bug où un utilisateur ayant payé un Deep Dive avec des crédits voyait des ProTeasers au lieu des résultats). Toast "Passer PRO" → "Acheter des crédits". Import inutilisé `Crown` supprimé, import `AnalysisTypeValue` ajouté.

**H. Board teaser mise à jour (1 fichier) :**
- `src/components/deals/board/board-teaser.tsx` — Supprimé "Plan PRO", "249€/mois". Remplacé par "10 crédits", "Packs à partir de 49€". Import inutilisé `BOARD_PRICING` supprimé.

**I. API /api/analyze — migration critique (1 fichier) :**
- `src/app/api/analyze/route.ts` — Supprimé l'ancien check `userDealUsage.monthlyLimit` (hardcodé à 3) et l'override du type d'analyse par `subscriptionStatus`. Remplacé par déduction de crédits via `recordDealAnalysis()`. Le type d'analyse demandé par le frontend est maintenant utilisé directement (plus d'override `FREE→tier1_complete`). Import inutilisé `SubscriptionTier` supprimé.

**J. API /api/deals/[dealId]/export-pdf — suppression gate PRO (1 fichier) :**
- `src/app/api/deals/[dealId]/export-pdf/route.ts` — Supprimé le check `subscriptionStatus === "FREE"` qui bloquait l'export PDF pour les utilisateurs gratuits. PDF_EXPORT coûte 0 crédits, donc accessible à tous.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: data reliability, analytical tone, narrative sanitizer, DB cross-reference

**Contexte :** Troisième passe corrective. Ajout systématique de la classification de fiabilité des données (6 niveaux), du ton analytique obligatoire (Règle N°1), d'un sanitizer post-LLM pour le langage prescriptif, et d'instructions de cross-reference DB explicites.

**A. BaseAgent — 2 nouvelles directives auto-injectées (1 fichier) :**
- `src/agents/base-agent.ts` — Ajout de `getDataReliabilityDirective()` et `getAnalyticalToneDirective()` (méthodes protégées). Injectées automatiquement dans `buildFullSystemPrompt()` pour tous les agents Tier 0/1 (+ marketplace-expert, document-extractor, deal-scorer, red-flag-detector, etc.).

**B. Tier 3 — Ajout explicite des 2 directives (6 fichiers) :**
- contradiction-detector, synthesis-deal-scorer, memo-generator, devils-advocate, scenario-modeler, conditions-analyst — Ajout de `${this.getDataReliabilityDirective()}` + `${this.getAnalyticalToneDirective()}`.

**C. Tier 2 standalone — Ajout des 2 directives (21 fichiers) :**
- Tous les experts sectoriels (saas, fintech, ai, healthtech, deeptech, climate, consumer, hardware, gaming, blockchain, biotech, edtech, proptech, mobility, foodtech, hrtech, legaltech, cybersecurity, spacetech, creator, general) — Variables `dataReliability` + `analyticalTone` ajoutées au site d'appel `completeJSON()`.

**D. Chat + Board — Ajout hardcodé (2 fichiers) :**
- `deal-chat-agent.ts`, `board-member.ts` — Texte des 2 directives ajouté directement dans `buildSystemPrompt()`.

**E. base-sector-expert.ts — Ajout des 2 directives (1 fichier) :**
- `src/agents/tier2/base-sector-expert.ts` — Ajouté dans `buildSectorExpertPrompt()`.

**F. Narrative Sanitizer post-LLM (2 fichiers) :**
- `src/agents/orchestration/result-sanitizer.ts` — Nouvelle fonction `sanitizeAgentNarratives()` avec 22 patterns prescriptifs (FR + EN). Scanne récursivement les champs narratifs (narrative, summary, nextSteps, forNegotiation, etc.) et remplace le langage directif par des formulations analytiques.
- `src/agents/orchestrator/index.ts` — Intégration à 5 points de collecte des résultats (Tier 1, Tier 2, Tier 3, quick analysis). Log `[NarrativeSanitizer]` si violations corrigées.

**G. DB Cross-Reference prompts (6 fichiers) :**
- team-investigator, legal-regulatory, tech-stack-dd, tech-ops-dd, gtm-analyst, cap-table-auditor — Ajout d'une section "CROSS-REFERENCE DB OBLIGATOIRE" explicite dans le prompt.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 6 standalone Tier 2 experts (batch 3)

**Contexte :** Suite des batches 1 et 2. Ajout des deux directives `dataReliability` (classification de fiabilite des donnees) et `analyticalTone` (ton analytique obligatoire) aux 6 derniers experts Tier 2 standalone restants. Les variables sont injectees avant `citationDemand`/`structuredUncertainty` dans le `systemPrompt` concatenation du `complete()` call.

**Fichiers modifies (6) :**
- `src/agents/tier2/hrtech-expert.ts`
- `src/agents/tier2/legaltech-expert.ts`
- `src/agents/tier2/cybersecurity-expert.ts`
- `src/agents/tier2/spacetech-expert.ts`
- `src/agents/tier2/creator-expert.ts`
- `src/agents/tier2/general-expert.ts`

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 8 standalone Tier 2 experts (batch 2)

**Contexte :** Suite du batch 1. Ajout des deux directives (`dataReliability` + `analyticalTone`) aux 8 experts Tier 2 standalone restants, avant `citationDemand`/`structuredUncertainty`, et injection dans le `systemPrompt` concatenation.

**Fichiers modifies (8) :**
- `src/agents/tier2/hardware-expert.ts`
- `src/agents/tier2/gaming-expert.ts`
- `src/agents/tier2/blockchain-expert.ts`
- `src/agents/tier2/biotech-expert.ts`
- `src/agents/tier2/edtech-expert.ts`
- `src/agents/tier2/proptech-expert.ts`
- `src/agents/tier2/mobility-expert.ts`
- `src/agents/tier2/foodtech-expert.ts`

**Adaptations par fichier :**
- hardware/gaming/biotech: `system + dataReliability + analyticalTone + citationDemand + structuredUncertainty`
- blockchain: `buildBlockchainSystemPrompt(stage) + dataReliability + analyticalTone + ...`
- edtech/proptech/foodtech: `systemPromptText + dataReliability + analyticalTone + ...`
- mobility: `systemPrompt + dataReliability + analyticalTone + ...`

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to 7 standalone Tier 2 experts (batch 1)

**Contexte :** Les experts Tier 2 standalone (object-based, pas BaseAgent) appendaient manuellement les directives anti-hallucination au call site. Ajout de deux nouvelles directives (`dataReliability` + `analyticalTone`) avant `citationDemand`/`structuredUncertainty`, et injection dans le `systemPrompt` concatenation.

**Fichiers modifies (7) :**
- `src/agents/tier2/saas-expert.ts`
- `src/agents/tier2/fintech-expert.ts`
- `src/agents/tier2/ai-expert.ts`
- `src/agents/tier2/healthtech-expert.ts`
- `src/agents/tier2/deeptech-expert.ts`
- `src/agents/tier2/climate-expert.ts`
- `src/agents/tier2/consumer-expert.ts`

**Note :** marketplace-expert.ts extends BaseAgent (class-based) et utilise `this.llmCompleteJSON()` -- il n'a PAS le pattern standalone `citationDemand`/`structuredUncertainty` au call site. Les directives pour cet agent passent par le mecanisme BaseAgent.

**`npx tsc --noEmit` : OK.**

---
## 2026-03-10 — feat: add data reliability + analytical tone directives to Tier 2 base, chat agent, board member

**Contexte :** Ajout de deux nouvelles sections de directive (CLASSIFICATION DE FIABILITÉ DES DONNÉES + TON ANALYTIQUE OBLIGATOIRE) dans les prompts systeme de 3 fichiers, avant les blocs anti-hallucination existants.

**Fichiers modifies (3) :**
- `src/agents/tier2/base-sector-expert.ts` — `buildSectorExpertPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives. Propage aux experts crees via `createSectorExpert()`.
- `src/agents/chat/deal-chat-agent.ts` — `buildSystemPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives (hardcoded, pas via BaseAgent methods).
- `src/agents/board/board-member.ts` — `buildSystemPrompt()` : 2 sections ajoutees avant les 5 anti-hallucination directives (hardcoded, pas via BaseAgent methods).

**Note :** Les 21 experts Tier 2 individuels (saas-expert, fintech-expert, etc.) ont chacun leur propre `buildSystemPrompt()` avec directives hardcoded. Ils n'utilisent PAS `buildSectorExpertPrompt()` de base-sector-expert.ts. Ils necessitent une modification individuelle separee.

**`npx tsc --noEmit` : OK.**
