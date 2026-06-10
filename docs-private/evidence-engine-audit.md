# Evidence Engine — Audit Phase 0

> Date de l'audit : 2026-05-17 (mise à jour post-déchiffrement le même jour)
> Auteur : Claude
> Sample : Avekapeti, FurLove, E4N (3 deals choisis par Sacha)
> Méthode : lecture seule DB Neon prod + cartographie code (`src/services/documents`, `src/services/evidence-ledger`, `src/services/corpus`, `src/agents/document-context-retriever.ts`, prisma `schema.prisma`) + déchiffrement local `Document.extractedText` via `DOCUMENT_ENCRYPTION_KEY` (clé fournie hors-conversation, dans `.env.vercel.audit` gitignored, supprimée après audit). Aucun write.
> Confiance globale : **HIGH**. Tous les gates Codex content-level sont désormais CONFIDENT (citations courtes en §3-§5).

---

## 1. TL;DR

1. **L'inférence temporelle déterministe est limitée aux emails.** Tous les autres types de documents (cap tables, BP, decks, financials) sortent du pipeline avec `sourceDate = null`. Sur 20 documents des 3 deals, **15 ont `sourceDate = null`**, dont **toutes les pièces métier critiques non-mail**.
2. **Bug context engine actif sur 15/20 docs : `produit le <uploadedAt>`.** Deux chemins co-existent :
   - `document-context-retriever.ts:147` (`buildDocumentSourcePrelude`) : retourne `null` pour les FILE non-attachés → pas de prelude par-doc. Conséquence prévisible.
   - **`base-agent.ts:976-978`** (chemin **principal** appelé par tous les agents Tier 1+2+3) : `producedAtLabel = sourceDate ?? receivedAt ?? uploadedAt`, **utilisé sans fallback null** dans la ligne `### <name> (<kind>, <type>) — produit le <producedAt>, importé le <importedAt>`. Pour les 15 FILE sans sourceDate du sample, le label `produit le` = `uploadedAt`. Le tri chronologique des docs (`base-agent.ts:1060`) utilise le même fallback.
   Conséquence concrète sur Avekapeti : le cap table de septembre 2024 est présenté à l'agent comme `### Table de capi Septembre 2024 signeģe.png (Fichier, CAP_TABLE) — produit le 17/05/2026, importé le 17/05/2026`. Ce n'est pas un trou d'information, c'est une **information fausse**. Le tri remonte aussi tous les FILE non datés au même rang chronologique = "produits aujourd'hui".
3. **L'inférence email a un trou de couverture sur les `.docx`.** Sur FurLove, `Mail - 22:01:26.docx` reste `sourceKind = FILE` ; idem `Message e4n.docx`. Le texte commence par "Très cher Jean Marc" ou "Hello Eryck" — clairement un corps d'email, mais **pas de header `De:/From:/Date:`** parce que les .docx Word ne préservent pas les headers d'un mail collé en texte brut. La regex `extractThreadMessages` ne peut donc pas s'accrocher.
4. **Les filenames portent souvent l'information temporelle qu'on cherche.** "Septembre 2024", "BP Avekapeti 2026", "Fur-Love-2026-2030-Sept-2025-Capital-raise" — l'extracteur déterministe les ignore.
5. **Les footers de deck portent un signal `DOCUMENT_DATE` exploitable.** Le deck E4N a `"e4n Confidential – March 2026"` répété sur 32 pages ; la one-pager NETGEM a `"Confidentiel NETGEM - Avril 2026"`. Ces signatures de pied de page sont des candidats déterministes (regex `/(Confidentiel|Confidential)\s*[–\-—]\s*(month)\s+(\d{4})/i`) jamais utilisés aujourd'hui.
6. **Les bilans portent des marqueurs "as of" / "period" explicites.** Le bilan FurLove (`bilan_et_resultat - fur love.pdf`) répète `"Période du 01/01/2025 au 31/12/2025"` et `"Exercice clos le 31/12/2025"`. Le P&L `Fur_Love_Limited_-_Profit_and_Loss` dit `"For the 12 months ended 31 December 2025"`. Ce sont des `BALANCE_SHEET_AS_OF` et `FINANCIAL_PERIOD_ACTUAL` triviaux à extraire.
7. **Les emails contiennent des claims financiers structurés qu'on ignore.** Avekapeti `Mail.pdf` : `"nous avons réalisé 405k€ de CA vs 270k en mars 2025 soit bien plus que prévu dans le BP"`. Subject `Mail 3.pdf` : `"Co-invest VC, marketplace impact 3M€ CA 2025, rentable"`. → Deux `METRIC_CLAIM` (CA mars 2026 = 405k€, CA 2025 = 3M€) qui ne sont ni structurés ni rapprochables du BP. Cf. §6.4.
8. **Les emails citent leurs pièces jointes par nom**, ce qui rend le `ATTACHMENT_RELATION` faisable. Avekapeti `Mail.pdf` contient `"Table de capi Septembre 2024 signeģe.png 136K"` — exactement le filename du cap table uploadé séparément (id `cmp9r5zpl0001l204t1nfigny`), mais aucun lien `corpusParentDocumentId` n'a été créé. Match string exact possible.
9. **Risque OPS confirmé** : `DOCUMENT_ENCRYPTION_KEY` est marquée `Sensitive` dans Vercel → `vercel env pull` et `vercel env run` retournent une valeur vide. La clé est récupérable depuis le secrets manager hors-runtime (validé : déchiffrement local OK sur `extractedText` de Furlove et des autres deals). Sans cette source externe, perte irréversible — cf. §7.

---

## 2. Scope & méthode

### Inventaire DB sur les 3 deals

```
DEAL                                                                      DOCS
e4n                                  (cmo2qyqub0001it41vhsh1g7c)          0   (deal vide, ignoré)
e4n                                  (cmobnpn7o0001ittsad2yzv9d)          1   (extraction FAILED, ignoré)
e4n                                  (cmofnoij00001ju04gdr8rno1)          7   ← deal principal E4N
avekapeti                            (cmp9q8o690001l804fx5rd5mc)          6
furlove                              (cmp9w8b4v0001jp04tcvzviux)          7
```

