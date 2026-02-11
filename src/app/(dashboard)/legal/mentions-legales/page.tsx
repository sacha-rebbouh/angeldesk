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
