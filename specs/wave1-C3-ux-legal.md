# Wave 1 - Agent C3 : UX & Legal
## Spec de correction detaillee - 8 failles CRITICAL

**Date** : 2026-02-11
**Agent** : C3 - UX & Legal
**Scope** : F13, F14, F15, F16, F17, F18, F21, F22
**Statut** : Spec prete pour implementation

---

## Table des matieres

1. [F13 - Zero disclaimer juridique / CGU / limitation de responsabilite](#f13)
2. [F14 - Non-conformite RGPD (scraping LinkedIn)](#f14)
3. [F15 - Modeles fantomes sur la page pricing](#f15)
4. [F16 - Absence de glossaire / tooltips sur le jargon technique](#f16)
5. [F17 - Score affiche sans echelle de reference ni contexte](#f17)
6. [F18 - Projections affichees comme certitudes](#f18)
7. [F21 - Moat technique faible (strategique)](#f21)
8. [F22 - Red flags disperses sans vue consolidee](#f22)

---

<a name="f13"></a>
## F13 - Zero disclaimer juridique / CGU / limitation de responsabilite

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/layout.tsx`
**Lignes** : 1-17 (fichier complet)

Code problematique - aucun disclaimer, aucun footer legal :

```tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
      <MobileNav />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`
**Lignes** : 92-97 (RECOMMENDATION_CONFIG)

Code problematique - le bouton "Investir" est affiche sans disclaimer :

```tsx
const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string }> = {
  invest: { label: "Investir", color: "bg-green-500 text-white" },
  pass: { label: "Passer", color: "bg-red-500 text-white" },
  wait: { label: "Attendre", color: "bg-yellow-500 text-white" },
  negotiate: { label: "Negocier", color: "bg-blue-500 text-white" },
};
```

**Fichiers absents** :
- `src/app/(dashboard)/legal/cgu/page.tsx` (inexistant)
- `src/app/(dashboard)/legal/mentions-legales/page.tsx` (inexistant)
- `src/app/(dashboard)/legal/confidentialite/page.tsx` (inexistant)

### Correction

#### 1. Composant DisclaimerBanner permanent

**Creer** : `src/components/shared/disclaimer-banner.tsx`

```tsx
"use client";

import { memo, useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

/**
 * Disclaimer legal permanent affiche en bas du dashboard.
 * OBLIGATOIRE - ne peut pas etre ferme definitivement (revient a chaque session).
 */
export const DisclaimerBanner = memo(function DisclaimerBanner() {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  if (isDismissed) {
    return (
      <div className="border-t bg-muted/50 px-4 py-1.5 text-center">
        <button
          onClick={() => setIsDismissed(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Avertissement legal
        </button>
      </div>
    );
  }

  return (
    <div className="border-t bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Avertissement</strong> : Angel Desk fournit des analyses automatisees a titre informatif uniquement.
            Ces analyses <strong>ne constituent pas un conseil en investissement</strong>.
            Tout investissement dans des startups comporte un <strong>risque de perte totale du capital investi</strong>.
            Consultez un conseiller financier agree avant toute decision d&apos;investissement.
          </p>
          <div className="flex gap-3 mt-1.5">
            <Link href="/legal/cgu" className="text-xs text-amber-700 underline hover:text-amber-900">
              CGU
            </Link>
            <Link href="/legal/mentions-legales" className="text-xs text-amber-700 underline hover:text-amber-900">
              Mentions legales
            </Link>
            <Link href="/legal/confidentialite" className="text-xs text-amber-700 underline hover:text-amber-900">
              Politique de confidentialite
            </Link>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 hover:bg-amber-100 rounded transition-colors"
          aria-label="Reduire l'avertissement"
        >
          <X className="h-3.5 w-3.5 text-amber-600" />
        </button>
      </div>
    </div>
  );
});

DisclaimerBanner.displayName = "DisclaimerBanner";
```

#### 2. Modifier le layout dashboard

**Modifier** : `src/app/(dashboard)/layout.tsx`

```tsx
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
      <MobileNav />
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
        </main>
        <DisclaimerBanner />
      </div>
    </div>
  );
}
```

#### 3. Creer les pages legales

**Creer** : `src/app/(dashboard)/legal/cgu/page.tsx`

```tsx
export default function CGUPage() {
  return (
    <div className="prose prose-sm max-w-3xl mx-auto py-8">
      <h1>Conditions Generales d&apos;Utilisation</h1>
      <p className="text-muted-foreground">Derniere mise a jour : [DATE]</p>

      <h2>1. Objet</h2>
      <p>
        Angel Desk est une plateforme d&apos;aide a la decision pour Business Angels.
        Elle fournit des analyses automatisees de startups a titre <strong>purement informatif</strong>.
      </p>

      <h2>2. Nature du service</h2>
      <p>
        Les analyses, scores, recommandations et projections generes par Angel Desk :
      </p>
      <ul>
        <li><strong>Ne constituent PAS un conseil en investissement</strong> au sens de la reglementation financiere (MIF2, AMF)</li>
        <li>Ne remplacent pas l&apos;avis d&apos;un conseiller financier agree</li>
        <li>Sont generes par des modeles d&apos;intelligence artificielle et peuvent contenir des erreurs</li>
        <li>Sont bases sur des donnees publiques et les documents fournis par l&apos;utilisateur</li>
      </ul>

      <h2>3. Limitation de responsabilite</h2>
      <p>
        Angel Desk SAS decline toute responsabilite en cas de :
      </p>
      <ul>
        <li>Perte financiere liee a une decision d&apos;investissement</li>
        <li>Inexactitude des analyses ou scores generes</li>
        <li>Donnees obsoletes ou incompletes utilisees par les agents d&apos;analyse</li>
        <li>Indisponibilite temporaire du service</li>
      </ul>
      <p>
        <strong>L&apos;utilisateur reconnait que tout investissement dans des startups comporte
        un risque de perte totale du capital investi.</strong>
      </p>

      <h2>4. Donnees personnelles</h2>
      <p>
        Voir notre <a href="/legal/confidentialite">Politique de confidentialite</a> pour le detail
        du traitement des donnees personnelles.
      </p>

      <h2>5. Propriete intellectuelle</h2>
      <p>
        Les analyses generees sont la propriete de l&apos;utilisateur. Les modeles, prompts et algorithmes
        d&apos;Angel Desk restent la propriete exclusive d&apos;Angel Desk SAS.
      </p>

      {/* TODO: Completer avec les sections standard : resiliation, droit applicable, litiges */}
    </div>
  );
}
```

**Creer** : `src/app/(dashboard)/legal/mentions-legales/page.tsx`

```tsx
export default function MentionsLegalesPage() {
  return (
    <div className="prose prose-sm max-w-3xl mx-auto py-8">
      <h1>Mentions Legales</h1>

      <h2>Editeur</h2>
      <p>
        Angel Desk SAS<br />
        {/* TODO: Completer avec adresse, SIRET, capital social */}
        [Adresse]<br />
        SIRET : [NUMERO]<br />
        RCS : [VILLE]
      </p>

      <h2>Directeur de la publication</h2>
      <p>[Nom du dirigeant]</p>

      <h2>Hebergement</h2>
      <p>
        Vercel Inc.<br />
        340 S Lemon Ave #4133<br />
        Walnut, CA 91789, USA
      </p>

      <h2>Avertissement reglementaire</h2>
      <p>
        Angel Desk <strong>n&apos;est pas un conseiller en investissement financier (CIF)</strong> au sens
        de l&apos;article L.541-1 du Code monetaire et financier. Les analyses fournies le sont
        a titre informatif et ne constituent en aucun cas un conseil en investissement.
      </p>
      <p>
        Angel Desk n&apos;est pas enregistre aupres de l&apos;AMF (Autorite des Marches Financiers)
        et n&apos;a pas vocation a l&apos;etre, ses analyses etant generees par intelligence artificielle
        a titre d&apos;aide a la decision.
      </p>

      {/* TODO: DPO, contact, mediateur */}
    </div>
  );
}
```

#### 4. Ajouter un disclaimer inline sur la recommandation

**Modifier** : `src/components/deals/tier3-results.tsx` - RecommendationBadge (ligne 106-115)

Ajouter un texte sous chaque affichage de RecommendationBadge. La modification se fait dans `SynthesisScorerCard` (ligne 153-159).

Remplacer :

```tsx
{/* Recommendation */}
<div className="flex items-center justify-between p-4 rounded-lg bg-muted">
  <div>
    <p className="text-sm text-muted-foreground">Recommandation</p>
    <p className="text-lg font-medium mt-1">{data.investmentRecommendation.rationale}</p>
  </div>
  <RecommendationBadge action={data.investmentRecommendation.action} />
</div>
```

Par :

```tsx
{/* Recommendation */}
<div className="flex items-center justify-between p-4 rounded-lg bg-muted">
  <div>
    <p className="text-sm text-muted-foreground">Recommandation</p>
    <p className="text-lg font-medium mt-1">{data.investmentRecommendation.rationale}</p>
    <p className="text-xs text-muted-foreground mt-2 italic">
      Analyse automatisee a titre informatif uniquement. Ne constitue pas un conseil en investissement.
    </p>
  </div>
  <RecommendationBadge action={data.investmentRecommendation.action} />
</div>
```

### Dependances

- F14 (la page confidentialite est creee ici et completee en F14)
- F18 (disclaimer general renforce les warnings specifiques de F18)

### Verification

1. Ouvrir n'importe quelle page du dashboard : le banner disclaimer est visible en bas
2. Cliquer "Reduire" : le banner se minimise mais reste present avec un bouton pour le re-ouvrir
3. Les liens CGU / Mentions legales / Confidentialite menent aux bonnes pages
4. Sur la page tier3-results, sous la recommandation "Investir", le disclaimer inline est visible

---

<a name="f14"></a>
## F14 - Non-conformite RGPD (scraping LinkedIn)

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/rapidapi-linkedin.ts`
**Lignes** : 770-833 (fonction `fetchLinkedInProfile`)

Code problematique - scraping direct sans consentement :

```tsx
async function fetchLinkedInProfile(linkedinUrl: string): Promise<NormalizedProfile | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[RapidAPI LinkedIn] No API key configured (RAPIDAPI_LINKEDIN_KEY)");
    return null;
  }
  // ... fetch directement sans verification de consentement
  const response = await fetch(
    `https://${RAPIDAPI_HOST}/enrich-lead?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": apiKey,
      },
      signal: AbortSignal.timeout(60000),
    }
  );
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/team-investigator.ts`
**Lignes** : 824-935 (methode `getFoundersData`)

Les donnees LinkedIn enrichies sont injectees dans le prompt LLM sans mention de consentement :

```tsx
private getFoundersData(context: EnrichedAgentContext): string | null {
  // ...
  if (f.verifiedInfo?.linkedinScrapedAt) {
    return {
      ...base,
      linkedinEnriched: true,
      linkedinScrapedAt: f.verifiedInfo.linkedinScrapedAt,
      // Full work history
      experiences: f.verifiedInfo.experiences,
      // ...
    };
  }
```

**Fichiers absents** :
- Aucune page de politique de confidentialite
- Aucun mecanisme de consentement pour le scraping LinkedIn
- Aucun endpoint de droit a l'effacement (Article 17 RGPD)

### Correction

#### 1. Page Politique de Confidentialite

**Creer** : `src/app/(dashboard)/legal/confidentialite/page.tsx`

```tsx
export default function PolitiqueConfidentialitePage() {
  return (
    <div className="prose prose-sm max-w-3xl mx-auto py-8">
      <h1>Politique de Confidentialite</h1>
      <p className="text-muted-foreground">Derniere mise a jour : [DATE]</p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Angel Desk SAS<br />
        {/* TODO: adresse, email DPO */}
        Contact DPO : dpo@angeldesk.io
      </p>

      <h2>2. Donnees collectees</h2>

      <h3>2.1 Donnees de compte</h3>
      <p>Via Clerk (authentification) : email, nom, photo de profil.</p>

      <h3>2.2 Documents uploades</h3>
      <p>
        Pitch decks et documents fournis par l&apos;utilisateur pour analyse.
        Ces documents sont traites par nos agents IA et ne sont pas partages avec des tiers.
      </p>

      <h3>2.3 Donnees de profils LinkedIn (fondateurs analyses)</h3>
      <p>
        Lorsque l&apos;utilisateur fournit un lien LinkedIn d&apos;un fondateur et <strong>demande explicitement
        l&apos;enrichissement du profil</strong>, nous utilisons le service RapidAPI Fresh LinkedIn
        pour recuperer les informations <strong>publiquement accessibles</strong> sur LinkedIn :
      </p>
      <ul>
        <li>Experiences professionnelles</li>
        <li>Formation</li>
        <li>Competences</li>
        <li>Headline et resume</li>
      </ul>
      <p>
        <strong>Base legale</strong> : Interet legitime (Article 6.1.f du RGPD) pour l&apos;analyse
        de due diligence financiere, combinee avec le consentement explicite de l&apos;utilisateur
        au moment du declenchement de l&apos;enrichissement.
      </p>
      <p>
        <strong>Conservation</strong> : Les donnees LinkedIn sont conservees pendant la duree
        de l&apos;analyse du deal. Elles sont supprimables a tout moment via le dashboard ou
        sur demande au DPO.
      </p>

      <h2>3. Finalites du traitement</h2>
      <ul>
        <li>Analyse automatisee de deals pour aide a la decision d&apos;investissement</li>
        <li>Generation de rapports de due diligence</li>
        <li>Benchmark et comparaison avec la base de deals</li>
      </ul>

      <h2>4. Sous-traitants</h2>
      <table>
        <thead><tr><th>Service</th><th>Usage</th><th>Localisation</th></tr></thead>
        <tbody>
          <tr><td>Clerk</td><td>Authentification</td><td>USA (Privacy Shield)</td></tr>
          <tr><td>Neon (PostgreSQL)</td><td>Base de donnees</td><td>EU</td></tr>
          <tr><td>OpenRouter</td><td>Gateway LLM</td><td>USA</td></tr>
          <tr><td>RapidAPI</td><td>Enrichissement LinkedIn</td><td>USA</td></tr>
          <tr><td>Vercel</td><td>Hebergement</td><td>USA/EU</td></tr>
        </tbody>
      </table>

      <h2>5. Droits des personnes</h2>
      <p>Conformement au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;acces</strong> (Article 15) : obtenir une copie de vos donnees</li>
        <li><strong>Droit de rectification</strong> (Article 16)</li>
        <li><strong>Droit a l&apos;effacement</strong> (Article 17) : suppression de votre compte et donnees</li>
        <li><strong>Droit a la portabilite</strong> (Article 20)</li>
        <li><strong>Droit d&apos;opposition</strong> (Article 21)</li>
      </ul>
      <p>Contact : dpo@angeldesk.io</p>

      <h2>6. Droit a l&apos;effacement des personnes analysees</h2>
      <p>
        Si vous etes un fondateur dont le profil a ete analyse sur Angel Desk,
        vous pouvez demander la suppression de vos donnees en contactant dpo@angeldesk.io.
        La suppression sera effectuee sous 30 jours.
      </p>

      {/* TODO: cookies, duree de conservation detaillee, DPO nomme */}
    </div>
  );
}
```

#### 2. Ajouter un gate de consentement avant le scraping LinkedIn

**Modifier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/rapidapi-linkedin.ts`

Ajouter un commentaire RGPD et une verification de consentement au debut de `fetchLinkedInProfile` (ligne 770).

Remplacer :

```tsx
async function fetchLinkedInProfile(linkedinUrl: string): Promise<NormalizedProfile | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[RapidAPI LinkedIn] No API key configured (RAPIDAPI_LINKEDIN_KEY)");
    return null;
  }
```

Par :

```tsx
/**
 * Fetch LinkedIn profile via RapidAPI Fresh LinkedIn (single GET call)
 *
 * RGPD NOTE:
 * Ce fetch ne doit etre appele QUE si l'utilisateur a explicitement demande
 * l'enrichissement LinkedIn (bouton "Enrichir" dans le UI).
 * Les donnees recuperees sont publiques (profil LinkedIn public).
 * Base legale: Interet legitime (Art. 6.1.f RGPD) + consentement utilisateur.
 * Les donnees sont suppressibles via le dashboard ou sur demande DPO.
 */
async function fetchLinkedInProfile(linkedinUrl: string): Promise<NormalizedProfile | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[RapidAPI LinkedIn] No API key configured (RAPIDAPI_LINKEDIN_KEY)");
    return null;
  }
```

#### 3. Ajouter un consentement dans le UI d'enrichissement

**Modifier** : L'endpoint d'enrichissement (`src/app/api/deals/[dealId]/founders/[founderId]/enrich/route.ts`) doit verifier qu'un flag `consentLinkedIn` est passe dans le body de la requete.

Le composant frontend qui declenche l'enrichissement (vraisemblablement dans `src/components/deals/team-management.tsx`) doit afficher un avertissement avant le scrape :

**Creer** : `src/components/shared/linkedin-consent-dialog.tsx`

```tsx
"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LinkedInConsentDialogProps {
  open: boolean;
  founderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LinkedInConsentDialog = memo(function LinkedInConsentDialog({
  open,
  founderName,
  onConfirm,
  onCancel,
}: LinkedInConsentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Enrichissement LinkedIn
          </DialogTitle>
          <DialogDescription>
            Vous etes sur le point de recuperer les informations publiques du
            profil LinkedIn de <strong>{founderName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Cette action va consulter les donnees <strong>publiquement accessibles</strong> sur
            LinkedIn (experiences, formation, competences) via une API tierce.
          </p>
          <p className="text-muted-foreground">
            Base legale : Interet legitime pour l&apos;analyse de due diligence (Art. 6.1.f RGPD).
            Les donnees sont supprimables a tout moment depuis le dashboard.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={onConfirm}>
            Confirmer l&apos;enrichissement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

LinkedInConsentDialog.displayName = "LinkedInConsentDialog";
```

#### 4. Ajouter une note RGPD visible dans team-investigator

**Modifier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/team-investigator.ts`

Dans la methode `getFoundersData` (ligne 900), ajouter un marqueur visible dans la section LinkedIn :

Remplacer (ligne 901-905) :

```tsx
if (f.verifiedInfo?.linkedinScrapedAt) {
  return {
    ...base,
    linkedinEnriched: true,
    linkedinScrapedAt: f.verifiedInfo.linkedinScrapedAt,
```

Par :

```tsx
if (f.verifiedInfo?.linkedinScrapedAt) {
  return {
    ...base,
    linkedinEnriched: true,
    linkedinScrapedAt: f.verifiedInfo.linkedinScrapedAt,
    rgpdNote: "Donnees LinkedIn publiques, recuperees avec consentement utilisateur (Art. 6.1.f RGPD)",
```

### Dependances

- F13 (la page confidentialite est liee depuis le banner disclaimer)

### Verification

1. Ouvrir `/legal/confidentialite` : la page est complete et mentionne LinkedIn, DPO, droits RGPD
2. Declencher un enrichissement LinkedIn : le dialog de consentement s'affiche
3. Verifier dans les logs serveur que le commentaire RGPD est present
4. La note RGPD est visible dans les donnees injectees dans le prompt agent

---

<a name="f15"></a>
## F15 - Modeles fantomes sur la page pricing

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/pricing/page.tsx`
**Lignes** : 334-351

Code problematique - affiche des modeles qui ne sont pas ceux utilises :

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-2">
    <div className="h-3 w-3 rounded-full bg-amber-500" />
    <span className="text-sm">Claude Opus - Anthropic</span>
  </div>
  <div className="flex items-center gap-2">
    <div className="h-3 w-3 rounded-full bg-emerald-500" />
    <span className="text-sm">GPT-4 Turbo - OpenAI</span>
  </div>
  <div className="flex items-center gap-2">
    <div className="h-3 w-3 rounded-full bg-blue-500" />
    <span className="text-sm">Gemini Ultra - Google</span>
  </div>
  <div className="flex items-center gap-2">
    <div className="h-3 w-3 rounded-full bg-violet-500" />
    <span className="text-sm">Mistral Large - Mistral AI</span>
  </div>
</div>
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/board/types.ts`
**Lignes** : 54-83

Modeles reellement utilises en production :

```tsx
export const BOARD_MEMBERS_PROD: BoardMemberConfig[] = [
  { id: "claude",  modelKey: "SONNET",      name: "Claude Sonnet",  color: "#D97706", provider: "anthropic" },
  { id: "gpt",     modelKey: "GPT4O",       name: "GPT-4o",         color: "#10B981", provider: "openai" },
  { id: "gemini",  modelKey: "GEMINI_PRO",   name: "Gemini Pro",     color: "#3B82F6", provider: "google" },
  { id: "grok",    modelKey: "GROK_4",       name: "Grok 4",         color: "#FF6600", provider: "xai" },
];
```

**Ecarts** :
| Pricing affiche | Reel (prod) | Ecart |
|---|---|---|
| Claude Opus | Claude Sonnet | Modele different |
| GPT-4 Turbo | GPT-4o | Modele different |
| Gemini Ultra | Gemini Pro | Modele different |
| Mistral Large | Grok 4 (xAI) | Provider ET modele differents |

### Correction

**Modifier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/(dashboard)/pricing/page.tsx`

Remplacer les lignes 334-351 (section "Les 4 membres du Board") par :

```tsx
<div className="p-4 rounded-lg bg-white border">
  <h4 className="font-semibold mb-2">Les 4 membres du Board</h4>
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full bg-amber-500" />
      <span className="text-sm">Claude Sonnet - Anthropic</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full bg-emerald-500" />
      <span className="text-sm">GPT-4o - OpenAI</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full bg-blue-500" />
      <span className="text-sm">Gemini Pro - Google</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#FF6600" }} />
      <span className="text-sm">Grok 4 - xAI</span>
    </div>
  </div>
</div>
```

**Optionnel** - Pour eviter les desynchronisations futures, importer directement depuis `types.ts` :

```tsx
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";

// Dans le JSX :
<div className="space-y-2">
  {BOARD_MEMBERS_PROD.map((member) => (
    <div key={member.id} className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: member.color }} />
      <span className="text-sm">{member.name} - {
        member.provider === "anthropic" ? "Anthropic" :
        member.provider === "openai" ? "OpenAI" :
        member.provider === "google" ? "Google" :
        "xAI"
      }</span>
    </div>
  ))}
</div>
```

Note : la page pricing est un Server Component (`async function`), et `BOARD_MEMBERS_PROD` est une constante pure (pas d'appel `process.env` au runtime puisque c'est au module load), donc l'import est safe.

### Dependances

- Aucune

### Verification

1. Ouvrir `/pricing` : les 4 modeles affiches correspondent exactement a ceux de `BOARD_MEMBERS_PROD`
2. Les couleurs correspondent (amber = Anthropic, green = OpenAI, blue = Google, orange = xAI)
3. Aucune mention de "Mistral" n'apparait sur la page

---

<a name="f16"></a>
## F16 - Absence de glossaire / tooltips sur le jargon technique

### Diagnostic

**Fichiers concernes** :
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx` (lignes 291-306) : "Burn Multiple", "Burn mensuel", "Runway"
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx` (lignes 507, 738-763) : "Confiance", "Break-even", "Growth requis"
- `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/negotiation-panel.tsx` : "Leverage", "Dealbreakers"

Exemple de code problematique (tier1-results.tsx, lignes 291-306) :

```tsx
<div className="grid grid-cols-3 gap-3 text-center">
  <div>
    <div className="text-xs text-muted-foreground">Burn mensuel</div>
    <div className="font-semibold">{formatAmount(data.findings.burn.monthlyBurn)}</div>
  </div>
  <div>
    <div className="text-xs text-muted-foreground">Runway</div>
    <div className="font-semibold">
      {data.findings.burn.runway ? `${data.findings.burn.runway} mois` : "N/A"}
    </div>
  </div>
  <div>
    <div className="text-xs text-muted-foreground">Burn Multiple</div>
    <div className="font-semibold">
      {safeFixed(data.findings.burn.burnMultiple, 2)}
    </div>
  </div>
</div>
```

**Composant tooltip existant** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/ui/tooltip.tsx` (shadcn/ui, deja installe)

### Correction

#### 1. Creer le dictionnaire de termes financiers

**Creer** : `src/lib/glossary.ts`

```tsx
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
    short: "Condition eliminatoire",
    full: "Condition non-negociable qui, si non remplie, justifie de passer le deal. Ex: pas de vesting, valorisation delirante, fraude.",
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
```

#### 2. Creer le composant GlossaryTerm

**Creer** : `src/components/shared/glossary-term.tsx`

```tsx
"use client";

import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { findGlossaryEntry } from "@/lib/glossary";

interface GlossaryTermProps {
  /** La cle du terme dans le dictionnaire GLOSSARY */
  term: string;
  /** Le texte affiche (si different de la cle). Par defaut = term */
  children?: React.ReactNode;
}

/**
 * Composant reutilisable qui affiche un tooltip explicatif sur un terme technique.
 * Utilise le dictionnaire GLOSSARY pour la definition.
 *
 * Usage: <GlossaryTerm term="Burn Multiple">3.42</GlossaryTerm>
 * ou:    <GlossaryTerm term="Burn Multiple" />
 */
export const GlossaryTerm = memo(function GlossaryTerm({
  term,
  children,
}: GlossaryTermProps) {
  const entry = findGlossaryEntry(term);

  // Si pas de definition, affiche le texte sans tooltip
  if (!entry) {
    return <>{children ?? term}</>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 cursor-help">
            {children ?? term}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold text-xs mb-1">{term} — {entry.short}</p>
          <p className="text-xs text-muted-foreground">{entry.full}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

GlossaryTerm.displayName = "GlossaryTerm";
```

#### 3. Integrer dans tier1-results.tsx

Exemple d'integration dans le bloc Burn & Runway (lignes 291-306).

Remplacer :

```tsx
<div>
  <div className="text-xs text-muted-foreground">Burn mensuel</div>
  <div className="font-semibold">{formatAmount(data.findings.burn.monthlyBurn)}</div>
</div>
<div>
  <div className="text-xs text-muted-foreground">Runway</div>
  <div className="font-semibold">
    {data.findings.burn.runway ? `${data.findings.burn.runway} mois` : "N/A"}
  </div>
</div>
<div>
  <div className="text-xs text-muted-foreground">Burn Multiple</div>
  <div className="font-semibold">
    {safeFixed(data.findings.burn.burnMultiple, 2)}
  </div>
</div>
```

Par :

```tsx
<div>
  <div className="text-xs text-muted-foreground"><GlossaryTerm term="Burn mensuel" /></div>
  <div className="font-semibold">{formatAmount(data.findings.burn.monthlyBurn)}</div>
</div>
<div>
  <div className="text-xs text-muted-foreground"><GlossaryTerm term="Runway" /></div>
  <div className="font-semibold">
    {data.findings.burn.runway ? `${data.findings.burn.runway} mois` : "N/A"}
  </div>
</div>
<div>
  <div className="text-xs text-muted-foreground"><GlossaryTerm term="Burn Multiple" /></div>
  <div className="font-semibold">
    {safeFixed(data.findings.burn.burnMultiple, 2)}
  </div>
</div>
```

**Meme principe a appliquer dans** :
- `tier1-results.tsx` : tous les labels de metriques financieres (Burn, Runway, Valorisation, etc.)
- `tier3-results.tsx` : "Break-even", "IRR", "Multiple", "Confiance"
- `negotiation-panel.tsx` : "Leverage", "Dealbreaker"

Import a ajouter en haut de chaque fichier :
```tsx
import { GlossaryTerm } from "@/components/shared/glossary-term";
```

### Dependances

- Aucune (le tooltip shadcn/ui est deja installe)

### Verification

1. Ouvrir une page de resultats d'analyse avec des metriques financieres
2. Survoler "Burn Multiple" : un tooltip apparait avec la definition claire
3. Survoler "Runway" : tooltip avec explication
4. Les termes avec tooltip ont un soulignement pointille indiquant l'interactivite
5. Le tooltip est lisible (max-width 320px, texte clair)

---

<a name="f17"></a>
## F17 - Score affiche sans echelle de reference ni contexte

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/score-badge.tsx`
**Lignes** : 1-36 (fichier complet)

Code problematique - affiche juste `{score}/100` sans contexte :

```tsx
export const ScoreBadge = memo(function ScoreBadge({
  score,
  size = "md"
}: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full border font-medium",
        getScoreBadgeColor(score),
        SIZE_CLASSES[size]
      )}
    >
      {score}/100
    </span>
  );
});
```

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/lib/format-utils.ts`
**Lignes** : 191-197

Seuils de couleur existants mais non communiques a l'utilisateur :

```tsx
export function getScoreBadgeColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-800 border-blue-200";
  if (score >= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 20) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}
```

### Correction

**Modifier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/shared/score-badge.tsx`

Remplacer le fichier complet par :

```tsx
"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getScoreBadgeColor } from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  /** Optionnel: affiche une barre de contexte P25/P50/P75 */
  showScale?: boolean;
  /** Optionnel: percentiles pour le contexte (P25, P50, P75) */
  percentiles?: { p25: number; p50: number; p75: number };
}

const SIZE_CLASSES = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-lg px-3 py-1.5 font-bold",
} as const;

const SCORE_SCALE = [
  { min: 80, label: "Excellent", emoji: "", color: "bg-green-500" },
  { min: 60, label: "Bon", emoji: "", color: "bg-blue-500" },
  { min: 40, label: "Moyen", emoji: "", color: "bg-yellow-500" },
  { min: 20, label: "Faible", emoji: "", color: "bg-orange-500" },
  { min: 0,  label: "Critique", emoji: "", color: "bg-red-500" },
] as const;

function getScoreLabel(score: number): string {
  for (const s of SCORE_SCALE) {
    if (score >= s.min) return s.label;
  }
  return "Critique";
}

export const ScoreBadge = memo(function ScoreBadge({
  score,
  size = "md",
  showScale = false,
  percentiles,
}: ScoreBadgeProps) {
  const label = useMemo(() => getScoreLabel(score), [score]);

  const badge = (
    <span
      className={cn(
        "rounded-full border font-medium",
        getScoreBadgeColor(score),
        SIZE_CLASSES[size]
      )}
    >
      {score}/100
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 cursor-help">
            {badge}
            {size === "lg" && (
              <span className="text-xs font-normal text-muted-foreground">
                {label}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-64 p-3">
          {/* Score qualitatif */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{score}/100 — {label}</span>
          </div>

          {/* Barre de position */}
          <div className="relative h-3 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 mb-2">
            <div
              className="absolute top-0 w-1 h-3 bg-foreground rounded-full shadow-md"
              style={{ left: `${Math.min(98, Math.max(2, score))}%` }}
            />
          </div>

          {/* Echelle qualitative */}
          <div className="grid grid-cols-5 gap-0.5 text-center mb-2">
            {SCORE_SCALE.slice().reverse().map((s) => (
              <div
                key={s.min}
                className={cn(
                  "text-[10px] py-0.5 rounded",
                  score >= s.min && score < (SCORE_SCALE[SCORE_SCALE.indexOf(s) - 1]?.min ?? 101)
                    ? "bg-foreground/10 font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {s.label}
              </div>
            ))}
          </div>

          {/* Percentiles contextuels si fournis */}
          {percentiles && (
            <div className="border-t pt-2 mt-1">
              <p className="text-[10px] text-muted-foreground mb-1">Position vs deals similaires :</p>
              <div className="relative h-2 rounded-full bg-muted">
                {/* P25 marker */}
                <div
                  className="absolute top-0 w-px h-2 bg-muted-foreground/40"
                  style={{ left: `${percentiles.p25}%` }}
                />
                {/* P50 marker */}
                <div
                  className="absolute top-0 w-px h-2 bg-muted-foreground/60"
                  style={{ left: `${percentiles.p50}%` }}
                />
                {/* P75 marker */}
                <div
                  className="absolute top-0 w-px h-2 bg-muted-foreground/40"
                  style={{ left: `${percentiles.p75}%` }}
                />
                {/* Current score */}
                <div
                  className="absolute -top-0.5 w-2 h-3 bg-primary rounded-full"
                  style={{ left: `${Math.min(98, Math.max(0, score))}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                <span>P25: {percentiles.p25}</span>
                <span>P50: {percentiles.p50}</span>
                <span>P75: {percentiles.p75}</span>
              </div>
            </div>
          )}

          {/* Legende echelle */}
          <p className="text-[10px] text-muted-foreground mt-1">
            80+ = Excellent | 60-79 = Bon | 40-59 = Moyen | 20-39 = Faible | 0-19 = Critique
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

ScoreBadge.displayName = "ScoreBadge";
```

### Dependances

- Le composant tooltip shadcn/ui est deja installe
- F16 (meme pattern de tooltip explicatif)

### Verification

1. Survoler n'importe quel score badge : un tooltip riche apparait
2. Le tooltip montre : note/100, label qualitatif, barre de position sur le gradient, legende de l'echelle
3. Pour les scores en taille "lg", le label qualitatif est aussi affiche inline (ex: "72/100 Bon")
4. Si `percentiles` est fourni, une barre P25/P50/P75 est visible dans le tooltip

---

<a name="f18"></a>
## F18 - Projections affichees comme certitudes

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`
**Lignes** : 1706-1740

Code problematique - "Multiple Espere" et "IRR Espere" affiches sans warning :

```tsx
{/* Key Metrics Grid - The WOW factor */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
  {/* Expected Return */}
  {expectedReturn && (
    <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10">
      <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Multiple Espere</div>
      {/* ... affiche le multiple sans disclaimer ... */}
      <div className={cn("text-3xl font-bold", ...)}>
        {Number(expectedReturn.expectedMultiple ?? 0).toFixed(1)}x
      </div>
      <div className="text-xs text-slate-400 mt-1">Pondere par scenarios</div>
    </div>
  )}

  {/* Expected IRR */}
  {expectedReturn && expectedReturn.expectedIRR !== 0 && (
    <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10">
      <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">IRR Espere</div>
      <div className={cn("text-3xl font-bold", ...)}>
        {Number(expectedReturn.expectedIRR ?? 0).toFixed(0)}%
      </div>
      <div className="text-xs text-slate-400 mt-1">Moyenne ponderee</div>
    </div>
  )}
```

Les problemes :
1. "Multiple Espere" est present comme un fait, sans mention de l'incertitude
2. "IRR Espere" idem
3. Pas de mention que 70% des startups early-stage echouent
4. Pas de badge PROJECTION / ESTIMATIF

### Correction

**Modifier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier3-results.tsx`

Remplacer les lignes 1706-1740 (le bloc grid "Key Metrics Grid") par :

```tsx
{/* Key Metrics Grid - The WOW factor */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
  {/* Expected Return */}
  {expectedReturn && (
    <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10 relative">
      <Badge className="absolute -top-2 -right-2 bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 border-0">
        PROJECTION
      </Badge>
      <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">
        Rendement Theorique (estimatif)
      </div>
      {expectedReturn.expectedMultiple < 1 ? (
        <>
          <div className="text-3xl font-bold text-slate-500">&mdash;</div>
          <div className="text-xs text-slate-500 mt-1">Retour improbable</div>
        </>
      ) : (
        <>
          <div className={cn("text-3xl font-bold",
            Number(expectedReturn.expectedMultiple ?? 0) >= 5 ? "text-emerald-400" :
            Number(expectedReturn.expectedMultiple ?? 0) >= 3 ? "text-green-400" :
            Number(expectedReturn.expectedMultiple ?? 0) >= 2 ? "text-yellow-400" :
            "text-orange-400"
          )}>{Number(expectedReturn.expectedMultiple ?? 0).toFixed(1)}x</div>
          <div className="text-xs text-slate-400 mt-1">Pondere par scenarios</div>
        </>
      )}
    </div>
  )}

  {/* Expected IRR */}
  {expectedReturn && expectedReturn.expectedIRR !== 0 && (
    <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/10 relative">
      <Badge className="absolute -top-2 -right-2 bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 border-0">
        PROJECTION
      </Badge>
      <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">
        IRR Theorique (estimatif)
      </div>
      <div className={cn("text-3xl font-bold", getIRRColorClass(Number(expectedReturn.expectedIRR ?? 0)))}>
        {Number(expectedReturn.expectedIRR ?? 0).toFixed(0)}%
      </div>
      <div className="text-xs text-slate-400 mt-1">Moyenne ponderee</div>
    </div>
  )}
```

Et ajouter un avertissement apres la grille (apres la ligne correspondant a la fin de la grid `</div>` du bloc metrics, avant le Recommendation Banner) :

```tsx
{/* Warning projection */}
{expectedReturn && expectedReturn.expectedMultiple >= 1 && (
  <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
    <p className="text-xs text-amber-200">
      <strong>Attention :</strong> Ces projections sont <strong>theoriques et estimatives</strong>,
      basees sur les claims du fondateur et des scenarios modelises.
      En realite, <strong>~70% des startups early-stage echouent</strong> (source : CB Insights, Harvard Business School).
      Le rendement reel peut etre significativement different, y compris une perte totale du capital.
    </p>
  </div>
)}
```

Egalement modifier le bloc "Retour Espere" dans le ScenarioModelerCard (lignes 528-573).

Remplacer le label (ligne 530) :

```tsx
<span className="text-sm font-medium text-indigo-100">Retour Espere</span>
```

Par :

```tsx
<span className="text-sm font-medium text-indigo-100">Retour Theorique (estimatif)</span>
```

Et ajouter apres la ligne 570 (`{probabilityWeighted?.riskAdjustedAssessment && ...}`) :

```tsx
<p className="text-xs text-indigo-200/70 mt-2 border-t border-white/10 pt-2">
  Projection estimative basee sur des hypotheses. ~70% des startups early-stage echouent.
  Le rendement reel peut etre significativement different.
</p>
```

### Dependances

- F13 (le disclaimer global renforce ce message)

### Verification

1. Ouvrir les resultats Tier 3 d'un deal : les blocs "Multiple" et "IRR" affichent un badge "PROJECTION" orange
2. Les labels sont "Rendement Theorique (estimatif)" et "IRR Theorique (estimatif)"
3. Sous la grille de metriques, un avertissement orange mentionne les 70% d'echec
4. Dans le ScenarioModelerCard, "Retour Espere" est remplace par "Retour Theorique (estimatif)"

---

<a name="f21"></a>
## F21 - Moat technique faible (strategique)

### Diagnostic

Pas de code a corriger. Il s'agit d'un risque strategique identifie :

- Le coeur du produit (prompts + orchestrateur + Context Engine) est reproductible en 2-4 semaines
- La DB est trop petite (~1500 deals actuellement, cible 5000)
- Pas de data flywheel (les analyses ne nourrissent pas la DB)
- Pas de partenariats data exclusifs
- Pas de metriques de moat suivies

### Correction : Document de recommandations strategiques

**Creer** : `src/docs/moat-strategy.md`

> Note : Ce fichier n'est PAS du code. C'est un document interne de recommandations strategiques.

```markdown
# Strategie de Moat - Angel Desk

## Diagnostic actuel

### Ce qui est reproductible (2-4 semaines)
- Prompts system des 40 agents
- Architecture orchestrateur multi-tiers
- Integration OpenRouter / multi-LLM
- UI de presentation des resultats
- AI Board (deliberation multi-modeles)

### Ce qui constitue un debut de moat
- Base de 1500+ deals structures (schema normalise)
- Expertise de prompts DD affines par iteration
- UX specifique BA (pas generique)

## Recommandations (par priorite)

### P0 - Data Flywheel (0-3 mois)

**Objectif** : Chaque analyse enrichit la DB, qui ameliore les futures analyses.

1. **Feedback loop utilisateur** :
   - Apres chaque deal, collecter le verdict reel du BA (a-t-il investi ? Pourquoi ?)
   - Apres 6-12 mois, collecter l'outcome (la startup a-t-elle tenu ses projections ?)
   - Utiliser ces outcomes pour recalibrer les modeles de scoring

2. **Auto-enrichissement DB** :
   - Chaque analyse Tier 1 devrait extraire et stocker les metriques du deal dans la DB
   - Secteur, stage, valorisation, metriques cles → normalises et indexes
   - Objectif : 10,000 deals structures d'ici 6 mois

3. **Metriques flywheel a suivre** :
   - Nombre de deals analyses / semaine
   - Taux d'enrichissement auto (% de deals qui nourrissent la DB)
   - Taux de feedback utilisateur
   - Precision des predictions (quand on a assez de outcomes)

### P1 - Partenariats Data Exclusifs (3-6 mois)

**Objectif** : Acceder a des donnees que les concurrents n'ont pas.

1. **Partenariat avec reseaux BA** :
   - France Angels, BADGE (Business Angels des Grandes Ecoles), Angelsquare
   - Proposer Angel Desk gratuit en echange de l'acces aux deals (anonymises)
   - 50-100 deals / mois via ces reseaux = flywheel massif

2. **Partenariat avec accelerateurs** :
   - Station F, The Family, Techstars Paris
   - Analyser les cohortes = data structuree gratuite
   - Benchmark interne par cohorte

3. **Integration plateformes** :
   - Gust, AngelList, Dealum, FundingBox
   - Connecteur API pour importer les deals automatiquement
   - Double benefice : acquisition + enrichissement DB

### P2 - Moat Produit (6-12 mois)

**Objectif** : Rendre le produit difficile a quitter.

1. **Portfolio tracking** :
   - Suivre les deals investis dans le temps
   - Alertes automatiques (levee suivante, news, red flags post-investissement)
   - Plus l'utilisateur utilise le produit, plus il a de raisons de rester

2. **Network effects (BA-to-BA)** :
   - Co-investissement : partager une analyse avec un autre BA
   - Syndication : un BA peut inviter d'autres BA a analyser un deal
   - Reviews : noter la qualite des deals post-investissement

3. **Historique personnel** :
   - Calibration personnelle du scoring (chaque BA a ses preferences)
   - Historique des decisions et de leur outcome
   - "Mon track record" : performance personnelle chiffree

### P3 - Moat Technique (12+ mois)

**Objectif** : Avantages techniques difficiles a reproduire.

1. **Fine-tuning des modeles** :
   - Fine-tuner un modele sur les 10,000+ analyses accumulees
   - Specialiser les outputs pour le format BA (pas VC)
   - Proprietaire = irreproduisible par un concurrent qui copie les prompts

2. **Score predictif proprietary** :
   - Modele de scoring entraine sur les outcomes reels
   - "Ce deal a 73% de chances de lever un Series A dans les 18 mois"
   - Necessite 2-3 ans de data et de feedback

3. **Benchmark database proprietaire** :
   - 50,000+ deals structures avec outcomes
   - Percentiles par secteur/stage/geo actualises en temps reel
   - Moat defensif car la data est cumulative et non reproductible

## KPIs de Moat a Suivre

| Metrique | Actuel | Cible 6 mois | Cible 12 mois |
|---|---|---|---|
| Deals dans la DB | ~1,500 | 10,000 | 50,000 |
| Deals avec outcomes | 0 | 200 | 2,000 |
| Taux de feedback BA | 0% | 30% | 60% |
| Partenariats data | 0 | 2 | 5 |
| Precision scoring (backtest) | N/A | Mesurable | >70% |
| Retention utilisateur (M3) | N/A | >50% | >70% |
| Utilisateurs actifs / mois | N/A | 100 | 500 |

## Conclusion

Le moat actuel est FAIBLE. La priorite absolue est le data flywheel (P0) car il est
le fondement de toutes les autres strategies. Sans data differenciante, le produit
reste un wrapper de prompts facilement reproductible.

L'objectif a 12 mois est d'avoir une DB suffisamment large et enrichie pour que
le cout de reproduction soit mesure en annees, pas en semaines.
```

### Dependances

- Aucune (document strategique independant)

### Verification

- Le document est present et lisible
- Les recommandations sont concretes et prioritisees
- Les KPIs sont mesurables

---

<a name="f22"></a>
## F22 - Red flags disperses dans 13 cartes agents sans vue consolidee

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`

Les red flags sont affiches dans chaque carte agent individuellement, dans des `ExpandableSection` fermes par defaut :

- **FinancialAuditCard** (ligne 411) : `<ExpandableSection title="Red Flags ...">`
- **TeamInvestigatorCard** (ligne 629) : `<ExpandableSection title="Red Flags ...">`
- **CompetitiveIntelCard** (ligne 765) : `<ExpandableSection title="Red Flags ...">`
- **DeckForensicsCard** (ligne 896) : `<ExpandableSection title="Red Flags ...">`

Et idem pour les 9 autres agents (Market Intel, Tech Stack DD, Tech Ops DD, Legal, Cap Table, GTM, Customer Intel, Exit Strategist, Question Master).

Chaque carte affiche ses red flags dans une section `ExpandableSection` avec `defaultOpen = false`.

Exemple (lignes 628-651) :

```tsx
{data.redFlags && data.redFlags.length > 0 && (
  <ExpandableSection title={`Red Flags (${data.redFlags.length})`}>
    <ul className="space-y-2 mt-2">
      {data.redFlags.map((rf, i) => (
        <li key={i} className="p-2 rounded border">
          <div className="flex items-start gap-2">
            <AlertTriangle className={cn(
              "h-4 w-4 shrink-0 mt-0.5",
              rf.severity === "CRITICAL" ? "text-red-600" :
              rf.severity === "HIGH" ? "text-orange-500" : "text-yellow-500"
            )} />
            <div>
              <span className="font-medium">{rf.title}</span>
              <p className="text-xs text-muted-foreground mt-1">{rf.evidence}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </ExpandableSection>
)}
```

**Probleme** : Un red flag CRITICAL dans le Cap Table Auditor (collapse ferme) peut etre completement rate par le BA.

### Correction

#### 1. Creer le composant RedFlagsSummary

**Creer** : `src/components/deals/red-flags-summary.tsx`

```tsx
"use client";

import { useMemo, memo } from "react";
import { AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatAgentName, getSeverityColor } from "@/lib/format-utils";

// Red flag structure from agents
interface RedFlag {
  id?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description?: string;
  evidence?: string;
  category?: string;
  question?: string;
  impact?: string;
}

interface AgentRedFlags {
  agentName: string;
  redFlags: RedFlag[];
}

interface RedFlagsSummaryProps {
  /** Array of agent results containing red flags */
  agentResults: AgentRedFlags[];
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
};

const SEVERITY_STYLES: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  label: string;
}> = {
  CRITICAL: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: "text-red-600",
    label: "Critique",
  },
  HIGH: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    icon: "text-orange-500",
    label: "Eleve",
  },
  MEDIUM: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    icon: "text-yellow-500",
    label: "Moyen",
  },
};

/**
 * RedFlagsSummary - Vue consolidee de TOUS les red flags de tous les agents.
 *
 * Affichee en HAUT des resultats Tier 1, avant les cartes individuelles.
 * Trie par severite (CRITICAL en premier).
 * Affiche l'agent source pour chaque flag.
 */
export const RedFlagsSummary = memo(function RedFlagsSummary({
  agentResults,
}: RedFlagsSummaryProps) {
  // Consolider et trier tous les red flags
  const consolidatedFlags = useMemo(() => {
    const allFlags: (RedFlag & { agentName: string })[] = [];

    for (const agent of agentResults) {
      for (const rf of agent.redFlags) {
        allFlags.push({ ...rf, agentName: agent.agentName });
      }
    }

    // Trier par severite (CRITICAL > HIGH > MEDIUM)
    allFlags.sort((a, b) => {
      const orderA = SEVERITY_ORDER[a.severity] ?? 3;
      const orderB = SEVERITY_ORDER[b.severity] ?? 3;
      return orderA - orderB;
    });

    return allFlags;
  }, [agentResults]);

  // Compteurs par severite
  const counts = useMemo(() => ({
    CRITICAL: consolidatedFlags.filter(f => f.severity === "CRITICAL").length,
    HIGH: consolidatedFlags.filter(f => f.severity === "HIGH").length,
    MEDIUM: consolidatedFlags.filter(f => f.severity === "MEDIUM").length,
    total: consolidatedFlags.length,
  }), [consolidatedFlags]);

  // Ne rien afficher s'il n'y a aucun red flag
  if (counts.total === 0) return null;

  // Determiner le niveau d'alerte global
  const hasCritical = counts.CRITICAL > 0;
  const hasHigh = counts.HIGH > 0;

  return (
    <Card className={cn(
      "border-2",
      hasCritical ? "border-red-300 bg-gradient-to-b from-red-50/80 to-white" :
      hasHigh ? "border-orange-300 bg-gradient-to-b from-orange-50/50 to-white" :
      "border-yellow-300 bg-gradient-to-b from-yellow-50/50 to-white"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className={cn(
              "h-6 w-6",
              hasCritical ? "text-red-600" : hasHigh ? "text-orange-500" : "text-yellow-500"
            )} />
            <CardTitle className="text-lg">
              Red Flags ({counts.total})
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {counts.CRITICAL > 0 && (
              <Badge className="bg-red-500 text-white border-0">
                {counts.CRITICAL} Critique{counts.CRITICAL > 1 ? "s" : ""}
              </Badge>
            )}
            {counts.HIGH > 0 && (
              <Badge className="bg-orange-500 text-white border-0">
                {counts.HIGH} Eleve{counts.HIGH > 1 ? "s" : ""}
              </Badge>
            )}
            {counts.MEDIUM > 0 && (
              <Badge className="bg-yellow-500 text-black border-0">
                {counts.MEDIUM} Moyen{counts.MEDIUM > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Vue consolidee de tous les risques detectes par les {agentResults.filter(a => a.redFlags.length > 0).length} agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {consolidatedFlags.map((flag, i) => {
          const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.MEDIUM;
          return (
            <div
              key={`${flag.agentName}-${flag.id ?? i}`}
              className={cn(
                "p-3 rounded-lg border",
                style.bg,
                style.border,
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", style.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={cn("font-medium text-sm", style.text)}>
                      {flag.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] shrink-0", getSeverityColor(flag.severity))}
                    >
                      {style.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] shrink-0 bg-muted">
                      {formatAgentName(flag.agentName)}
                    </Badge>
                  </div>
                  {flag.evidence && (
                    <p className="text-xs text-muted-foreground">{flag.evidence}</p>
                  )}
                  {flag.impact && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Impact :</span> {flag.impact}
                    </p>
                  )}
                  {flag.question && (
                    <p className="text-xs mt-1.5 flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 text-blue-500" />
                      <span className="text-blue-700">{flag.question}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
});

RedFlagsSummary.displayName = "RedFlagsSummary";
```

#### 2. Integrer dans Tier1Results

**Modifier** : `/Users/sacharebbouh/Desktop/angeldesk/src/components/deals/tier1-results.tsx`

Ajouter l'import en haut du fichier :

```tsx
import { RedFlagsSummary } from "./red-flags-summary";
```

Dans la fonction `Tier1Results` (apres les variables `getAgentData`, vers ligne 3540), ajouter la collecte des red flags :

```tsx
// Collect all red flags from all agents for consolidated view
const allAgentRedFlags = useMemo(() => {
  const agents: { agentName: string; redFlags: Array<{ severity: string; title: string; evidence?: string; question?: string; impact?: string; id?: string }> }[] = [];

  const addAgent = (name: string, data: { redFlags?: Array<{ severity: string; title: string; evidence?: string; question?: string; impact?: string; id?: string }> } | null) => {
    if (data?.redFlags && data.redFlags.length > 0) {
      agents.push({ agentName: name, redFlags: data.redFlags as Array<{ severity: "CRITICAL" | "HIGH" | "MEDIUM"; title: string; evidence?: string; question?: string; impact?: string; id?: string }> });
    }
  };

  addAgent("financial-auditor", financialData);
  addAgent("team-investigator", teamData);
  addAgent("competitive-intel", competitiveData);
  addAgent("deck-forensics", deckData);
  addAgent("market-intelligence", marketData);
  addAgent("tech-stack-dd", techStackData);
  addAgent("tech-ops-dd", techOpsData);
  addAgent("legal-regulatory", legalData);
  addAgent("cap-table-auditor", capTableData);
  addAgent("gtm-analyst", gtmData);
  addAgent("customer-intel", customerData);
  addAgent("exit-strategist", exitData);

  return agents;
}, [financialData, teamData, competitiveData, deckData, marketData, techStackData, techOpsData, legalData, capTableData, gtmData, customerData, exitData]);
```

Puis inserer le composant AVANT le `<Card>` "Synthese Investigation Tier 1" (ligne 3576), dans le JSX du `return` :

```tsx
return (
  <div className="space-y-6">
    {/* RED FLAGS SUMMARY - Consolidated view, displayed FIRST */}
    <RedFlagsSummary agentResults={allAgentRedFlags} />

    {/* Summary Header */}
    <Card>
      {/* ... reste du code inchange ... */}
```

### Dependances

- Necessite `formatAgentName` et `getSeverityColor` de `src/lib/format-utils.ts` (deja existants)
- Le composant utilise le meme style de red flags que les cartes individuelles pour la coherence visuelle

### Verification

1. Ouvrir les resultats Tier 1 d'un deal avec des red flags
2. La carte RedFlagsSummary est visible EN PREMIER, avant la synthese et les cartes agents
3. Les red flags sont tries par severite : CRITICAL en haut (fond rouge), puis HIGH (fond orange), puis MEDIUM (fond jaune)
4. Chaque flag indique l'agent source (badge "Financial Auditor", "Team Investigator", etc.)
5. Les questions associees sont visibles directement
6. Si aucun red flag n'existe, le composant ne s'affiche pas
7. Un red flag CRITICAL du Cap Table Auditor est visible sans avoir a ouvrir la carte Cap Table

---

## Resume des fichiers a creer

| Fichier | Faille |
|---|---|
| `src/components/shared/disclaimer-banner.tsx` | F13 |
| `src/app/(dashboard)/legal/cgu/page.tsx` | F13 |
| `src/app/(dashboard)/legal/mentions-legales/page.tsx` | F13 |
| `src/app/(dashboard)/legal/confidentialite/page.tsx` | F14 |
| `src/components/shared/linkedin-consent-dialog.tsx` | F14 |
| `src/lib/glossary.ts` | F16 |
| `src/components/shared/glossary-term.tsx` | F16 |
| `src/components/deals/red-flags-summary.tsx` | F22 |
| `src/docs/moat-strategy.md` | F21 |

## Resume des fichiers a modifier

| Fichier | Faille | Nature de la modification |
|---|---|---|
| `src/app/(dashboard)/layout.tsx` | F13 | Ajout DisclaimerBanner + restructuration flex |
| `src/components/deals/tier3-results.tsx` | F13, F18 | Disclaimer inline, labels "Theorique", badges PROJECTION, warning 70% |
| `src/app/(dashboard)/pricing/page.tsx` | F15 | Remplacer noms des 4 modeles AI Board |
| `src/components/deals/tier1-results.tsx` | F16, F22 | GlossaryTerm sur metriques + RedFlagsSummary en haut |
| `src/components/deals/negotiation-panel.tsx` | F16 | GlossaryTerm sur "Leverage", "Dealbreaker" |
| `src/components/shared/score-badge.tsx` | F17 | Tooltip avec echelle qualitative + barre de position |
| `src/services/context-engine/connectors/rapidapi-linkedin.ts` | F14 | Commentaire RGPD obligatoire |
| `src/agents/tier1/team-investigator.ts` | F14 | Note RGPD dans les donnees LinkedIn |

## Dependances inter-failles

```
F13 ←→ F14  (la page confidentialite est creee en F13, completee en F14)
F13 → F18   (le disclaimer global renforce les warnings F18)
F16 → F17   (meme pattern tooltip, coherence UX)
```

## Ordre d'implementation recommande

1. **F16** - Glossaire (fondation pour les tooltips)
2. **F17** - ScoreBadge ameliore (utilise les tooltips)
3. **F13** - Disclaimer + pages legales (fondation juridique)
4. **F14** - RGPD (complete les pages legales)
5. **F15** - Modeles pricing (correction rapide, isolee)
6. **F18** - Projections (apres le disclaimer global)
7. **F22** - RedFlagsSummary (composant isolable)
8. **F21** - Document strategique (pas de code)