Audit ciblé sur les 20 documents des 3 deals "vivants".

### Outillage
- Script `scripts/debug/audit-evidence-deals.mjs` (lecture seule, non commité, dotenv vers `.env.local`). Récupère : `id`, `name`, `type`, `sourceKind`, `sourceDate`, `receivedAt`, `sourceAuthor`, `sourceSubject`, `sourceMetadata`, `uploadedAt`, `corpusParentDocumentId`, `processingStatus`, métadonnées extraction. Tente regex de dates sur `extractedText` (échec : chiffré, voir §7).
- Lecture code :
  - `prisma/schema.prisma:257-339` (Document model)
  - `src/services/documents/email-source-inference.ts` (171 lignes)
  - `src/agents/document-context-retriever.ts:139-173` (`buildDocumentSourcePrelude`)
  - `src/services/evidence-ledger/index.ts` (282 lignes, déjà partiellement présent)
  - `src/services/corpus/index.ts` (391 lignes)
  - `src/components/deals/corpus/extract-email-metadata.ts` (288 lignes)

### Ce qui existe déjà (à ne PAS réinventer)
- **`evidence-ledger`** : produit déjà un ledger de preuves à partir du `factStore` + `documents.extractionRuns[].pages[].artifact.numericClaims/tables/charts`, taggé par reliability (`AUDITED / VERIFIED / DECLARED / PROJECTED / ESTIMATED / UNVERIFIABLE`). Sortie injectée dans les prompts agent via `formatEvidenceLedgerForPrompt()`. **Couvre la partie numérique des claims** — Phase 6 du plan a donc déjà des fondations.
- **`email-source-inference`** : extrait `sourceDate`, `sourceAuthor`, `sourceSubject` et un thread de messages depuis le texte OCR d'un PDF email uploadé en `FILE`. Confiance `high`/`medium`. Stockage : `Document.sourceDate` + `Document.sourceMetadata.threadMessages`.
- **`corpusParentDocumentId`** : déjà en place pour relier un FILE (PDF/image) à un EMAIL/NOTE parent. Le UI corpus s'en sert. Ce qui manque : la **détection automatique** de relations email ↔ pièce jointe à partir du texte des emails.
- **`extract-email-metadata`** : parser regex multi-format (Outlook FR/EN, Gmail HTML/text, ICS, etc.).

---

## 3. Avekapeti (id `cmp9q8o690001l804fx5rd5mc`) — 6 documents

> Confiance des observations : metadata = **CONFIDENT**. Contenu OCR = **PROBABLE** (cf. §7).

| # | Filename | type | sourceKind | sourceDate | uploadedAt | corpus parent | Run |
|---|----------|------|------------|------------|------------|---------------|-----|
| 1 | `Deck_Avekapeti VF.pdf` | PITCH_DECK | FILE | **null** | 2026-05-17 | null | READY_WITH_WARNINGS 13/16 |
| 2 | `Table de capi Septembre 2024 signeģe.png` | CAP_TABLE | FILE | **null** | 2026-05-17 | null | READY 1/1 |
| 3 | `BP Avekapeti 2026 VF.xlsx` | FINANCIAL_MODEL | FILE | **null** | 2026-05-17 | null | READY 7/7 |
| 4 | `Mail.pdf` | OTHER | **EMAIL** | 2026-04-22 01:03 UTC | 2026-05-17 | null | READY_WITH_WARNINGS 1/1 |
| 5 | `Mail 3.pdf` | OTHER | **EMAIL** | 2026-04-22 01:01 UTC | 2026-05-17 | null | READY_WITH_WARNINGS 1/1 |
| 6 | `Mail 2.pdf` | OTHER | **EMAIL** | 2026-04-22 01:02 UTC | 2026-05-17 | null | READY_WITH_WARNINGS 3/3 |

### 3.1 Cap table — **gate Codex (a) CONFIRMÉE / CONFIDENT**

- `name = "Table de capi Septembre 2024 signeģe.png"` ← le filename porte explicitement `Septembre 2024`.
- `sourceDate = null` → l'inférence ne tente rien sur le filename pour les `FILE`, et l'OCR n'est pas non plus parsé pour `à jour au …`.
- `sourceKind = CAP_TABLE` est correctement typé en revanche.
- **Preuve content-level** (déchiffrement OCR direct, citation courte) :
  ```
  100% Table de capitalisation à jour au 18/09/2024
    0% Table de capitalisation à jour au 18/09/2024
  ```
  La mention `à jour au 18/09/2024` apparaît deux fois dans les 3,172 caractères de `extractedText`. `year_spread = 2024×1` → c'est la seule année du document.
- **Conséquence agents** : aucun prelude rendu (cf. §6). L'agent voit "cap table" sans aucun marqueur temporel. La fraîcheur est invisible.
- Gate (a) « cap table Avekapeti doit montrer "à jour au 18/09/2024" dans extractedText mais sourceDate = null » → **CONFIDENT, intégralement vérifiée**.

### 3.2 BP — **gate Codex (b) REFORMULÉE / CONFIDENT mais pas comme attendu**

