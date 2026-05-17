import { describe, expect, it } from "vitest";

import { inferEmailSourceFromExtractedText } from "../email-source-inference";

describe("inferEmailSourceFromExtractedText", () => {
  it("infers the top email metadata from an uploaded Gmail/Outlook PDF while preserving thread dates", () => {
    const text = `
[Page 1 - Native PDF text]
17/05/2026 15:01 Gmail - Tr : Tr : Re : Avekapeti
Sacha Rebbouh <sacha.rebbouh@gmail.com>
Tr : Tr : Re : Avekapeti
1 message
Eryck Rebbouh <erebbouh@hotmail.com> Wed, Apr 22, 2026 at 2:05 AM
To: Sacha Rebbouh <sacha.rebbouh@gmail.com>
De : Eryck Rebbouh <erebbouh@hotmail.com>
Envoyé : mercredi 22 avril 2026 01:03
À : KRIEF Jean-Marc <jm.krief@freshfoodvillage.com>; Marc Fiorentino <mfiorentino@elcorp.com>
Cc : Sacha Rebbouh <sacha.rebbouh@gmail.com>
Objet : Tr : Re : Avekapeti
De : Fati Mrani <fati.mrani@avekapeti.co>
Envoyé : lundi 6 avril 2026 16:10
À : erebbouh@hotmail.com <erebbouh@hotmail.com>
Objet : Re : Avekapeti
Bonjour Eryck,
J'espère que vous allez bien, suite à notre échange je vous confirme que la valo est désormais de 6M€.
`;

    const inferred = inferEmailSourceFromExtractedText({
      text,
      fileName: "Mail.pdf",
      currentSourceKind: "FILE",
    });

    expect(inferred).toMatchObject({
      sourceKind: "EMAIL",
      sourceAuthor: "Eryck Rebbouh <erebbouh@hotmail.com>",
      sourceSubject: "Tr : Re : Avekapeti",
    });
    expect(inferred?.sourceDate.toISOString()).toBe("2026-04-22T01:03:00.000Z");
    expect(inferred?.sourceMetadata.threadMessages).toEqual([
      {
        from: "Eryck Rebbouh <erebbouh@hotmail.com>",
        sentAt: "2026-04-22T01:03:00.000Z",
        subject: "Tr : Re : Avekapeti",
      },
      {
        from: "Fati Mrani <fati.mrani@avekapeti.co>",
        sentAt: "2026-04-06T16:10:00.000Z",
        subject: "Re : Avekapeti",
      },
    ]);
  });

  it("captures multiple quoted messages from a printed thread without dropping the full corpus text", () => {
    const text = `
De : Eryck Rebbouh <erebbouh@hotmail.com>
Envoyé : mercredi 22 avril 2026 01:02
Objet : Tr : Suite à notre échange
De : Fati Mrani <fati.b.mrani@gmail.com>
Envoyé : mardi 17 mars 2026 20:26
Objet : Re: Suite à notre échange
Le mar. 17 mars 2026 à 17:50, Fati Mrani <fati.b.mrani@gmail.com> a écrit :
Bonjour Eryck,
Le ven. 13 mars 2026 à 17:42, Fati Mrani <fati.b.mrani@gmail.com> a écrit :
Re-bonjour Eryck,
Suite à notre échange comme convenu ci-joint notre BP.
Deck_Avekapeti VF.pdf
`;

    const inferred = inferEmailSourceFromExtractedText({
      text,
      fileName: "Mail 2.pdf",
      currentSourceKind: "FILE",
    });

    expect(inferred?.sourceDate.toISOString()).toBe("2026-04-22T01:02:00.000Z");
    expect(inferred?.sourceMetadata.threadMessages).toEqual([
      {
        from: "Eryck Rebbouh <erebbouh@hotmail.com>",
        sentAt: "2026-04-22T01:02:00.000Z",
        subject: "Tr : Suite à notre échange",
      },
      {
        from: "Fati Mrani <fati.b.mrani@gmail.com>",
        sentAt: "2026-03-17T20:26:00.000Z",
        subject: "Re: Suite à notre échange",
      },
    ]);
    expect(inferred?.sourceMetadata.threadMessages).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ from: "ck_Avekapeti VF.pdf" })])
    );
  });

  it("does not classify a normal document with a lone date as an email", () => {
    const inferred = inferEmailSourceFromExtractedText({
      text: "Pitch deck\nDate: April 2026\nRevenue grew 80% year over year.",
      fileName: "Deck.pdf",
      currentSourceKind: "FILE",
    });

    expect(inferred).toBeNull();
  });

  it("does not overwrite an explicitly dated or non-file corpus item", () => {
    const text = "De: CFO <cfo@example.com>\nEnvoyé : lundi 6 avril 2026 16:10\nObjet : Update";

    expect(inferEmailSourceFromExtractedText({
      text,
      fileName: "Mail.pdf",
      currentSourceKind: "EMAIL",
    })).toBeNull();
    expect(inferEmailSourceFromExtractedText({
      text,
      fileName: "Mail.pdf",
      currentSourceKind: "FILE",
      existingSourceDate: new Date("2026-01-01T00:00:00.000Z"),
    })).toBeNull();
  });
});
