import { describe, expect, it } from "vitest";

import {
  extractEmailMetadata,
  htmlToPlainText,
  parseEmailDate,
} from "@/components/deals/corpus/extract-email-metadata";

// ---------------------------------------------------------------------------
// htmlToPlainText sanity
// ---------------------------------------------------------------------------

describe("htmlToPlainText", () => {
  it("strips dangerous tags and decodes basic entities", () => {
    const out = htmlToPlainText(
      `<p>Hello &amp; team</p><script>alert(1)</script><p>&euro;1,000</p>`
    );
    expect(out).toContain("Hello & team");
    expect(out).toContain("€1,000");
    expect(out).not.toContain("alert");
  });
});

// ---------------------------------------------------------------------------
// parseEmailDate
// ---------------------------------------------------------------------------

describe("parseEmailDate", () => {
  it("parses RFC 2822 dates (Gmail/Outlook)", () => {
    const date = parseEmailDate("Fri, 24 Apr 2026 09:42:11 +0200");
    expect(date?.toISOString()).toBe("2026-04-24T07:42:11.000Z");
  });

  it("parses ISO datetime", () => {
    const date = parseEmailDate("2026-04-24T08:00:00Z");
    expect(date?.toISOString()).toBe("2026-04-24T08:00:00.000Z");
  });

  it("parses French verbose form (le ... à ...)", () => {
    const date = parseEmailDate("le 24 avril 2026 à 9 h 42");
    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2026);
    expect(date?.getUTCMonth()).toBe(3); // April
    expect(date?.getUTCDate()).toBe(24);
    expect(date?.getUTCHours()).toBe(9);
    expect(date?.getUTCMinutes()).toBe(42);
  });

  it("parses French abbreviated form (lun. 24 avr. 2026 09:42)", () => {
    const date = parseEmailDate("lun. 24 avr. 2026 09:42");
    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2026);
    expect(date?.getUTCMonth()).toBe(3);
  });

  it("returns null for unparseable garbage", () => {
    expect(parseEmailDate("")).toBeNull();
    expect(parseEmailDate("not a date at all")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractEmailMetadata — covers each scenario from the plan
// ---------------------------------------------------------------------------

describe("extractEmailMetadata — Gmail HTML EN", () => {
  it("extracts From, Subject, Date, body and detects HTML format", () => {
    const html = `
      <div>
        <p>From: Jean CFO &lt;jean@example.com&gt;</p>
        <p>Subject: Follow-up on churn</p>
        <p>Sent: Fri, 24 Apr 2026 09:42:11 +0200</p>
        <p>Hi team,</p>
        <p>The Q1 churn was driven by an onboarding regression.</p>
      </div>
    `;
    const result = extractEmailMetadata(html);
    expect(result.detectedFormat).toBe("html");
    expect(result.from).toBe("Jean CFO <jean@example.com>");
    expect(result.subject).toBe("Follow-up on churn");
    expect(result.sentAt?.toISOString()).toBe("2026-04-24T07:42:11.000Z");
    expect(result.body).toContain("Q1 churn was driven");
    expect(result.body).not.toContain("Subject:");
  });
});

describe("extractEmailMetadata — Gmail FR HTML", () => {
  it("recognises French headers and dates", () => {
    const html = `
      <div>
        <p>De : Jean CFO &lt;jean@example.com&gt;</p>
        <p>Objet : Réponse au churn</p>
        <p>Envoyé : le 24 avril 2026 à 9 h 42</p>
        <p>Bonjour,</p>
        <p>Le churn Q1 a augmenté à cause d'une régression d'onboarding.</p>
      </div>
    `;
    const result = extractEmailMetadata(html);
    expect(result.from).toContain("Jean CFO");
    expect(result.subject).toContain("Réponse au churn");
    expect(result.sentAt?.getUTCDate()).toBe(24);
    expect(result.sentAt?.getUTCMonth()).toBe(3);
    expect(result.body).toContain("régression d'onboarding");
  });
});

describe("extractEmailMetadata — Outlook plain text EN with thread", () => {
  it("isolates the latest reply and surfaces the quoted thread separately", () => {
    const text = `From: Jean CFO <jean@example.com>
Sent: Friday, April 24, 2026 9:42 AM
To: investor@example.com
Subject: RE: Roadmap Q3

Hi Sacha,

Roadmap is on track. Engineering is shipping the new ingest layer in week 18.

-----Original Message-----
From: investor@example.com
Sent: Thursday, April 23, 2026 5:00 PM
To: Jean CFO <jean@example.com>
Subject: Roadmap Q3

What's the plan for Q3?
`;
    const result = extractEmailMetadata(text);
    expect(result.detectedFormat).toBe("text");
    expect(result.from).toContain("Jean CFO");
    expect(result.to).toContain("investor@example.com");
    expect(result.subject).toContain("Roadmap Q3");
    expect(result.body).toContain("Roadmap is on track");
    expect(result.body).not.toContain("Original Message");
    expect(result.body).not.toContain("What's the plan");
    expect(result.quotedThread).not.toBeNull();
    expect(result.quotedThread).toContain("What's the plan");
  });
});

describe("extractEmailMetadata — Outlook FR with header block thread divider", () => {
  it("splits on the De/Envoyé header block", () => {
    const text = `De : Jean CFO <jean@example.com>
Envoyé : vendredi 24 avril 2026 09:42
À : investor@example.com
Objet : RE: Roadmap Q3

Bonjour Sacha,

Tout est en ordre.

De : investor@example.com
Envoyé : jeudi 23 avril 2026 17:00
À : Jean CFO <jean@example.com>
Objet : Roadmap Q3

Quelle est la roadmap Q3 ?
`;
    const result = extractEmailMetadata(text);
    expect(result.from).toContain("Jean CFO");
    expect(result.subject).toContain("Roadmap Q3");
    expect(result.body).toContain("Tout est en ordre");
    expect(result.body).not.toContain("Quelle est la roadmap");
    expect(result.quotedThread).not.toBeNull();
    expect(result.quotedThread).toContain("Quelle est la roadmap");
  });
});

describe("extractEmailMetadata — Apple Mail / Gmail 'On ... wrote:' style", () => {
  it("splits on the 'On <date>, <name> wrote:' delimiter (EN)", () => {
    const text = `Hi team,

We confirm the cap table is final.

On Apr 23, 2026, at 5:00 PM, Jean CFO <jean@example.com> wrote:
> What's the cap table status?
`;
    const result = extractEmailMetadata(text);
    expect(result.body).toContain("cap table is final");
    expect(result.body).not.toContain("wrote:");
    expect(result.quotedThread).toContain("What's the cap table status");
  });

  it("splits on the French 'Le ... a écrit :' delimiter", () => {
    const text = `Bonjour,

Confirmation de la réponse.

Le 23 avril 2026 à 17:00, Jean CFO <jean@example.com> a écrit :
> Pouvez-vous confirmer la cap table ?
`;
    const result = extractEmailMetadata(text);
    expect(result.body).toContain("Confirmation de la réponse");
    expect(result.body).not.toContain("a écrit");
    expect(result.quotedThread).toContain("confirmer la cap table");
  });
});

describe("extractEmailMetadata — body-only paste with no headers", () => {
  it("returns the entire input as body and leaves all headers null", () => {
    const text = `Just a quick note: I confirmed with the founder that the ARR figure shown is GAAP, not booked.`;
    const result = extractEmailMetadata(text);
    expect(result.from).toBeNull();
    expect(result.subject).toBeNull();
    expect(result.sentAt).toBeNull();
    expect(result.quotedThread).toBeNull();
    expect(result.body).toContain("ARR figure shown is GAAP");
  });
});

describe("extractEmailMetadata — empty / whitespace input", () => {
  it("never throws and returns a stable empty shape", () => {
    const result = extractEmailMetadata("");
    expect(result).toEqual({
      from: null,
      to: null,
      subject: null,
      sentAt: null,
      body: "",
      quotedThread: null,
      detectedFormat: "text",
    });
  });
});

describe("extractEmailMetadata — defensive sanitization on HTML paste", () => {
  it("strips script blocks and javascript: URLs from HTML before extraction", () => {
    const html = `<div>
      <p>Subject: Re: forecast</p>
      <p>From: cfo@evil.com</p>
      <a href="javascript:alert(1)" onclick="evil()">trick</a>
      <script>alert(2)</script>
      <p>Body content stays.</p>
    </div>`;
    const result = extractEmailMetadata(html);
    expect(result.body.toLowerCase()).not.toContain("javascript:");
    expect(result.body.toLowerCase()).not.toContain("onclick");
    expect(result.body.toLowerCase()).not.toContain("alert");
    expect(result.body).toContain("Body content stays");
    expect(result.subject).toBe("Re: forecast");
    expect(result.from).toBe("cfo@evil.com");
  });
});
