# TODO — Backlog Angel Desk

Backlog des chantiers décidés mais reportés « au moment opportun ». Format par item : **Quoi · Pourquoi · Détail/pointeur · Prérequis/bloqueur · Statut**. Cocher quand fait, déplacer en bas dans « Fait ».

---

## À faire

### [ ] 1. Implémenter le système de pricing (Stratégie B + crédits/top-up)
- **Quoi** : câbler tout le système de tarification décidé — abonnements (Starter €59 / Pro €199 / Team €399 / Scale €799), crédits inclus + overage, top-up packs, Deal Pass non-abonné, auto-refill, suppression du free tier hebdo.
- **Pourquoi** : le pricing actuel sous-monétise (deep dive 5 cr = €12,50–24,50) et le free tier (2 deep dives gratuits/sem sans CB) fuit la marge ; coût réel mesuré ~$2,55/deep dive → grosse marge de capture de valeur.
- **Détail / pointeur** : design **100 % arrêté** dans `docs-private/pricing/RAPPORT-PRICING-ANGELDESK.{md,html}` — voir l'**Addendum** (design top-up) + la **roadmap gated P0→P9**.
- **Prérequis / bloqueur** : **compte Stripe** ouvert (clés + Products/Prices) = phase P0, à la charge de Sacha. Chaque phase suivante = **gate Codex** (touche paiement / auth / migration / prod).
- **Note technique** : schéma actuel à un seul `balance` → il faudra typer `CreditTransaction.source` (monthly_included/top_up/promo/refund) + expiration par bucket (P1).
- **Statut** : ⏸️ Reporté — en attente du GO de Sacha + compte Stripe. Design figé, prêt à dérouler.

### [ ] 2. Emails Resend avec le nom de domaine adapté
- **Quoi** : configurer Resend pour l'envoi des emails transactionnels depuis le **bon domaine d'envoi** (DNS SPF/DKIM/DMARC vérifiés), et poser `RESEND_API_KEY` en prod.
- **Pourquoi** : délivrabilité des emails (vérif, notifications) — volet ouvert C3. Aujourd'hui non finalisé.
- **Détail / pointeur** : domaine d'envoi cible historiquement `angeldesk.app` — **à confirmer** car le rebrand off « AngelDesk » est en pause (cf. décision de nom de domaine non tranchée). Le domaine d'envoi suivra le nom retenu.
- **Prérequis / bloqueur** : **décision du nom de domaine** (liée au rebrand) + accès DNS du domaine + `RESEND_API_KEY` prod.
- **Statut** : ⏸️ Reporté — au moment opportun, après arbitrage du nom de domaine.

---

## Fait
<!-- déplacer ici les items terminés avec la date -->
