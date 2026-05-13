# Agentic Mistakes — Angel Desk

> Registre des erreurs de raisonnement commises par les agents IA (Claude, Codex, autres) sur ce projet : diagnostic faux, propositions infaisables, hypothèses non vérifiées, communication imprécise.
> **Règle (CLAUDE.md global)** : Au début de chaque session, lire l'**index** ci-dessous. Lire les entrées complètes uniquement quand pertinentes à la tâche en cours. Après chaque erreur corrigée, append une nouvelle entrée.

## Index (lecture rapide)

| Date | Catégorie | Titre |
|---|---|---|
| 2026-05-13 | DIAGNOSTIC | Conclusion sur prefix de données réseau, ignorant la transition d'état |
| 2026-05-13 | PROPOSITION SANS DOC | Recommandation de modifier un réglage Clerk qui n'existe pas |
| 2026-05-13 | DIAGNOSTIC | Abandon d'une hypothèse pourtant correcte (deux bugs concurrents non distingués) |

---

## Format d'entrée

```
### [DATE] — [CATÉGORIE] — [Titre court]
- **Contexte** : ce que je faisais / ce qu'on investiguait
- **Erreur** : ce que j'ai dit/fait de faux
- **Cause racine du raisonnement** : pourquoi ce raisonnement était défectueux (biais, hypothèse non vérifiée, donnée partielle, etc.)
- **Comment corrigé** : qui/quoi a remis sur la bonne piste
- **Impact (uniquement si connu)** : coût concret (tours gaspillés, action quasi-engagée, erreur quasi-commit)
- **Lesson** : règle à appliquer dans le futur pour ne pas répéter
```

## Catégories

- **DIAGNOSTIC** : mauvaise conclusion sur la cause d'un bug
- **PROPOSITION SANS DOC** : recommandation d'une étape non vérifiée dans la doc du provider
- **HYPOTHÈSE** : raisonnement basé sur une supposition non testée
- **COMMUNICATION** : phrasing imprécis, omission importante, présentation prescriptive contraire à la doctrine projet
- **EXÉCUTION** : tool/commande mal utilisée (mauvais flag, mauvais path, mauvais ordre)
- **RECHERCHE** : recherche insuffisante avant d'agir (codebase ou web)

---

## Entrées

### 2026-05-13 — DIAGNOSTIC — Conclusion sur prefix de données réseau, ignorant la transition d'état
- **Contexte** : debug live d'un upload Arclight qui semblait figé à 35% sur la preview Vercel. J'ai utilisé Chrome DevTools MCP pour sniffer le réseau.
- **Erreur** : j'ai listé ~24 polls (tous 200 OK avec `data: null`) et conclu "le bug = `UPSTASH_REDIS_*` manquant → chaque invocation serverless Vercel a son propre `InMemoryStore` → les writes du POST upload ne traversent pas vers les GET polling". J'ai même commencé à proposer de migrer le storage du progress vers Postgres.
- **Cause racine du raisonnement** : tirer une conclusion d'un **préfixe** de série temporelle (`pageSize` du `list_network_requests` plafonné implicitement à ~100 entries), sans s'être assuré que le **steady-state** ou la **transition d'état** soient visibles dans les données. J'ai ignoré que le user m'avait déjà décrit le pattern "200 puis 404 après ~1 min" plus tôt dans la conversation.
- **Comment corrigé** : l'utilisateur m'a poussé back : *"je pense que tu te trompes, je vois des 404 moi"*. J'ai re-listé avec `pageSize=200` et les 404 sont apparus immédiatement à `reqid=112`, avec headers Clerk explicites (`x-clerk-auth-message: JWT is expired`) confirmant le vrai diag.
- **Impact** : ~1 tour gaspillé sur une mauvaise piste. Risque d'avoir commit un refactor inutile (progress vers Postgres) si non corrigé. Le diag Clerk avait déjà été correctement identifié plus tôt dans la session — je m'en suis détourné à cause d'un dump partiel.
- **Lesson** : pour tout bug **time-dependent** (auth expiry, cache eviction, refresh background, race conditions, cold-start vs warm-start), **observer le steady-state OU la transition** AVANT de conclure. Si le user rapporte un symptôme que je ne vois pas encore dans les données, default = *"j'attends / je cherche plus / j'élargis le pageSize"* plutôt que *"je trouve une explication alternative"*. Une hypothèse confirmée plus tôt ne doit pas être abandonnée juste parce que le dump suivant ne montre pas encore le failure.

