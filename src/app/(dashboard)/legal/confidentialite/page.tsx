export default function PolitiqueConfidentialitePage() {
  return (
    <div className="prose prose-sm max-w-3xl mx-auto py-8">
      <h1>Politique de Confidentialite</h1>
      <p className="text-muted-foreground">Derniere mise a jour : 2026-02-12</p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Angel Desk SAS<br />
        12 rue de la Paix, 75002 Paris, France<br />
        RCS Paris 123 456 789<br />
        Contact DPO : <a href="mailto:dpo@angeldesk.io">dpo@angeldesk.io</a>
      </p>

      <h2>2. Donnees collectees</h2>

      <h3>2.1 Donnees de compte</h3>
      <p>Via Clerk (authentification) : email, nom, photo de profil.</p>

      <h3>2.2 Documents uploades</h3>
      <p>
        Pitch decks et documents fournis par l&apos;utilisateur pour analyse.
        Ces documents sont chiffres (AES-256-GCM) en base de donnees et traites par nos agents IA.
        Ils ne sont pas partages avec des tiers en dehors des sous-traitants listes ci-dessous.
      </p>

      <h3>2.3 Donnees de profils LinkedIn (fondateurs analyses)</h3>
      <p>
        Lorsque l&apos;utilisateur fournit un lien LinkedIn d&apos;un fondateur et <strong>demande explicitement
        l&apos;enrichissement du profil</strong> via un dialog de consentement, nous utilisons le service
        RapidAPI Fresh LinkedIn pour recuperer les informations <strong>publiquement accessibles</strong> sur LinkedIn :
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

      <h2>3. Finalites et bases legales</h2>
      <table>
        <thead><tr><th>Finalite</th><th>Base legale</th><th>Conservation</th></tr></thead>
        <tbody>
          <tr><td>Analyse automatisee de deals</td><td>Execution du contrat (Art. 6.1.b)</td><td>Duree du compte + 1 an</td></tr>
          <tr><td>Generation de rapports de DD</td><td>Execution du contrat (Art. 6.1.b)</td><td>Duree du compte + 1 an</td></tr>
          <tr><td>Enrichissement LinkedIn</td><td>Interet legitime + consentement (Art. 6.1.f)</td><td>Duree de l&apos;analyse du deal</td></tr>
          <tr><td>Benchmark et comparaison</td><td>Execution du contrat (Art. 6.1.b)</td><td>Donnees anonymisees : indefinie</td></tr>
          <tr><td>Facturation et comptabilite</td><td>Obligation legale (Art. 6.1.c)</td><td>10 ans</td></tr>
        </tbody>
      </table>

      <h2>4. Sous-traitants</h2>
      <table>
        <thead><tr><th>Service</th><th>Usage</th><th>Localisation</th><th>Garanties</th></tr></thead>
        <tbody>
          <tr><td>Clerk</td><td>Authentification</td><td>USA</td><td>DPA + SCCs</td></tr>
          <tr><td>Neon (PostgreSQL)</td><td>Base de donnees</td><td>EU (Francfort)</td><td>Heberge en UE</td></tr>
          <tr><td>OpenRouter</td><td>Gateway LLM</td><td>USA</td><td>DPA + SCCs</td></tr>
          <tr><td>RapidAPI</td><td>Enrichissement LinkedIn</td><td>USA</td><td>DPA</td></tr>
          <tr><td>Vercel</td><td>Hebergement</td><td>USA/EU</td><td>DPA + SCCs</td></tr>
          <tr><td>Upstash</td><td>Cache Redis</td><td>EU</td><td>Heberge en UE</td></tr>
        </tbody>
      </table>

      <h2>5. Vos droits (RGPD)</h2>
      <p>Conformement au Reglement General sur la Protection des Donnees, vous disposez des droits suivants :</p>
      <ul>
        <li><strong>Droit d&apos;acces</strong> (Article 15) : obtenir une copie de vos donnees personnelles</li>
        <li><strong>Droit de rectification</strong> (Article 16) : corriger des donnees inexactes</li>
        <li><strong>Droit a l&apos;effacement</strong> (Article 17) : suppression de votre compte et de toutes vos donnees</li>
        <li><strong>Droit a la limitation du traitement</strong> (Article 18)</li>
        <li><strong>Droit a la portabilite</strong> (Article 20) : recevoir vos donnees dans un format structure</li>
        <li><strong>Droit d&apos;opposition</strong> (Article 21) : vous opposer au traitement base sur l&apos;interet legitime</li>
        <li><strong>Droit de retrait du consentement</strong> (Article 7.3) : retirer votre consentement a tout moment</li>
      </ul>
      <p>
        Pour exercer vos droits, contactez notre DPO : <a href="mailto:dpo@angeldesk.io">dpo@angeldesk.io</a>.
        Nous repondrons sous 30 jours maximum.
      </p>
      <p>
        Vous avez egalement le droit de deposer une reclamation aupres de la <strong>CNIL</strong> (Commission
        Nationale de l&apos;Informatique et des Libertes) : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>.
      </p>

      <h2>6. Droit a l&apos;effacement des personnes analysees</h2>
      <p>
        Si vous etes un fondateur dont le profil a ete analyse sur Angel Desk,
        vous pouvez demander la suppression de vos donnees en contactant <a href="mailto:dpo@angeldesk.io">dpo@angeldesk.io</a>.
        La suppression sera effectuee sous 30 jours conformement a l&apos;Article 17 du RGPD.
      </p>

      <h2>7. Securite des donnees</h2>
      <p>Nous mettons en oeuvre les mesures de securite suivantes :</p>
      <ul>
        <li>Chiffrement AES-256-GCM des documents en base de donnees</li>
        <li>Communications exclusivement en HTTPS/TLS</li>
        <li>Authentification multi-facteur via Clerk</li>
        <li>Sanitization des entrees pour prevenir les injections</li>
        <li>Circuit breaker et rate limiting sur les APIs</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>
        Angel Desk utilise uniquement des cookies strictement necessaires au fonctionnement
        du service (session d&apos;authentification Clerk). Aucun cookie de tracking ou publicitaire
        n&apos;est utilise.
      </p>
    </div>
  );
}
