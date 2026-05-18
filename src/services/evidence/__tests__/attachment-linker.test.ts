/**
 * Phase 4 — Unit tests for attachment-linker (pure detection + matching logic).
 *
 * Integration test (real DB, Avekapeti gate) lives in
 * attachment-linker-integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindMany: vi.fn(),
  documentFindUnique: vi.fn(),
  documentUpdateMany: vi.fn(),
  evidenceSignalCreate: vi.fn(),
  evidenceSignalFindUnique: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  encryptText: vi.fn((s: string) => `enc:${s}`),
  encryptJsonField: vi.fn((value: unknown) => ({ _enc: "ad1", data: JSON.stringify(value), v: 1 })),
}));

const fakePrisma = {
  document: {
    findMany: mocks.documentFindMany,
    findUnique: mocks.documentFindUnique,
    updateMany: mocks.documentUpdateMany,
  },
  evidenceSignal: {
    create: mocks.evidenceSignalCreate,
    findUnique: mocks.evidenceSignalFindUnique,
  },
} as never;

const {
  detectAttachmentNames,
  findAttachmentMatches,
  linkEmailAttachments,
  ATTACHMENT_LINKER_VERSION,
} = await import("../attachment-linker");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.evidenceSignalCreate.mockResolvedValue({ id: "sig_new" });
});

describe("detectAttachmentNames — regex detection", () => {
  it("détecte 'Table de capi Septembre 2024 signeģe.png 136K' (cas Avekapeti — Gmail-listing avec espaces)", () => {
    const text = `Table de capi Septembre 2024 signeģe.png 136K
https://mail.google.com/mail/u/1/?ik=e869b`;
    const candidates = detectAttachmentNames(text);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    // The Gmail-listing pattern captures the FULL multi-word filename (with
    // spaces). The narrower fallback regex would only capture "signeģe.png",
    // which is deduped via the suffix-of-longer guard.
    expect(candidates.some((c) => c.rawName === "Table de capi Septembre 2024 signeģe.png")).toBe(true);
    expect(candidates.some((c) => c.rawName === "signeģe.png")).toBe(false);
  });

  it("détecte plusieurs extensions courantes (pdf, xlsx, docx, pptx, jpg)", () => {
    const text = `Pièces jointes : Pitch.pdf, BP.xlsx, Term-sheet.docx, Memo.pptx, Team.jpg`;
    const candidates = detectAttachmentNames(text);
    const names = candidates.map((c) => c.rawName);
    expect(names).toContain("Pitch.pdf");
    expect(names).toContain("BP.xlsx");
    expect(names).toContain("Term-sheet.docx");
    expect(names).toContain("Memo.pptx");
    expect(names).toContain("Team.jpg");
  });

  it("dédupe les détections multiples du même filename (un seul candidat)", () => {
    const text = `Voir Pitch.pdf en pièce jointe. La version Pitch.pdf est à jour.`;
    const candidates = detectAttachmentNames(text);
    expect(candidates.filter((c) => c.rawName === "Pitch.pdf")).toHaveLength(1);
  });

  it("rejette les filenames génériques (image.png, document.pdf, signature.jpg, etc.)", () => {
    const text = `Voir image.png et document.pdf et signature.jpg`;
    const candidates = detectAttachmentNames(text);
    expect(candidates).toHaveLength(0);
  });

  it("Codex round 12 P2 — rejette filename inside URL https://server.com/Pitch.pdf", () => {
    const text = `Voir https://server.com/path/Pitch.pdf en ligne.`;
    const candidates = detectAttachmentNames(text);
    expect(candidates).toHaveLength(0);
  });

  it("Codex round 12 P2 — rejette filename après '/' (path Unix)", () => {
    const text = `Fichier sous /Users/x/Documents/Pitch.pdf à voir.`;
    const candidates = detectAttachmentNames(text);
    expect(candidates).toHaveLength(0);
  });

  it("Codex round 12 P2 — rejette filename après '\\\\' (path Windows)", () => {
    const text = `Stored at C:\\Users\\foo\\Pitch.pdf today.`;
    const candidates = detectAttachmentNames(text);
    expect(candidates).toHaveLength(0);
  });

  it("Codex round 12 P2 — accepte filename quand il est mid-line sans contexte URL/path", () => {
    const text = `Voir Pitch.pdf en pièce jointe.`;
    const candidates = detectAttachmentNames(text);
    expect(candidates.some((c) => c.rawName === "Pitch.pdf")).toBe(true);
  });

  it("ne détecte rien dans un email sans pièces jointes", () => {
    const text = `Bonjour, j'ai bien reçu votre message. Cordialement.`;
    const candidates = detectAttachmentNames(text);
    expect(candidates).toHaveLength(0);
  });

  it("capte l'offset char correctement", () => {
    const text = `Plain text. Then Pitch.pdf in the middle.`;
    const candidates = detectAttachmentNames(text);
    const pitch = candidates.find((c) => c.rawName === "Pitch.pdf");
    expect(pitch).toBeDefined();
    expect(text.slice(pitch!.charOffset, pitch!.charOffset + pitch!.rawName.length)).toBe("Pitch.pdf");
  });

  it("normalise diacritiques pour le matching", () => {
    const text = `Table de capi Septembre 2024 signeģe.png`;
    const candidates = detectAttachmentNames(text);
    // The normalized value drops diacritics but keeps base letters + extension.
    const c = candidates[0];
    expect(c.normalized).toMatch(/\.png$/);
    expect(c.normalized).toContain("signege.png");
  });
});

describe("findAttachmentMatches — matching against deal docs", () => {
  it("match EXACT case-insensitive → score 1.0, method exact", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Pitch.pdf" },
    ]);
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{ rawName: "pitch.pdf", normalized: "pitch.pdf", charOffset: 0 }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      childDocumentId: "doc_cap",
      attachmentNameInEmail: "pitch.pdf",
      matchMethod: "exact",
      matchScore: 1.0,
    });
  });

  it("match NORMALIZED (diacritics stripped) → score 0.95, method normalized", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Table de capi Septembre 2024 signeģe.png" },
    ]);
    // Email mentions an alternative orthography (no special "ģ")
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{
        rawName: "Table de capi Septembre 2024 signege.png",
        normalized: "table de capi septembre 2024 signege.png",
        charOffset: 0,
      }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchMethod).toBe("normalized");
    expect(matches[0].matchScore).toBe(0.95);
  });

  it("Avekapeti — match exact entre 'Table de capi Septembre 2024 signeģe.png' email mention et doc upload", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap_avekapeti", name: "Table de capi Septembre 2024 signeģe.png" },
    ]);
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_mail_avekapeti",
      emailDealId: "deal_avekapeti",
      candidates: [{
        rawName: "Table de capi Septembre 2024 signeģe.png",
        normalized: "table de capi septembre 2024 signege.png",
        charOffset: 142,
      }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].childDocumentId).toBe("doc_cap_avekapeti");
    expect(matches[0].matchMethod).toBe("exact");
    expect(matches[0].attachmentCharOffset).toBe(142);
  });

  it("aucun match si filename absent du deal", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_unrelated", name: "Other.pdf" },
    ]);
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{ rawName: "Pitch.pdf", normalized: "pitch.pdf", charOffset: 0 }],
    });
    expect(matches).toHaveLength(0);
  });

  it("EXCLUSION : l'email lui-même n'est pas matché (Cross-tenant guard 1)", async () => {
    // findMany doit avoir filtré l'email out via { id: { not: emailDocumentId } }
    mocks.documentFindMany.mockResolvedValue([]);
    await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{ rawName: "Mail.pdf", normalized: "mail.pdf", charOffset: 0 }],
    });
    expect(mocks.documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dealId: "deal_1",
          id: { not: "doc_email" },
        }),
      })
    );
  });

  it("CROSS-TENANT : matching restreint au même deal (Cross-tenant guard 2)", async () => {
    mocks.documentFindMany.mockResolvedValue([]);
    await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_A",
      candidates: [{ rawName: "Pitch.pdf", normalized: "pitch.pdf", charOffset: 0 }],
    });
    // findMany WHERE.dealId is exactly the email's deal — never sees deal_B docs.
    expect(mocks.documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dealId: "deal_A" }),
      })
    );
  });

  it("un doc ne peut être matché que UNE FOIS (dédoublonnage de matches)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_unique", name: "Pitch.pdf" },
    ]);
    // Two different candidate spellings of the same file in the email body
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [
        { rawName: "Pitch.pdf", normalized: "pitch.pdf", charOffset: 0 },
        { rawName: "PITCH.pdf", normalized: "pitch.pdf", charOffset: 100 },
      ],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].attachmentCharOffset).toBe(0); // first wins
  });

  it("matches ordre = ordre des candidates (deterministic)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_b", name: "B.pdf" },
      { id: "doc_a", name: "A.pdf" },
    ]);
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [
        { rawName: "A.pdf", normalized: "a.pdf", charOffset: 10 },
        { rawName: "B.pdf", normalized: "b.pdf", charOffset: 50 },
      ],
    });
    expect(matches.map((m) => m.childDocumentId)).toEqual(["doc_a", "doc_b"]);
  });

  it("Codex round 12 P1 — query DB filtre isLatest + processingStatus + orderBy", async () => {
    mocks.documentFindMany.mockResolvedValue([]);
    await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{ rawName: "Pitch.pdf", normalized: "pitch.pdf", charOffset: 0 }],
    });
    expect(mocks.documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dealId: "deal_1",
          id: { not: "doc_email" },
          isLatest: true,
          processingStatus: { not: "FAILED" },
        }),
        orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
      })
    );
  });

  it("Codex round 12 P1 — same filename old/latest : seul le latest est retourné par la DB filter", async () => {
    // Filter happens at the DB level — the mock returns only the latest one
    // (simulates `where: { isLatest: true }`).
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_latest", name: "Pitch.pdf" },
      // doc_old not returned because isLatest=false would be filtered out
    ]);
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{ rawName: "Pitch.pdf", normalized: "pitch.pdf", charOffset: 0 }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].childDocumentId).toBe("doc_latest");
  });

  it("Codex round 12 P1 — collision filename (deux latest même nom — rare) : FIRST wins (orderBy uploadedAt asc)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_older_first", name: "Pitch.pdf" }, // returned first by orderBy uploadedAt asc
      { id: "doc_newer_second", name: "Pitch.pdf" },
    ]);
    const matches = await findAttachmentMatches(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      candidates: [{ rawName: "Pitch.pdf", normalized: "pitch.pdf", charOffset: 0 }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].childDocumentId).toBe("doc_older_first");
  });
});

describe("Codex round 13 P1 — Document.corpusParentDocumentId IS NOT mutated (signal-only)", () => {
  it("HIGH exact match → signal créé, mais Document.corpusParentDocumentId NON muté (lineage immutable)", async () => {
    mocks.documentFindMany.mockResolvedValue([{ id: "doc_cap", name: "Pitch.pdf" }]);
    mocks.documentFindUnique.mockResolvedValue({ version: 1, dealId: "deal_1" });

    await linkEmailAttachments(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      emailDocumentVersion: 1,
      emailExtractedText: "Voir Pitch.pdf en PJ.",
      emailSourceDate: new Date("2026-04-22T01:03:00Z"),
    });

    // Signal IS created on the child.
    expect(mocks.evidenceSignalCreate).toHaveBeenCalledTimes(1);
    // But NO mutation of Document.corpusParentDocumentId (lineage key F62).
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("NORMALIZED match → signal créé, pas de promotion (cohérent avec HIGH-only règle initiale)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Pitch \"normalized\".pdf" },
    ]);
    mocks.documentFindUnique.mockResolvedValue({ version: 1, dealId: "deal_1" });

    await linkEmailAttachments(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      emailDocumentVersion: 1,
      emailExtractedText: `Voir Pitch normalized.pdf en PJ.`,
      emailSourceDate: null,
    });
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("linkEmailAttachments — orchestrator", () => {
  it("text sans candidate retourne {detected:0, matched:0} sans toucher la DB", async () => {
    const result = await linkEmailAttachments(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      emailDocumentVersion: 1,
      emailExtractedText: "Bonjour, voir mon message ci-dessous.",
      emailSourceDate: new Date("2026-04-22T01:03:00Z"),
    });
    expect(result).toMatchObject({ detectedCandidates: 0, matched: 0, persisted: 0, deduplicated: 0 });
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
    expect(mocks.evidenceSignalCreate).not.toHaveBeenCalled();
  });

  it("flux complet : détection → match → persist signal sur child", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Pitch.pdf" },
    ]);
    mocks.documentFindUnique.mockResolvedValue({ version: 1, dealId: "deal_1" });

    await linkEmailAttachments(fakePrisma, {
      emailDocumentId: "doc_email",
      emailDealId: "deal_1",
      emailDocumentVersion: 1,
      emailExtractedText: `Voir Pitch.pdf en pièce jointe.`,
      emailSourceDate: new Date("2026-04-22T01:03:00Z"),
    });

    expect(mocks.evidenceSignalCreate).toHaveBeenCalledTimes(1);
    const created = mocks.evidenceSignalCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({
      dealId: "deal_1",
      documentId: "doc_cap",
      signalScopeKey: "source_metadata",
      extractionRunId: null,
      extractorVersion: ATTACHMENT_LINKER_VERSION,
      kind: "ATTACHMENT_RELATION",
      confidence: "HIGH",
      sourceMethod: "DETERMINISTIC",
      reportedAt: new Date("2026-04-22T01:03:00Z"),
    });
  });
});
