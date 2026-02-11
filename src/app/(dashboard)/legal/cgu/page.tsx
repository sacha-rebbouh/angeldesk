export default function CGUPage() {
  return (
    <div className="prose prose-sm max-w-3xl mx-auto py-8">
      <h1>Conditions Generales d&apos;Utilisation</h1>
      <p className="text-muted-foreground">Derniere mise a jour : 2026-02-12</p>

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