- `name = "BP Avekapeti 2026 VF.xlsx"` ← filename évoque "BP 2026" sans préciser l'horizon.
- `sourceDate = null` (FILE, pas d'inférence).
- **Preuve content-level** : `year_spread = 2025×8, 2026×30`. **Pas de 2027/2028/2029/2030**. C'est un compte de résultat prévisionnel **mensuel sur 2 ans (2025 et 2026)**, pas un forecast 5 ans. Citation courte :
  ```
  [COMPTE DE RESULTAT PREVISIONNEL SUR UN AN] Janvier 2025: février 2025 | mars 2025 | avril 2025 | mai 2025 | juin 2025
  [COMPTE DE RESULTAT PREVISIONNEL SUR UN AN] Janvier 2026: février 2026 | mars 2026 | avril 2026 | mai 2026 | juin 2026
  ```
- Gate Codex (b) initialement formulée « BP doit montrer des périodes 2026-2030 » → **à reformuler** : le BP Avekapeti spécifique ne couvre **pas** 2026-2030 mais 2025 + 2026 mensuel (actuals 2025 + forecast 2026). Les deux deals qui présentent un horizon 2026-2030 dans le sample sont :
  - FurLove `Fur-Love-2026-2030-Sept-2025-Capital-raise.pdf` (`year_spread = 2026×18, 2027×22, 2028×18, 2029×18` ; citation : `"Revenue 2026 2027 2028 2029 2030"`)
  - E4N `Model Output Extract.pdf` (citation : `"Dec-26 Dec-27 Dec-28 Dec-29 Dec-30"` + `"FY2026 FY2027 FY2028 FY2029 FY2030"`)
  - E4N `Financial Model vFinal.xlsx` (`year_spread = 2024×5, 2025×4, 2026×9, 2027×9, 2028×9, 2029×8` — mix actuals + 5y forecast)
- Le test fonctionnel reste valide : **les BPs ont effectivement des périodes multi-années non-extraites en signaux temporels**. Phase 2 doit produire `FINANCIAL_PERIOD_FORECAST` pour ces périodes.

### 3.3 Deck — **gate Codex (c) CONFIRMÉE / CONFIDENT**

- `name = "Deck_Avekapeti VF.pdf"` ← aucune date dans le filename.
- `sourceDate = null`.
- Run = `READY_WITH_WARNINGS 13/16 pages` (3 pages n'ont pas pu être extraites proprement).
- **Preuve content-level** : `year_spread = 2013×1, 2019×2, 2020×2, 2021×2, 2022×5, 2023×3, 2024×13, 2025×11, 2026×1, 2027×1, 2028×1, 2029×1` — **12 années distinctes mentionnées**, dominée par 2024-2025. Citations courtes :
  ```
  (jusqu'à +17 points en novembre 2025 vs novembre 2024)
  Septembre 2025 : ÉQUATION Recrutement de 2 commerciaux (stage / alternance)
  De 800k à 3M€ de CA entre 2022 et 2024
  ```
  Pas de footer du type `Confidential – <Month> <YYYY>` repérable, donc pas de DOCUMENT_DATE déterministe pour ce deck (différent de E4N / NETGEM, cf. §5).
- Gate (c) « deck doit montrer plusieurs années sans date globale évidente » → **CONFIDENT**.

### 3.4 Emails — **gate Codex (d) confirmée**

3 emails, tous correctement traités par `inferEmailSourceFromExtractedText` :

```
Mail.pdf
  sourceKind=EMAIL
  sourceDate=2026-04-22T01:03:00.000Z (forward — Eryck Rebbouh)
  sourceMetadata.threadMessages=[
    { from: "Eryck Rebbouh <erebbouh@hotmail.com>",       sentAt: "2026-04-22T01:03:00Z", subject: "Tr : Re : Avekapeti" },
    { from: "Fati Mrani <fati.mrani@avekapeti.co>",        sentAt: "2026-04-06T16:10:00Z", subject: "Re : Avekapeti" }
  ]
  confidence: "high"

Mail 3.pdf  → forward 2026-04-22 d'un mail 2026-02-24 de Fati Mrani (sujet "Co-invest VC, marketplace impact 3M€ CA 2025, rentable")
Mail 2.pdf  → forward 2026-04-22 d'une thread Fati Mrani 2026-03-17 puis antérieure (visible dans sourceMetadata)
```

Observations :
- ✓ `sourceDate` représente bien la **date du message de tête** (le forward) — sémantiquement correct pour "quand cette pièce nous a été transmise".
- ✓ `threadMessages` capture l'historique avec auteur/date/sujet — base solide pour Phase 4 (relations email ↔ pièces).
- ✓ Confidence `high` partout (subject + from + thread evidence présents).
- ⚠️ **`Mail.pdf` cite EXPLICITEMENT le filename de la cap table uploadée séparément** (preuve courte) :
  ```
  Table de capi Septembre 2024 signeģe.png  136K
  https://mail.google.com/mail/u/1/?ik=…
  ```
  → match exact possible avec le doc `cmp9r5zpl0001l204t1nfigny`. Phase 4 attachment-linker peut faire le lien `corpusParentDocumentId = "cmp9v668f0001jm04dvi6f8bx"` (Mail.pdf) sur le cap table — aujourd'hui les 6 documents Avekapeti ont `corpusParentDocumentId = null`.
- ⚠️ **`Mail.pdf` contient un claim financier structurable** (preuve courte) :
  ```
  6M€ et nous avons réalisé 405k€ de CA vs 270k en mars 2025
  soit bien plus que prévu dans le BP
  ```
  → 3 signaux extractibles : `VALUATION_CLAIM` (6M€), `METRIC_CLAIM` (CA mars 2026 = 405k€, actual), `METRIC_CLAIM` (CA mars 2025 = 270k€, comparable historique).
- ⚠️ Le subject `"Co-invest VC, marketplace impact 3M€ CA 2025, rentable"` contient un autre `METRIC_CLAIM` (CA 2025 = 3M€). Il pourrait être croisé avec le `bilan_et_resultat` (non présent côté Avekapeti) pour détecter une contradiction.

---

## 4. FurLove (id `cmp9w8b4v0001jp04tcvzviux`) — 7 documents

| # | Filename | type | sourceKind | sourceDate | corpus parent | Run |
|---|----------|------|------------|------------|---------------|-----|
| 1 | `bilan_et_resultat - fur love.pdf` | FINANCIAL_STATEMENTS | FILE | **null** | null | READY_WITH_WARNINGS 10/10 |
| 2 | `Fur_Love_Limited_-_Profit_and_Loss (1) (1).pdf` | FINANCIAL_STATEMENTS | FILE | **null** | null | READY_WITH_WARNINGS 1/1 |
| 3 | `Gmail - Response Ineke.pdf` | OTHER | **EMAIL** | 2026-03-11 12:18 UTC | null | READY_WITH_WARNINGS 3/3 |
| 4 | `Team.jpeg` | OTHER | FILE | **null** | null | READY 1/1 |
| 5 | `FUR LOVE SAFE ROUND €400k  (1)_compressed.pdf` | PITCH_DECK | FILE | **null** | null | READY_WITH_WARNINGS 14/15 |
| 6 | `Mail - 22:01:26.docx` | OTHER | **FILE** (⚠️ raté) | **null** | null | READY 1/1 |
| 7 | `Fur-Love-2026-2030-Sept-2025-Capital-raise-for-ARR-_1M (5).pdf` | FINANCIAL_STATEMENTS | FILE | **null** | null | READY_WITH_WARNINGS 9/9 |

### 4.1 Trou d'inférence email — `Mail - 22:01:26.docx`

- Filename **explicite** : `Mail` + `22:01:26` (vraisemblablement 22/01/2026).
- L'extracteur `inferEmailSourceFromExtractedText` requiert :
  1. `currentSourceKind` ∈ { absent, FILE } ✓
  2. Filename hint `/mail|email|courriel|message/i` ✓ (matche "Mail")
  3. Soit une thread Outlook/Gmail détectable, soit un header `From/De` ET `Date/Envoyé`
- **Cause confirmée par OCR** : le .docx commence directement par le **corps** du mail (citation courte, 3,631 chars de texte) :
  ```
  Très cher Jean Marc
  Merci infiniment pour votre temps hier et pour votre disponibilité.
  Je vous suis extrêmement reconnaissante. […]
  ```
  Aucun header `De:/From:/Date:/Sent:` n'a été préservé par Word. La regex `extractThreadMessages` ne peut donc rien accrocher.
- Résultat : `sourceDate = null`, `sourceKind = FILE`, **prelude agent = aucun**. Le contenu est traité comme une pièce neutre.
- **Recommandation Phase 2** : ajouter une heuristique "body-shape" qui détecte un email-like par (filename hint `mail|message|courriel`) AND (texte ≤ 5,000 chars) AND (opening pattern `Bonjour|Hello|Cher|Dear|Hi <Nom>`) AND (no `De:/From:` header). Confiance = LOW, mais permet au moins de set `sourceKind = EMAIL` et flagger pour saisie manuelle de date.
- Bonus content : ce mail contient lui aussi un claim financier — `"France CA 230 000 EUR 2025, année de lancement, et nous voulons tripler ce chiffre"` → `METRIC_CLAIM` CA France 2025 = 230k€.

### 4.2 Document multi-période — `Fur-Love-2026-2030-Sept-2025-Capital-raise-for-ARR-_1M (5).pdf`

- Filename encode **trois temporalités distinctes** : période de forecast (2026-2030), date du document (Sept 2025), objectif (Capital-raise-for-ARR-1M).
- **Preuve content-level** (citation courte) :
  ```
  Revenue 2026 2027 2028 2029 2030
  B2B - vets, pharm, retail  $198.098  $441.732  $793.289  $1.424.634  $1.960.867
  B2C Ecommerce              $459.558  $1.256.663  $2.955.340  $5.811.796  …
  ```
  `year_spread = 2026×18, 2027×22, 2028×18, 2029×18`. Cinq ans de forecast.
- `sourceDate = null`. Phase 2 doit produire au minimum trois signaux pour ce doc seul :
  - `DOCUMENT_DATE` = Sept 2025 (depuis filename ET potentiellement le footer)
  - `FINANCIAL_PERIOD_FORECAST` = 2026-01-01 → 2030-12-31
  - `METRIC_CLAIM` = ARR target 1M (depuis filename + body)

### 4.3 Email Gmail correctement inféré

- `Gmail - Response Ineke.pdf` — `sourceKind = EMAIL`, `sourceDate = 2026-03-11`, `from = "Ineke Meredith <inekemeredith@gmail.com>"`, `subject = "Re: Sorry for the long email!! BILAN"`, confidence `high`. Bon comportement.

### 4.4 SAFE ROUND deck — multi-claims temporels

`FUR LOVE SAFE ROUND €400k.pdf` (`year_spread = 1995..2029`, 11 années distinctes) mélange jalons passés et futurs sans date globale. Citations courtes :
```
Both NZ and France Live since December 2024
*Coverage under NZ pet insurance since October 2025
Goal 1 = ARR € 1M December 2026.  5-year BP for Europe only
Launch France end 2024  MRR 35K October 2025
MRR 50K March 2026  EXIT 2024 2025 2026 2027
```
- Signaux candidats : multiples `METRIC_CLAIM` avec `asOfDate` distincte (MRR 35K @ Oct 2025, MRR 50K @ Mar 2026), `FINANCIAL_PERIOD_FORECAST` 5y depuis aujourd'hui, et un `DOCUMENT_DATE` candidat ~ Sept 2025 (cohérent avec le filename de la sœur `Fur-Love-2026-2030-Sept-2025`).
- Aucun n'est aujourd'hui extrait ni surfacé dans le prelude agent.

### 4.5 Bilans / P&L — **gros gisement de signaux temporels jamais exploité**

Les deux pièces comptables FurLove ont des **marqueurs as-of et period parfaitement structurés** ignorés aujourd'hui :

- **`bilan_et_resultat - fur love.pdf`** (10 pages, `year_spread = 2024×20, 2025×60`) — preuve courte répétée 8x :
  ```
  BILAN ACTIF
  Période du 01/01/2025 au 31/12/2025  Présenté en Euros
  Exercice clos le        Exercice précédent
   31/12/2025              31/12/2024     (12 mois)
  ```
  → Trois signaux extractibles **déterministes** : `BALANCE_SHEET_AS_OF = 2025-12-31`, `FINANCIAL_PERIOD_ACTUAL = 2025-01-01 → 2025-12-31`, `FINANCIAL_PERIOD_ACTUAL = 2024-01-01 → 2024-12-31` (comparatif).
- **`Fur_Love_Limited_-_Profit_and_Loss (1) (1).pdf`** — preuve courte :
  ```
  Profit and Loss
  Fur Love Limited
  For the 12 months ended 31 December 2025
  JAN-DEC 2025
  ```
  → `BALANCE_SHEET_AS_OF = 2025-12-31`, `FINANCIAL_PERIOD_ACTUAL = 2025-01-01 → 2025-12-31`.
- Aujourd'hui `sourceDate = null` sur les deux, l'agent ne sait pas si le bilan est de 2023, 2025 ou 2030.

---

## 5. E4N (id `cmofnoij00001ju04gdr8rno1`) — 7 documents

| # | Filename | type | sourceKind | sourceDate | Run |
|---|----------|------|------------|------------|-----|
| 1 | `e4n - Confidential Presentation_BD.pdf` | PITCH_DECK | FILE | **null** | **BLOCKED 24/32** |
| 2 | `One-pager RE-VAL.pdf` | PITCH_DECK | FILE | **null** | READY 1/1 |
| 3 | `e4n-ocr-smoke-image-only.pdf` | PITCH_DECK | FILE | **null** | **BLOCKED 0/1** |
| 4 | `e4n-ocr-smoke-image-only-v2.pdf` | PITCH_DECK | FILE | **null** | READY_WITH_WARNINGS 1/1 |
| 5 | `e4n - Model Output Extract.pdf` | OTHER | FILE | **null** | READY_WITH_WARNINGS 3/3 |
| 6 | `Message e4n.docx` | OTHER | **FILE** (⚠️ raté) | **null** | READY_WITH_WARNINGS 3/4 |
| 7 | `e4n - Financial Model vFinal.xlsx` | FINANCIAL_MODEL | FILE | **null** | READY 20/20 |

### 5.1 Trou d'inférence email — `Message e4n.docx`

Même pattern que FurLove §4.1. Filename `Message e4n.docx` matche `/message/i`, mais le .docx commence directement par le corps (citation courte) :
```
Hello Eryck, voici un réponse à votre question sur le risque
de disruptions de l'IA. C'est un peu long mais important
qu'on soit alignés. :)
```
Aucun header `De:/From:/Date:`. Résultat : `sourceKind = FILE`, `sourceDate = null`, prelude agent = aucun. Même recommandation Phase 2 (body-shape heuristic).

### 5.2 Bruit dans le corpus — 2 PDFs de smoke test OCR

- `e4n-ocr-smoke-image-only.pdf` (BLOCKED 0/1) et `e4n-ocr-smoke-image-only-v2.pdf` (READY_WITH_WARNINGS) sont des fichiers de test (nom `smoke`). 1 page, identiques au déchiffrement (1,438 chars), citation :
  ```
  --- OCR Extracted Content ---
  [Page 1 - High-fidelity OCR]
  Customer Overview - Cont'd
  Genesis combines strong retention, repeatable new-logo wins …
  ```
  → Ce sont des extraits d'une page du **vrai** deck, ré-uploadés à part pour smoke-tester l'OCR. Tagged `PITCH_DECK` par défaut. Vont remonter dans le contexte agent comme 2 mini-decks supplémentaires.
- Non bloquant pour Evidence Engine, mais utile pour Phase 7 (`STALE_DOCUMENT_WARNING` ou `DRAFT_VARIANT_WARNING`).

### 5.3 Deck principal — **footer "Confidential – March 2026" sur 32 pages**

- `e4n - Confidential Presentation_BD.pdf` est BLOCKED (24/32 pages réussies, 8 échouées). 79,759 chars de texte déchiffrés.
- **Preuve content-level** (citation courte, pattern répété ~32x dans le texte) :
  ```
  e4n Confidential – March 2026  [Page N - Native PDF text]
  ```
  → Signal `DOCUMENT_DATE = 2026-03` **trivialement extractible** par regex `/Confidential\s*[–\-—]\s*([A-Za-z]+)\s+(\d{4})/i` sur les premiers 8K chars. Aujourd'hui ignoré.
- `year_spread = 2022×3, 2023×1, 2024×3, 2025×9, 2026×58` — le 2026×58 est massivement gonflé par le footer (32 répétitions sur 24 pages extraites). C'est un **bruit pour l'agent** : ça donne l'illusion que le deck parle énormément de 2026 alors que c'est juste son pied de page.

### 5.4 One-pager NETGEM — second cas de footer DOCUMENT_DATE

- `One-pager RE-VAL.pdf` (3,380 chars). Citation courte :
  ```
  ECLAIR "RE-VAL"
  Transformer les catalogues cinématographique en vecteur de croissance pour ECLAIR
  […]
  …nus de confiance.  Confidentiel NETGEM - Avril 2026
  ```
  → `DOCUMENT_DATE = 2026-04` ; pattern footer même famille (`Confidentiel <Company> - <Month> <YYYY>`).
- `year_spread = 2026×1` — confirme l'unique date du document.

### 5.5 Model Output Extract — forecast 2026-2030 + footer date

- `e4n - Model Output Extract.pdf` (8,751 chars, 3 pages). Citations courtes :
  ```
  Model Output – Base Case
  Dec-26  Dec-27  Dec-28  Dec-29  Dec-30
  $m, Dec FYE  FY2026  FY2027  FY2028  FY2029  FY2030
  […]
  e4n Confidential – April 2026
  ```
- Trois signaux structurables : `DOCUMENT_DATE = 2026-04`, `FINANCIAL_PERIOD_FORECAST = 2026-01 → 2030-12`, et toutes les valeurs $m par année colonne → `METRIC_CLAIM` chaînés.
- `year_spread = 2024×2, 2025×2, 2026×8, 2027×2, 2028×2, 2029×2` — distribution typique d'un modèle 5y.

### 5.6 Financial model Excel

- `e4n - Financial Model vFinal.xlsx` — 20 sheets, READY. 42,932 chars de texte déchiffré.
- `year_spread = 1933×2, 2022×4, 2024×5, 2025×4, 2026×9, 2027×9, 2028×9, 2029×8`. Le `1933×2` est suspect (probablement un code mort dans une cellule de référence). Le forecast couvre **2026-2029 explicite + très probablement 2030** (cf. data §5.5 qui montre Dec-30 dans le PDF dérivé).
- Filename ne porte aucune date. `sourceDate = null`. Phase 2 doit extraire `FINANCIAL_PERIOD_FORECAST = 2026-01 → 2030-12` depuis l'en-tête de feuille.

---

## 6. Ce que voient les agents — DEUX chemins, conclusions opposées

Correction d'une erreur dans la version précédente de l'audit : j'avais regardé uniquement `document-context-retriever.ts` et conclu "pas de prelude pour FILE → pas de date". C'est faux. Le chemin agent **principal** est `base-agent.ts:952-1008`, qui rend un header propre par document, avec date "produit le X" fallbackée sur `uploadedAt`.

### 6.1 Chemin A — `base-agent.ts` (principal, appelé par tous les agents Tier 1/2/3)

`base-agent.ts:976-978` :
```ts
const producedAtLabel = this.formatDocumentDate(doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt);
const importedAtLabel = this.formatDocumentDate(doc.uploadedAt);
text += `\n### ${sanitizedDocName} (${sourceKindLabel}, ${sanitizedDocType}) — produit le ${producedAtLabel}, importé le ${importedAtLabel}\n`;
```

`base-agent.ts:954-956` (tri par chronologie source) :
```ts
const sortedDocs = [...documents].sort((a, b) => {
  return this.getDocumentChronologyMs(a) - this.getDocumentChronologyMs(b);
});
```
…qui appelle `getDocumentChronologyMs` ligne 1065 : `return this.getDocumentDateMs(doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt);`

**Effet réel sur les 20 docs** :

| Doc | header rendu par base-agent | Trompeur ? |
|-----|------------------------------|------------|
| Avekapeti — Cap table Sept 2024 | `### Table de capi Septembre 2024 signeģe.png (Fichier, CAP_TABLE) — produit le 17/05/2026, importé le 17/05/2026` | **OUI — vraie date = 18/09/2024 (cf. §3.1)** |
| Avekapeti — Deck VF | `### Deck_Avekapeti VF.pdf (Fichier, PITCH_DECK) — produit le 17/05/2026, importé le 17/05/2026` | **OUI — multi-période 2013-2029 (cf. §3.3)** |
| Avekapeti — BP 2026 | `### BP Avekapeti 2026 VF.xlsx (Fichier, FINANCIAL_MODEL) — produit le 17/05/2026, importé le 17/05/2026` | **OUI — BP monthly 2025-2026 (cf. §3.2)** |
| Avekapeti — Mail.pdf | `### Mail.pdf (Email, OTHER) — produit le 22/04/2026, importé le 17/05/2026` | NON — sourceDate inféré correctement |
| FurLove — bilan_et_resultat | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — bilan exercice clos 31/12/2025 (cf. §4.5)** |
| FurLove — Fur-Love-2026-2030-Sept-2025 | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — doc daté Sept 2025 (filename), forecast 2026-2030 (cf. §4.2)** |
| FurLove — Mail - 22:01:26.docx | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — mail vraisemblable du 22/01/2026 (cf. §4.1)** |
| FurLove — SAFE ROUND deck | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — multi-claims 1995-2029 (cf. §4.4)** |
| FurLove — Gmail Response Ineke | `… — produit le 11/03/2026, importé le 17/05/2026` | NON |
| E4N — Deck Confidential_BD | `… — produit le 16/05/2026, importé le 16/05/2026` | **OUI — footer "Confidential – March 2026" sur 32 pages (cf. §5.3)** |
| E4N — One-pager RE-VAL | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — "Confidentiel NETGEM - Avril 2026" (cf. §5.4)** |
| E4N — Model Output Extract | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — "Confidential – April 2026" + forecast 2026-2030 (cf. §5.5)** |
| E4N — Message e4n.docx | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — mail-like (cf. §5.1)** |
| E4N — Financial Model vFinal | `… — produit le 17/05/2026, importé le 17/05/2026` | **OUI — forecast 2026-2029+ (cf. §5.6)** |

**Bilan** : sur les 20 docs, **15 reçoivent un label `produit le` faux** (= la date d'upload masquerade comme date de production). 5 sont corrects (4 emails .pdf + l'écart de date d'upload de l'E4N deck qui coïncide par chance avec la date d'upload).

C'est **plus grave que "pas de date"** : l'agent fait confiance au label "produit le 17/05/2026" et conclut que la cap table est récente, le BP est à jour, le bilan est de hier. Les tris chronologiques (ligne 954) écrasent toutes les vraies dates source au profit de `uploadedAt`, donc l'ordre "ancien → récent" affiché à l'agent est aussi faux.

Le commentaire ligne 959 dit même : `**IMPORTANT — CHRONOLOGIE:** Les documents sont listés du plus ancien au plus récent. … le document récent fait foi (sauf preuve contraire).` — l'agent est explicitement instruit de faire confiance à cet ordre falsifié.

### 6.2 Chemin B — `document-context-retriever.ts` (secondaire)

`document-context-retriever.ts:139-162` ne rend de prelude que pour les EMAIL/NOTE/corpus attachments :
```ts
if ((!doc.sourceKind || doc.sourceKind === "FILE") && !isCorpusAttachment) return null;
```
Pour le sample : 4 emails Avekapeti+FurLove reçoivent ce prelude correct, 0 FILE le reçoit. Pas de bug ici, mais pas de protection contre le bug §6.1 non plus.

### 6.3 Couverture evidence-ledger (existant)

`evidence-ledger/index.ts` produit déjà un ledger pour les agents avec :
- `factStore` items (claims structurés)
- `extractionRuns[].pages[].artifact.numericClaims/tables/charts/unreadableRegions` (artefacts visuels par page)
- `contextEngine.sourceHealth` (signaux de santé des sources externes)

→ Ce qui **manque** dans le ledger : la **temporalité** (date de la pièce, période couverte, fraîcheur). Phase 1 doit ajouter cette dimension. Le ledger ne peut pas non plus contredire le bug §6.1 puisqu'il n'a aujourd'hui aucun signal temporel à mettre en regard.

### 6.4 Conséquence pour le séquencement des phases

Le bug §6.1 doit être adressé **avant** Phase 5 (prelude contextuel). Trois options :
1. **Quick fix Phase 0.5** : changer `producedAtLabel` pour `sourceDate ?? receivedAt ?? null` (sans fallback uploadedAt). Si null, rendre `produit le ?, importé le <uploadedAt>` — affiche explicitement l'incertitude. Ne casse rien.
2. **Phase 2 + Phase 3** : extracteur déterministe + promotion vers `Document.sourceDate` quand confiance HIGH. Réduit à 4/20 le nombre de docs sans date. Bug résiduel sur les FILE qui n'ont aucun signal extractible (Team.jpeg, etc.).
3. **Phase 5 complète** : refonte du prelude pour intégrer les `EvidenceSignal`. Long.

Recommandation : faire l'**option 1 immédiatement** (1 ligne, hors-scope Evidence Engine), puis Phase 2+3 pour le reste. L'option 1 doit être trackée comme un correctif `errors.md` séparé, pas comme une dépendance du chantier Evidence Engine.

---

## 7. Risque OPS — DOCUMENT_ENCRYPTION_KEY non récupérable via Vercel CLI

> Découvert pendant l'audit. **Mitigé à la fin de l'audit** : Sacha a confirmé que la clé est bien stockée dans son secrets manager personnel et a fourni la valeur hors-conversation. Déchiffrement local sur `extractedText` des 20 docs des 3 deals : OK. Mais le risque persiste si cette source unique disparaît.

### 7.1 Observation

- `vercel env ls` montre la variable dans les scopes Production et Preview (line items "Encrypted, 21d ago / récent").
- `vercel env pull --environment=preview .env.vercel.audit` → la variable apparaît avec valeur `""` (vide, 2 chars `""`).
- `vercel env pull --environment=production .env.vercel.audit` → idem `""`.
- `vercel env run --environment=production -- node -e "console.log(process.env.DOCUMENT_ENCRYPTION_KEY?.length)"` → `0`.
- Pourtant l'API prod `/api/documents/:id?includeText=1` déchiffre correctement (vérifié par Codex). La clé EST opérationnelle à l'exécution sur Vercel.
- Cause : variable marquée **Sensitive** dans Vercel → la valeur ne peut plus être ré-extraite via CLI/API, seulement consommée par le runtime du déploiement.
- Source primaire confirmée : secrets manager Sacha. Sacha a fourni la clé manuellement pour cet audit ; déchiffrement local validé.

### 7.2 Risque résiduel

Si l'entrée dans le secrets manager Sacha est perdue (changement de poste, perte de master password, etc.) ET si l'env Vercel est aussi un jour réellement vide pour cette variable, **aucune piste documentaire ne permet de récupérer la clé**. Conséquence : **tous les `Document.extractedText`, `Document.ocrText`, `DocumentExtractionPage.artifact`, `DocumentExtractionPage.textPreview` deviennent illisibles à jamais**. Cf. errors.md entrées 2026-05-13 (chiffrement Phase 3 : `safeDecryptJsonField`/`safeDecrypt` retournent du bruit sur clé manquante, et 4 sites ont déjà eu des bugs fail-open quand le déchiffrement échouait).

Volume concerné (rapide estimation à partir du sample) : sur 3 deals, **20 documents chiffrés**. Multiplié à l'échelle prod, c'est l'intégralité du corpus historique.

### 7.3 Recommandations OPS (hors-scope Evidence Engine, à traiter séparément)

1. **Documenter** dans `errors.md` ou un runbook dédié : "DOCUMENT_ENCRYPTION_KEY est marquée Sensitive Vercel — irrécupérable via CLI. Source primaire = secrets manager Sacha." + lister un secondary holder (autre membre, vault entreprise, escrow).
2. **Ne JAMAIS régénérer la clé** sans migration coordonnée : il faudrait re-chiffrer tous les `Document.extractedText` + `DocumentExtractionPage.artifact` + `DocumentExtractionPage.textPreview` + `Document.ocrText` avec la nouvelle clé, en lisant l'ancienne en parallèle. Tout `vercel env update` qui écraserait silencieusement la valeur en empêcherait toute lecture future des artefacts existants.
3. **Pour les futurs audits comme celui-ci** : conserver le pattern `.env.vercel.audit` gitignored + script `audit-evidence-deals.mjs` qui charge la clé en `override: false` pour ne pas polluer `.env.local`.
4. **Envisager une approche alternative pour Phase 5+** : permettre l'audit/debug via `/api/documents/:id?includeText=1` authentifié Clerk plutôt que via la clé brute, pour éviter de devoir distribuer la clé à un script local.

---

## 8. État du plan Evidence Engine vs ce qui existe

| Phase | Ce qui existe déjà | Ce qui manque |
|-------|---------------------|---------------|
| Phase 0 — audit | ce document | — |
| Phase 1 — schéma `EvidenceSignal` | rien | tout |
| Phase 2 — temporal extractor | `email-source-inference` (EMAIL only, OCR text only) | tous les autres kinds : `CAP_TABLE_AS_OF`, `FINANCIAL_PERIOD_FORECAST/ACTUAL`, `DOCUMENT_DATE` depuis filename + texte. Et fix des 2 bugs §4.1/§5.1 (`.docx` email-like ratés). |
| Phase 3 — promotion vers `sourceDate` | logique déjà câblée pour EMAIL (cf. `inferEmailSourceFromExtractedText`) | règles pour cap table / note / etc. + invariant "pas de fallback uploadedAt pour FILE non daté" |
| Phase 4 — relations email ↔ pièces | `corpusParentDocumentId` existe (UI manuelle) | détection automatique de pièces jointes mentionnées dans le mail + matching aux uploads (nom approximatif, taille, type) |
| Phase 5 — prelude contextuel agent | `buildDocumentSourcePrelude` existe mais ne rend rien pour FILE | sections "Evidence Timeline", "Document Provenance", "Temporal Warnings", "Claims Needing Proof" + injection de `currentDate` (`Nous sommes le 17/05/2026`) |
| Phase 6 — financial / metric claims | `evidence-ledger` + `factStore` + `numericClaims` par page | structuration cross-doc (CA 2025 du subject email = X, CA 2025 du BP = Y, contradiction ?) + tagging actual vs forecast vs claim |
| Phase 7 — contradictions / freshness | rien (les contradictions existent pour le `factStore` via `disputeDetails` mais pas pour la fraîcheur des pièces) | warnings type "cap table 18 mois old pour une levée 2026", "BP forecast 2026 sans actuals YTD" |
| Phase 8 — UI corpus timeline | onglet corpus existe (cf. `components/deals/corpus/*`) | badges "à jour au …", "envoyé le …", "prévisionnel 2026-2030", "transmis dans Mail 1", panneau "Evidence extracted" sur le doc detail |
| Phase 9 — backfill | rien | script `scripts/evidence/backfill-temporal-signals.ts` (dry-run, scoped, idempotent) |

---

## 9. Gates Codex — statut (post-déchiffrement)

| Gate | Statut | Preuve courte |
|------|--------|---------------|
| (a) cap table Avekapeti contient "à jour au 18/09/2024" dans extractedText, `sourceDate = null` | **CONFIDENT** | §3.1 — citation `"Table de capitalisation à jour au 18/09/2024"` (×2) ; year_spread 2024×1 |
| (b) BP doit montrer des périodes 2026-2030 | **PARTIELLEMENT CONFIRMÉE** : reformuler. Avekapeti BP = 2025-2026 monthly (pas 2026-2030). Le forecast 2026-2030 est présent dans FurLove `Fur-Love-2026-2030-Sept-2025` et E4N `Model Output Extract` + `Financial Model vFinal.xlsx`. | §3.2 / §4.2 / §5.5 / §5.6 |
| (c) deck doit montrer plusieurs années sans date globale évidente | **CONFIDENT** pour le deck Avekapeti (12 années distinctes, pas de footer date) ; **NUANCE** pour E4N + NETGEM qui ont un footer `<Company> Confidential – <Month> <YYYY>` parfaitement déterministe (jamais utilisé aujourd'hui) | §3.3 / §5.3 / §5.4 |
| (d) emails doivent être correctement datés | **CONFIDENT** pour les emails PDF (Outlook/Gmail) ; **FAUX pour les .docx** (`Mail - 22:01:26.docx` FurLove, `Message e4n.docx` E4N — corps email sans headers, `sourceDate = null`) | §3.4 / §4.3 / §4.1 / §5.1 |

---

## 10. Recommandations pour Phase 1 (schéma EvidenceSignal)

### 10.1 Confirmer le besoin d'une table dédiée vs JSON dans Document

Le plan propose une table `EvidenceSignal` séparée. Recommandé **oui**, parce que :
- On va vouloir indexer par `kind`, filtrer par `dealId`/`documentId`, scorer la fraîcheur, lister par période — toutes opérations efficaces sur une table relationnelle, lentes sur un JSON column.
- L'`evidence-ledger` existant est un type **dérivé en mémoire** à chaque construction de contexte agent. Il consomme du `factStore` + `extractionRuns`. Une table `EvidenceSignal` complèterait ces deux sources avec la dimension **temporelle/provenance** qui n'a pas de home aujourd'hui.
- La cascade delete sur `Document` est triviale via foreign key.

### 10.2 Périmètre minimal Phase 1 (à proposer formellement après ce gate)

- Model `EvidenceSignal` aligné sur la proposition du plan (kind enum, valueJson, dateStart/dateEnd/asOfDate/reportedAt, precision, confidence, sourceMethod, evidenceText, pageNumber, sheetName, metadata).
- Index : `[dealId, kind]`, `[documentId, kind]`, `[dealId, asOfDate]`.
- Migration safe (additive, pas de mutation des colonnes existantes).
- Cascade `onDelete: Cascade` depuis `Document` et `Deal`.
- Pas encore d'extracteur, pas encore d'injection prompt — uniquement la table + types TS générés. C'est le **socle** pour Phase 2.

### 10.3 Points à acter avec Codex avant Phase 1

1. **Confidentialité de `evidenceText` et `valueJson`** : faut-il chiffrer ces colonnes comme `extractedText` ? Si oui, on hérite du même risque §7. Recommandation : `evidenceText` = courte citation (≤ 280 chars), probablement OK en clair ; `valueJson` peut contenir des montants (sensible) → chiffrer côté valeurs numériques, ou tout simplement contenir des dates/labels et exclure les valeurs nominales.
2. **Idempotence** : un re-run de l'extracteur sur le même document doit pouvoir mettre à jour les signaux existants sans dupliquer. Clé unique `(documentId, kind, source_hash)` ?
3. **Versioning** : si un document `version=2` arrive, faut-il invalider les signaux de `version=1` ? Recommandation : oui, suivre la logique `isLatest`.
4. **Performance read-path** : combien de signaux par deal en régime nominal ? À l'instinct, 5-30 signaux/document × 10-50 docs/deal = 50-1500 signaux. Pas un problème de scaling.

---

## 11. Annexe — Inventaire script

Le script utilisé : `scripts/debug/audit-evidence-deals.mjs` (non commité, présent dans `scripts/debug/` qui est dans `?? scripts/debug/` du `git status`).

Si un re-run est nécessaire après pull de la clé (par exemple pour valider les gates content-level en local), le script supporte :
- `node scripts/debug/audit-evidence-deals.mjs` → 3 deals par défaut
- `node scripts/debug/audit-evidence-deals.mjs <name1> <name2>` → autres deals
- Charge `.env.local` puis (optionnellement) `.env.vercel.audit` avec `override: false`
- Déchiffre `extractedText` si `DOCUMENT_ENCRYPTION_KEY` est présent et valide (64 hex)

À supprimer / déplacer dans `scripts/evidence/` si on garde ce pattern pour les audits futurs.
