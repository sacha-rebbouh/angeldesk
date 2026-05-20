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

// ============================================================
// Codex B6.2.1 P1 — manual.sourceKind override blocks inference
// regardless of the manual VALUE (FILE included).
// ============================================================
describe("inferEmailSourceFromExtractedText — Codex B6.2.1 P1 manual.sourceKind bail", () => {
  // Text that WOULD trigger inference if no gates blocked it. Re-used
  // across the tests so the only variable is the metadata gate.
  const emailLikeText = [
    "De: CFO <cfo@example.com>",
    "Envoyé : lundi 6 avril 2026 16:10",
    "Objet : Update",
    "",
    "Voici les derniers chiffres,",
    "",
    "--",
    "De: Founder <founder@startup.io>",
    "Envoyé : dimanche 5 avril 2026 18:00",
    "Objet : Re: Update",
  ].join("\n");

  it("RED — manual.sourceKind=FILE override blocks inference even when currentSourceKind=FILE matches (the exact Codex P1 scenario)", () => {
    // The scenario: user corrected a false-positive email back to FILE
    // via B6.2 → row now has currentSourceKind=FILE +
    // sourceMetadata.manual.sourceKind = { newValue: "FILE", ... }.
    // Without the manual gate, the inference would happily re-classify
    // the doc as EMAIL on the next reprocess (currentSourceKind ===
    // "FILE" satisfies the legacy gate). With the manual gate, it bails.
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          sourceKind: {
            setBy: "user_owner",
            setAt: "2026-04-10T10:00:00.000Z",
            previousValue: "EMAIL",
            newValue: "FILE",
          },
        },
      },
    });
    expect(inferred).toBeNull();
  });

  it("RED — manual.sourceKind=EMAIL override also blocks inference (PRESENCE of the override gates, not the value)", () => {
    // Symmetric: if the user manually set EMAIL, we still bail
    // because the inference's job is to AUTO-detect; the manual
    // override is the authoritative state.
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          sourceKind: {
            setBy: "user_owner",
            setAt: "2026-04-10T10:00:00.000Z",
            previousValue: "FILE",
            newValue: "EMAIL",
          },
        },
      },
    });
    expect(inferred).toBeNull();
  });

  it("Codex B6.3 — manual.sourceDate ALSO blocks the inference (any email-related manual override bails — the inference rewrites all email fields together)", () => {
    // CONTRACT CHANGE B6.3: B6.2.1 had this test asserting "each
    // manual override is independent" — manual.sourceDate did NOT
    // block sourceKind inference. B6.3 tightens the contract: the
    // inference returns a payload that overwrites ALL email fields
    // atomically (sourceKind + sourceDate + receivedAt +
    // sourceAuthor + sourceSubject + sourceMetadata). So a partial
    // manual override would either silently get overwritten or end
    // up in a mixed state. Bail entirely is the only safe contract.
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          sourceDate: {
            setBy: "user_owner",
            setAt: "2026-03-14T10:00:00.000Z",
            previousValue: null,
            newValue: "2026-04-06T00:00:00.000Z",
          },
        },
      },
      // existingSourceDate intentionally omitted — we want to test
      // ONLY the sourceMetadata-level gate, not the existingSourceDate
      // bail.
    });
    expect(inferred).toBeNull();
  });

  it("Codex B6.3 — manual.receivedAt blocks the inference (email metadata override)", () => {
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          receivedAt: {
            setBy: "user_owner",
            setAt: "2026-03-14T10:00:00.000Z",
            previousValue: null,
            newValue: "2026-04-15T00:00:00.000Z",
          },
        },
      },
    });
    expect(inferred).toBeNull();
  });

  it("Codex B6.3 — manual.sourceAuthor blocks the inference", () => {
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          sourceAuthor: {
            setBy: "user_owner",
            setAt: "2026-03-14T10:00:00.000Z",
            previousValue: null,
            newValue: "Real Author <real@startup.io>",
          },
        },
      },
    });
    expect(inferred).toBeNull();
  });

  it("Codex B6.3 — manual.sourceSubject blocks the inference", () => {
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          sourceSubject: {
            setBy: "user_owner",
            setAt: "2026-03-14T10:00:00.000Z",
            previousValue: null,
            newValue: "Corrected subject",
          },
        },
      },
    });
    expect(inferred).toBeNull();
  });

  it("Codex B6.3 — UNRELATED manual key (e.g. manual.documentType from B6.2) does NOT block the inference (only email-related keys gate)", () => {
    // Defensive: a doc with only a `manual.documentType` block (e.g.
    // user re-classified the type but not anything email-related)
    // should still allow the inference to run if the content
    // legitimately looks like an email.
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      sourceMetadata: {
        manual: {
          documentType: {
            setBy: "user_owner",
            setAt: "2026-03-14T10:00:00.000Z",
            previousValue: "OTHER",
            newValue: "PITCH_DECK",
          },
        },
      },
    });
    expect(inferred).not.toBeNull();
  });

  it("no sourceMetadata passed (legacy callers) → pre-B6.2.1 behaviour preserved", () => {
    const inferred = inferEmailSourceFromExtractedText({
      text: emailLikeText,
      fileName: "thread-with-headers.pdf",
      currentSourceKind: "FILE",
      // sourceMetadata omitted.
    });
    expect(inferred).not.toBeNull();
  });

  it("sourceMetadata is null / scalar / array → treated as 'no manual context' (defensive)", () => {
    expect(
      inferEmailSourceFromExtractedText({
        text: emailLikeText,
        fileName: "thread-with-headers.pdf",
        currentSourceKind: "FILE",
        sourceMetadata: null,
      })
    ).not.toBeNull();
    expect(
      inferEmailSourceFromExtractedText({
        text: emailLikeText,
        fileName: "thread-with-headers.pdf",
        currentSourceKind: "FILE",
        sourceMetadata: "string-value",
      })
    ).not.toBeNull();
    expect(
      inferEmailSourceFromExtractedText({
        text: emailLikeText,
        fileName: "thread-with-headers.pdf",
        currentSourceKind: "FILE",
        sourceMetadata: ["array-value"],
      })
    ).not.toBeNull();
  });
});