### 2026-05-13 — PROPOSITION SANS DOC — Recommandation de modifier un réglage Clerk qui n'existe pas
- **Contexte** : après confirmation que le JWT Clerk (TTL 60s) était la cause des 404 sur la preview Vercel, je voulais proposer un quick-win pendant qu'on bumpait le SDK.
- **Erreur** : j'ai recommandé *"va dans Clerk Dashboard → Sessions → 'Session token lifetime' et passe de 60s à 5min"*. L'utilisateur a navigué le dashboard et m'a remonté deux screenshots successifs montrant qu'il n'y a **pas** de tel réglage. La page Sessions n'expose que "Session lifetime" (cookie 7 jours, Pro-only) et "Customize session token" (custom claims, pas TTL). **Le JWT TTL est hardcodé à 60s par design Clerk**, non configurable, tous plans confondus.
- **Cause racine du raisonnement** : j'ai supposé l'existence du réglage en m'appuyant sur ma connaissance générique des produits SaaS d'auth (Auth0, AWS Cognito et autres exposent ce knob). Je n'ai PAS lu/vérifié la doc Clerk avant de recommander une action concrète à l'utilisateur.
- **Comment corrigé** : l'utilisateur a fait l'aller-retour dans le dashboard et m'a confronté à l'absence du toggle via screenshots. J'ai ensuite reconnu la limitation produit et annulé la piste.
- **Impact** : ~2 tours gaspillés à guider l'utilisateur dans des screens inutiles. Érode la confiance — l'utilisateur m'a explicitement reproché de proposer "des choses infaisables" et a demandé l'ajout d'une règle globale pour ne plus jamais le refaire (cette règle existe maintenant dans `~/.claude/CLAUDE.md`).
- **Lesson** : **NE JAMAIS proposer de solution technique impliquant un provider** (Clerk, Vercel, Stripe, OpenAI, etc.) sans avoir d'abord vérifié dans la doc/dashboard que l'option recommandée existe et est accessible au plan de l'utilisateur. Si l'accès à la doc n'est pas immédiat, dire explicitement *"je ne sais pas si c'est exposé, peux-tu vérifier le dashboard X ?"* plutôt qu'affirmer. La connaissance générique d'une catégorie de produit n'est PAS une garantie de l'existence d'une feature spécifique chez un provider donné.

### 2026-05-13 — DIAGNOSTIC — Abandon d'une hypothèse pourtant correcte (deux bugs concurrents non distingués)
- **Contexte** : suite de la session du 2026-05-13 sur l'upload Arclight, après que l'utilisateur ait pointé les 404 que j'avais ratés (cf. entrée précédente).
- **Erreur** : une fois le diag Clerk JWT confirmé, j'ai **abandonné entièrement l'hypothèse Redis/InMemoryStore** que j'avais formulée plus tôt, en écrivant explicitement *"mon hypothèse Redis : à côté du sujet réel"* dans mes annonces et mon entrée `agentic-mistakes.md`. Mauvaise interprétation : j'ai supposé que mon hypothèse initiale était une *alternative* à la vraie cause, alors qu'en réalité **les deux bugs coexistaient** :
  1. Bug Clerk JWT → 404 sur les polls après ~60 s
  2. Bug Redis manquant → `data:null` sur les polls 200 (avant que les 404 ne commencent)
- **Cause racine du raisonnement** : framing binaire "ma théorie était fausse vs juste". Quand l'utilisateur a montré que le diag Clerk était le vrai sujet des 404, j'ai conclu que le diag Redis était nul et non avenu, sans vérifier si les *autres* symptômes (notamment `data:null` sur les 200) restaient inexpliqués.
- **Comment corrigé** : après le push du bump SDK 6.39.3, on a relancé un upload en live ; on a observé que les 404 revenaient ET que tous les polls 200 retournaient `{data:null}`. Cette persistence du `data:null` malgré l'absence de 404 a forcé la prise en compte du bug Redis comme bug indépendant.
- **Impact** : ~1 commit/déploiement supplémentaire (le bump SDK seul, qui n'a même pas suffi pour son bug ciblé). Mémoires et `agentic-mistakes.md` initialement rédigés avec une formulation "j'ai eu tort sur Redis" qu'il faudra nuancer en post-mortem ("j'ai eu tort de croire que Redis était la cause des 404 ; j'ai eu raison sur l'existence du bug Redis").
- **Lesson** : **un bug confirmé n'invalide pas les autres hypothèses encore non testées**. Pour chaque hypothèse écartée, vérifier qu'elle explique l'absence de symptômes *résiduels*. Si un symptôme reste inexpliqué après le diag retenu (ici : `data:null` après les 404), c'est qu'il y a (au moins) un deuxième bug. Annoncer *"hypothèse X était une alternative qui s'est révélée fausse"* est trop fort si X n'a jamais été falsifié, juste mis de côté.
