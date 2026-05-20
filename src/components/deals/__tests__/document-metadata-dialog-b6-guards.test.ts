/**
 * Phase B6.1 — Static guards on the Metadata Editor dialog + its
 * wire-up in the audit dialog + documents-tab.
 *
 * The endpoint contract (PATCH /api/documents/[id]/metadata) is
 * covered by route.test.ts; these guards anchor the UI contract:
 *   - dialog renders the sourceDate input + uses native date picker
 *     (consistent with the rest of the codebase: type="date");
 *   - submit goes through clerkFetch (auth) — never raw fetch;
 *   - success invalidates BOTH the deal detail AND the evidenceHealth
 *     query (a missing-date signal must clear without manual refresh);
 *   - audit dialog header surfaces the "Modifier la date" button with
 *     aria-label + responsive label collapse (same pattern as B5.2);
 *   - documents-tab passes dealId + sourceDate through so the metadata
 *     dialog has full context;
 *   - Metadata dialog is mounted as a SIBLING of the audit Dialog
 *     (Radix Dialog instances are independent — nesting breaks the
 *     modal-over-modal stacking).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const metadataDialogSource = readFileSync(
  join(__dirname, "..", "document-metadata-dialog.tsx"),
  "utf8"
);
const auditDialogSource = readFileSync(
  join(__dirname, "..", "document-extraction-audit-dialog.tsx"),
  "utf8"
);
const documentsTabSource = readFileSync(
  join(__dirname, "..", "documents-tab.tsx"),
  "utf8"
);

describe("document-metadata-dialog.tsx — B6.1 metadata editor contract", () => {
  it("uses native <Input type=\"date\"> for the sourceDate field (codebase convention)", () => {
    // The rest of the project uses native date inputs (see costs-
    // dashboard-v2.tsx). Avoids dragging a Calendar primitive
    // dependency for a simple single-date picker.
    expect(metadataDialogSource).toMatch(/<Input[\s\S]{0,400}type="date"/);
  });

  it("input is bound to a controlled state (sourceDateInput / setSourceDateInput) — no uncontrolled drift", () => {
    expect(metadataDialogSource).toMatch(/sourceDateInput,\s*setSourceDateInput\]\s*=\s*useState<string>/);
    expect(metadataDialogSource).toMatch(/value=\{sourceDateInput\}/);
    expect(metadataDialogSource).toMatch(/onChange=\{[\s\S]{0,200}setSourceDateInput/);
  });

  it("caps the date picker at today (max=today) — UI hint that future content dates are wrong", () => {
    // Server doesn't enforce this (a press release with an embargo
    // could be legitimately future-dated), so it's a soft UI hint, not
    // a hard block.
    expect(metadataDialogSource).toMatch(/max=\{toDateInputValue\(new Date\(\)\)\}/);
  });

  it("submit fires PATCH /api/documents/[id]/metadata via clerkFetch (NEVER raw fetch — auth required)", () => {
    expect(metadataDialogSource).toMatch(
      /clerkFetch\(`\/api\/documents\/\$\{documentId\}\/metadata`,\s*\{[\s\S]{0,400}method:\s*["']PATCH["']/
    );
    // Anti-regression: never bypass clerkFetch on the auth-bearing endpoint.
    expect(metadataDialogSource).not.toMatch(
      /^\s*await\s+fetch\(/m
    );
    expect(metadataDialogSource).not.toMatch(
      /[^a-zA-Z]fetch\(`\/api\/documents/
    );
  });

  it("submit body is a JSON-serialized MetadataPatchBody delta (only changed fields included)", () => {
    // B6.2 — the dialog now sends a delta-aware body (sourceDate /
    // type / sourceKind, each optional). Anchor on `JSON.stringify(body)`
    // where `body: MetadataPatchBody` is constructed from the user's
    // changes — anti-regression for any future refactor that drops
    // delta detection and sends the full state every time (would
    // wrongly trigger backfill protections + audit-trail entries with
    // identical previousValue/newValue).
    expect(metadataDialogSource).toMatch(/body:\s*JSON\.stringify\(body\)/);
    expect(metadataDialogSource).toMatch(/interface\s+MetadataPatchBody\s*\{[\s\S]{0,400}sourceDate\?\s*:[\s\S]{0,200}type\?\s*:[\s\S]{0,200}sourceKind\?\s*:/);
  });

  it("onSuccess invalidates BOTH the deal detail AND the evidenceHealth query (missing-date signal must clear)", () => {
    // CLAUDE.md rule: granular query invalidation (not queryKey: ["all"]).
    // The deal detail invalidation refreshes the row in the documents
    // tab; the evidenceHealth invalidation clears the "missing date"
    // warning without a manual refresh — that's the B6.1 spec line
    // "evidenceHealth invalidée".
    expect(metadataDialogSource).toMatch(
      /queryKeys\.deals\.detail\(document\.dealId\)/
    );
    expect(metadataDialogSource).toMatch(
      /queryKeys\.evidenceHealth\.byDeal\(document\.dealId\)/
    );
  });

  it("server errors surface in a role=alert region (a11y) + as a sonner toast", () => {
    // Two surfaces because the user can re-submit immediately while
    // the toast is still up — keeping the alert region inline gives
    // a stable error message.
    expect(metadataDialogSource).toMatch(/role="alert"[\s\S]{0,200}serverError/);
    expect(metadataDialogSource).toMatch(/toast\.error\(/);
  });

  it("aria-describedby wires the input help text (sr users get the format hint)", () => {
    expect(metadataDialogSource).toMatch(/aria-describedby="metadata-source-date-help"/);
    expect(metadataDialogSource).toMatch(/id="metadata-source-date-help"/);
  });

  it("dialog renders a Pencil icon in the title — visual cue matches the audit-header button", () => {
    // B12.3 P1 #4 — both icons swapped from CalendarDays to Pencil to
    // accurately reflect what the dialog edits (date + type +
    // sourceKind, not just date). The cue contract (button icon ===
    // dialog title icon) is preserved.
    expect(metadataDialogSource).toMatch(/<Pencil\s+className/);
  });

  it("dialog has a Cancel button (DialogClose) AND a primary Save button (submit) — explicit dual-action footer", () => {
    expect(metadataDialogSource).toMatch(
      /<DialogClose\s+asChild>[\s\S]{0,400}Annuler/
    );
    expect(metadataDialogSource).toMatch(
      /<Button\s+type="submit"[\s\S]{0,800}disabled=\{[^}]*mutation\.isPending[\s\S]{0,800}Enregistrer/
    );
  });

  it("submit button is disabled while the mutation is pending AND when nothing has changed (no double-submit, no empty-submit)", () => {
    // B6.2 — disabled condition switched from `!sourceDateInput` to
    // `!hasChanges` since the user might only change type / sourceKind
    // (sourceDate would stay non-empty). `hasChanges` is the delta
    // detection useMemo'd from current vs initial values.
    expect(metadataDialogSource).toMatch(
      /<Button\s+type="submit"\s+disabled=\{mutation\.isPending\s*\|\|\s*!hasChanges\}/
    );
    expect(metadataDialogSource).toMatch(/const\s+hasChanges\s*=\s*useMemo\(/);
  });
});

describe("document-extraction-audit-dialog.tsx — B6.1 metadata editor wire-up", () => {
  it("imports DocumentMetadataDialog (direct import, NOT a barrel — CLAUDE.md React rule)", () => {
    expect(auditDialogSource).toMatch(
      /import\s+\{\s*DocumentMetadataDialog\s*\}\s+from\s+["']\.\/document-metadata-dialog["']/
    );
  });

  it("imports the Pencil icon (header button cue)", () => {
    // B12.3 P1 #4 — icon swap. See the symmetric metadata-dialog
    // title icon test above for the rationale.
    expect(auditDialogSource).toMatch(/\bPencil\b[\s\S]{0,400}lucide-react/);
  });

  it("declares local metadataDialogOpen state so the button + dialog share a single open lifecycle", () => {
    expect(auditDialogSource).toMatch(/metadataDialogOpen,\s*setMetadataDialogOpen\]\s*=\s*useState\(false\)/);
  });

  it("header action cluster includes a 'Modifier les métadonnées' Button wired to setMetadataDialogOpen(true)", () => {
    // B6.2.1 (Codex P2) — label widened to match the dialog's actual
    // scope (date + type + sourceKind). The legacy "Modifier la date"
    // string MUST be gone — anti-régression for a future B6.x that
    // re-narrows it.
    expect(auditDialogSource).toMatch(
      /onClick=\{\(\)\s*=>\s*setMetadataDialogOpen\(true\)\}[\s\S]{0,800}Modifier les métadonnées/
    );
    expect(auditDialogSource).toMatch(/aria-label="Modifier les métadonnées du document"/);
    // The old wording MUST NOT appear anywhere in the button cluster.
    expect(auditDialogSource).not.toMatch(/aria-label="Modifier la date du document"/);
  });

  it("header button label collapses on narrow widths (hidden md:inline) — consistent with B5.2 actions", () => {
    expect(auditDialogSource).toMatch(
      /<span\s+className="hidden md:inline">Modifier les métadonnées<\/span>/
    );
  });

  it("DocumentMetadataDialog is mounted as a SIBLING of the audit Dialog (not nested inside <Dialog>)", () => {
    // The audit return is now a fragment containing the audit Dialog
    // and the metadata Dialog as peers. Asserts the structural shape.
    // Three anchors so a future refactor that re-nests is caught:
    //   1. fragment opens (`<>`) right after the audit-return comment;
    //   2. audit Dialog ends (`</Dialog>`) before the metadata mount;
    //   3. metadata mount is OUTSIDE any Dialog (no `<Dialog>` between
    //      the audit `</Dialog>` and `<DocumentMetadataDialog`).
    expect(auditDialogSource).toMatch(/<>\s*<Dialog\s+open=\{open\}/);
    const auditClosePos = auditDialogSource.lastIndexOf("</Dialog>");
    const metadataMountPos = auditDialogSource.indexOf("<DocumentMetadataDialog");
    expect(metadataMountPos).toBeGreaterThan(auditClosePos);
    // No re-open of a <Dialog> between the audit close and the
    // metadata mount → metadata is a peer, not nested.
    const between = auditDialogSource.slice(auditClosePos, metadataMountPos);
    expect(between).not.toMatch(/<Dialog\s/);
  });

  it("metadata dialog receives the doc context (id + dealId + name + sourceDate) from the audit dialog's parent prop", () => {
    // We pull dealId + sourceDate from `document` (the parent prop,
    // widened for B6.1), NOT from `audit.document` (which doesn't
    // include dealId in its endpoint shape). Anchor on this contract
    // so a future refactor that tries to read from audit.document
    // surfaces an empty dealId (the bug Codex would catch).
    expect(auditDialogSource).toMatch(
      /<DocumentMetadataDialog[\s\S]{0,1000}document\.dealId/
    );
    expect(auditDialogSource).toMatch(
      /<DocumentMetadataDialog[\s\S]{0,1000}sourceDate:\s*document\.sourceDate\s*\?\?\s*null/
    );
  });

  it("metadata dialog's onMetadataUpdated invalidates the audit query (so the dialog reflects the new sourceDate immediately)", () => {
    expect(auditDialogSource).toMatch(
      /onMetadataUpdated=\{\(updatedId\)\s*=>\s*\{[\s\S]{0,500}invalidateQueries\(\{\s*queryKey:\s*auditQueryKey/
    );
  });

  it("ExtractionAuditDialogProps.document interface is WIDENED with optional dealId + sourceDate", () => {
    // Optional so callers without the full Document context don't have
    // to be refactored. The metadata button gates on dealId being
    // present so partial-context callers gracefully skip.
    expect(auditDialogSource).toMatch(/dealId\?\s*:\s*string;/);
    expect(auditDialogSource).toMatch(/sourceDate\?\s*:\s*string\s*\|\s*Date\s*\|\s*null;/);
  });
});

describe("documents-tab.tsx — B6.1 forwards dealId + sourceDate to the audit dialog", () => {
  it("the audit dialog invocation forwards dealId + sourceDate from the auditDoc / dealId prop", () => {
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,1000}dealId,/
    );
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,1000}sourceDate:\s*auditDoc\.sourceDate\s*\?\?\s*null/
    );
  });
});

// ============================================================
// B6.2 — Edit document type + sourceKind (strict UI slice)
// ============================================================
describe("document-metadata-dialog.tsx — B6.2 type + sourceKind selects", () => {
  it("renders a Type select wired to setTypeInput (controlled state)", () => {
    expect(metadataDialogSource).toMatch(
      /<Select\s+value=\{typeInput\}[\s\S]{0,400}onValueChange=\{[\s\S]{0,200}setTypeInput/
    );
    expect(metadataDialogSource).toMatch(/typeInput,\s*setTypeInput\]\s*=\s*useState/);
  });

  it("renders a Source Kind select wired to setSourceKindInput", () => {
    expect(metadataDialogSource).toMatch(
      /<Select\s+value=\{sourceKindInput\}[\s\S]{0,400}onValueChange=\{[\s\S]{0,200}setSourceKindInput/
    );
    expect(metadataDialogSource).toMatch(/sourceKindInput,\s*setSourceKindInput\]\s*=\s*useState/);
  });

  it("Type select lists all 11 Prisma DocumentType enum values (no truncation)", () => {
    // Anchor on each enum value — a regression that drops one would
    // make a doc with that type un-selectable.
    [
      "PITCH_DECK",
      "FINANCIAL_MODEL",
      "CAP_TABLE",
      "TERM_SHEET",
      "INVESTOR_MEMO",
      "FINANCIAL_STATEMENTS",
      "LEGAL_DOCS",
      "MARKET_STUDY",
      "PRODUCT_DEMO",
      "CALL_TRANSCRIPT",
      "OTHER",
    ].forEach((value) => {
      expect(metadataDialogSource).toMatch(
        new RegExp(`value:\\s*["']${value}["']`)
      );
    });
  });

  it("Source Kind select lists all 3 Prisma DocumentSourceKind enum values", () => {
    ["FILE", "EMAIL", "NOTE"].forEach((value) => {
      expect(metadataDialogSource).toMatch(
        new RegExp(`value:\\s*["']${value}["']`)
      );
    });
  });

  it("imports the enums from @prisma/client (typed source of truth, NOT a free string list)", () => {
    // The Zod-side validation on the server uses the live Prisma
    // enum; the client side does the same so the two never drift.
    expect(metadataDialogSource).toMatch(
      /import\s+\{\s*DocumentSourceKind,\s*DocumentType\s*\}\s+from\s+["']@prisma\/client["']/
    );
  });

  it("seeds typeInput + sourceKindInput from `document.type` / `document.sourceKind` on open (pre-fill)", () => {
    expect(metadataDialogSource).toMatch(
      /setTypeInput\(document\.type\s*\?\?\s*""\)/
    );
    expect(metadataDialogSource).toMatch(
      /setSourceKindInput\(document\.sourceKind\s*\?\?\s*""\)/
    );
  });

  it("hasChanges memo compares all three fields against their initial values (delta detection)", () => {
    // The memo gates the submit button + the body construction.
    // Anchor on the three-way comparison so a refactor that forgets
    // a field (e.g. only checks sourceDate) is caught.
    expect(metadataDialogSource).toMatch(
      /sourceDateInput\s*!==\s*initialSourceDate[\s\S]{0,200}typeInput\s*!==\s*initialType[\s\S]{0,200}sourceKindInput\s*!==\s*initialSourceKind/
    );
  });

  it("body construction in handleSubmit is DELTA-aware (only changed fields are added)", () => {
    // For each field, the body builder must check `input !== initial`
    // before including it. Sending unchanged fields would create
    // bogus audit-trail entries with previousValue === newValue.
    expect(metadataDialogSource).toMatch(
      /if\s*\(\s*sourceDateInput\s*!==\s*initialSourceDate\s*\)\s*\{[\s\S]{0,500}body\.sourceDate\s*=\s*sourceDateInput/
    );
    expect(metadataDialogSource).toMatch(
      /if\s*\(typeInput\s*!==\s*initialType[\s\S]{0,100}body\.type\s*=\s*typeInput/
    );
    expect(metadataDialogSource).toMatch(
      /if\s*\(sourceKindInput\s*!==\s*initialSourceKind[\s\S]{0,100}body\.sourceKind\s*=\s*sourceKindInput/
    );
  });

  it("modal title widened from 'Modifier la date' to 'Modifier les métadonnées' (B6.2 covers more than date)", () => {
    expect(metadataDialogSource).toMatch(/Modifier les métadonnées/);
    // The legacy title MUST be gone — keeping it would mis-describe
    // the modal which now covers type + sourceKind too.
    expect(metadataDialogSource).not.toMatch(/Modifier la date du document/);
  });

  it("Type select trigger + Source Kind select trigger expose aria-label (icon-less label backup)", () => {
    expect(metadataDialogSource).toMatch(/aria-label="Type de document"/);
    expect(metadataDialogSource).toMatch(/aria-label="Nature du document"/);
  });

  it("a hint under the Type select tells the user the implication on Evidence Health", () => {
    // Cue from the spec: "Changer type doit faire disparaître /
    // apparaître les bons warnings Evidence Health". The hint sets
    // the user's expectation BEFORE they submit.
    expect(metadataDialogSource).toMatch(
      /Changer le type peut résoudre ou créer des signaux Evidence Health/
    );
  });

  it("onSuccess still invalidates BOTH deals.detail AND evidenceHealth.byDeal (B6.1 contract preserved for B6.2 changes too)", () => {
    // Re-anchor here because a regression that forgets to invalidate
    // evidence-health after a type change would leave stale "missing-
    // pitch-date" / "wrong-doc-type" warnings on screen.
    expect(metadataDialogSource).toMatch(/queryKeys\.deals\.detail\(document\.dealId\)/);
    expect(metadataDialogSource).toMatch(
      /queryKeys\.evidenceHealth\.byDeal\(document\.dealId\)/
    );
  });
});

describe("document-extraction-audit-dialog.tsx — B6.2 forwards type + sourceKind", () => {
  it("ExtractionAuditDialogProps.document widened with optional type + sourceKind", () => {
    expect(auditDialogSource).toMatch(/type\?\s*:\s*string\s*\|\s*null;/);
    expect(auditDialogSource).toMatch(/sourceKind\?\s*:\s*string\s*\|\s*null;/);
  });

  it("metadata dialog receives type + sourceKind from the document prop (pre-fill works)", () => {
    expect(auditDialogSource).toMatch(/<DocumentMetadataDialog[\s\S]{0,1500}type:\s*\(document\.type\s*\?\?\s*null\)/);
    expect(auditDialogSource).toMatch(/<DocumentMetadataDialog[\s\S]{0,1500}sourceKind:\s*\(document\.sourceKind\s*\?\?\s*null\)/);
  });
});

describe("documents-tab.tsx — B6.2 forwards type + sourceKind", () => {
  it("auditDoc.type + auditDoc.sourceKind are forwarded through the audit dialog invocation", () => {
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,1500}type:\s*auditDoc\.type\s*\?\?\s*null/
    );
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,1500}sourceKind:\s*auditDoc\.sourceKind\s*\?\?\s*null/
    );
  });
});

// ============================================================
// B6.3 — Email metadata editor (receivedAt, sourceAuthor, sourceSubject)
// ============================================================
describe("document-metadata-dialog.tsx — B6.3 email metadata inputs", () => {
  it("renders a 'received at' date input (controlled state, bound to setReceivedAtInput)", () => {
    expect(metadataDialogSource).toMatch(/receivedAtInput,\s*setReceivedAtInput\]\s*=\s*useState/);
    expect(metadataDialogSource).toMatch(
      /id="metadata-received-at"[\s\S]{0,500}value=\{receivedAtInput\}/
    );
    expect(metadataDialogSource).toMatch(
      /<Input[\s\S]{0,500}id="metadata-received-at"[\s\S]{0,500}type="date"/
    );
  });

  it("renders a 'sourceAuthor' text input (controlled state)", () => {
    expect(metadataDialogSource).toMatch(
      /sourceAuthorInput,\s*setSourceAuthorInput\]\s*=\s*useState/
    );
    expect(metadataDialogSource).toMatch(
      /<Input[\s\S]{0,500}id="metadata-source-author"[\s\S]{0,500}value=\{sourceAuthorInput\}/
    );
    // Cap at 500 chars (server-side Zod max).
    expect(metadataDialogSource).toMatch(
      /id="metadata-source-author"[\s\S]{0,500}maxLength=\{500\}/
    );
  });

  it("renders a 'sourceSubject' text input (controlled state)", () => {
    expect(metadataDialogSource).toMatch(
      /sourceSubjectInput,\s*setSourceSubjectInput\]\s*=\s*useState/
    );
    expect(metadataDialogSource).toMatch(
      /<Input[\s\S]{0,500}id="metadata-source-subject"[\s\S]{0,500}value=\{sourceSubjectInput\}/
    );
  });

  it("seeds the 3 email inputs from document.* on open (pre-fill)", () => {
    expect(metadataDialogSource).toMatch(/setReceivedAtInput\(toDateInputValue\(document\.receivedAt\)\)/);
    expect(metadataDialogSource).toMatch(/setSourceAuthorInput\(document\.sourceAuthor\s*\?\?\s*""\)/);
    expect(metadataDialogSource).toMatch(/setSourceSubjectInput\(document\.sourceSubject\s*\?\?\s*""\)/);
  });

  it("hasChanges memo compares ALL six fields (sourceDate / type / sourceKind / receivedAt / sourceAuthor / sourceSubject) against initial values", () => {
    expect(metadataDialogSource).toMatch(
      /receivedAtInput\s*!==\s*initialReceivedAt[\s\S]{0,200}sourceAuthorInput\s*!==\s*initialSourceAuthor[\s\S]{0,200}sourceSubjectInput\s*!==\s*initialSourceSubject/
    );
  });

  it("MetadataPatchBody type includes the 3 email fields (forward-compat)", () => {
    expect(metadataDialogSource).toMatch(
      /interface\s+MetadataPatchBody\s*\{[\s\S]{0,600}receivedAt\?\s*:\s*string\s*\|\s*null;[\s\S]{0,200}sourceAuthor\?\s*:\s*string\s*\|\s*null;[\s\S]{0,200}sourceSubject\?\s*:\s*string\s*\|\s*null;/
    );
  });

  it("submit body is DELTA-aware for the 3 email fields too (empty-string → null, trimmed)", () => {
    // Anchored on the conditional assignment pattern: only add to
    // body if input differs from initial. The assignment is
    // `body.sourceX = ...trim()...`, so the body-write appears
    // BEFORE the trim in source order.
    expect(metadataDialogSource).toMatch(
      /if\s*\(receivedAtInput\s*!==\s*initialReceivedAt\)\s*\{[\s\S]{0,500}body\.receivedAt/
    );
    expect(metadataDialogSource).toMatch(
      /if\s*\(sourceAuthorInput\s*!==\s*initialSourceAuthor\)\s*\{[\s\S]{0,400}body\.sourceAuthor\s*=[\s\S]{0,300}sourceAuthorInput\.trim\(\)/
    );
    expect(metadataDialogSource).toMatch(
      /if\s*\(sourceSubjectInput\s*!==\s*initialSourceSubject\)\s*\{[\s\S]{0,400}body\.sourceSubject\s*=[\s\S]{0,300}sourceSubjectInput\.trim\(\)/
    );
  });

  it("submit body empties resolve to `null` (explicit clear semantics)", () => {
    // The body builder converts an empty-trimmed string to `null`
    // (so the server clears the column via explicit null vs leaves
    // it untouched via undefined). Anchor explicitly.
    expect(metadataDialogSource).toMatch(/sourceAuthorInput\.trim\(\)\s*===\s*""\s*\?\s*null/);
    expect(metadataDialogSource).toMatch(/sourceSubjectInput\.trim\(\)\s*===\s*""\s*\?\s*null/);
    expect(metadataDialogSource).toMatch(/receivedAtInput\s*===\s*""\)\s*\{[\s\S]{0,200}body\.receivedAt\s*=\s*null/);
  });

  it("Email metadata section has a visual divider + heading 'Métadonnées email'", () => {
    // Visual grouping anchors the email fields as a related cluster
    // (vs free-floating fields below sourceKind).
    expect(metadataDialogSource).toMatch(/border-t[\s\S]{0,500}Métadonnées email/);
  });

  it("aria-describedby + Label wired on the 3 email inputs (a11y)", () => {
    expect(metadataDialogSource).toMatch(/<Label\s+htmlFor="metadata-received-at">/);
    expect(metadataDialogSource).toMatch(/<Label\s+htmlFor="metadata-source-author">/);
    expect(metadataDialogSource).toMatch(/<Label\s+htmlFor="metadata-source-subject">/);
    expect(metadataDialogSource).toMatch(/aria-describedby="metadata-received-at-help"/);
    expect(metadataDialogSource).toMatch(/aria-describedby="metadata-source-author-help"/);
    expect(metadataDialogSource).toMatch(/aria-describedby="metadata-source-subject-help"/);
  });
});

describe("document-extraction-audit-dialog.tsx — B6.3 forwards email metadata", () => {
  it("ExtractionAuditDialogProps.document widened with optional receivedAt + sourceAuthor + sourceSubject", () => {
    expect(auditDialogSource).toMatch(/receivedAt\?\s*:\s*string\s*\|\s*Date\s*\|\s*null;/);
    expect(auditDialogSource).toMatch(/sourceAuthor\?\s*:\s*string\s*\|\s*null;/);
    expect(auditDialogSource).toMatch(/sourceSubject\?\s*:\s*string\s*\|\s*null;/);
  });

  it("metadata dialog receives email metadata from the document prop", () => {
    expect(auditDialogSource).toMatch(
      /<DocumentMetadataDialog[\s\S]{0,2500}receivedAt:\s*document\.receivedAt\s*\?\?\s*null/
    );
    expect(auditDialogSource).toMatch(
      /<DocumentMetadataDialog[\s\S]{0,2500}sourceAuthor:\s*document\.sourceAuthor\s*\?\?\s*null/
    );
    expect(auditDialogSource).toMatch(
      /<DocumentMetadataDialog[\s\S]{0,2500}sourceSubject:\s*document\.sourceSubject\s*\?\?\s*null/
    );
  });
});

describe("documents-tab.tsx — B6.3 forwards email metadata", () => {
  it("auditDoc.receivedAt + sourceAuthor + sourceSubject are forwarded through the audit dialog invocation", () => {
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,2000}receivedAt:\s*auditDoc\.receivedAt\s*\?\?\s*null/
    );
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,2000}sourceAuthor:\s*auditDoc\.sourceAuthor\s*\?\?\s*null/
    );
    expect(documentsTabSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,2000}sourceSubject:\s*auditDoc\.sourceSubject\s*\?\?\s*null/
    );
  });
});

// ============================================================
// B7.3 — Email candidates picker inside the metadata dialog
// ============================================================
describe("document-metadata-dialog.tsx — B7.3 email-candidates picker", () => {
  it("exports / uses EmailCandidatesPicker subcomponent (single file, keeps the surface contained)", () => {
    expect(metadataDialogSource).toMatch(/function\s+EmailCandidatesPicker\(/);
    expect(metadataDialogSource).toMatch(/<EmailCandidatesPicker[\s\S]{0,400}documentId=\{document\.id\}/);
  });

  it("Picker fetches via clerkFetch GET /email-candidates (no raw fetch — auth required)", () => {
    expect(metadataDialogSource).toMatch(
      /clerkFetch\(`\/api\/documents\/\$\{documentId\}\/email-candidates`\)/
    );
    const codeOnly = metadataDialogSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(codeOnly).not.toMatch(/^\s*await\s+fetch\(/m);
  });

  it("Picker uses the CENTRALISED queryKey via queryKeys.documentEmailCandidates.byDocument(documentId)", () => {
    expect(metadataDialogSource).toMatch(
      /queryKey:\s*queryKeys\.documentEmailCandidates\.byDocument\(documentId\)/
    );
    // Anti-régression: no literal `["document-email-candidates", ...]`.
    expect(metadataDialogSource).not.toMatch(/queryKey:\s*\[["']document-email-candidates["']/);
  });

  it("Picker fetch is gated on `enabled` prop (no requests while dialog is closed)", () => {
    expect(metadataDialogSource).toMatch(
      /enabled:\s*enabled\s*&&\s*Boolean\(documentId\)/
    );
  });

  it("Picker is READ-ONLY: NO useMutation, NO POST/PUT/DELETE to /email-candidates (mutation flows through PATCH /metadata)", () => {
    // The picker's onPick callback only updates LOCAL state (the
    // sourceDateInput in the parent form). It does NOT fire a
    // mutation directly — the user reviews + saves.
    const pickerMatch = metadataDialogSource.match(
      /function\s+EmailCandidatesPicker[\s\S]+?\n\}\s*\n/
    );
    expect(pickerMatch).not.toBeNull();
    const pickerBody = pickerMatch?.[0] ?? "";
    expect(pickerBody).not.toMatch(/useMutation/);
    expect(pickerBody).not.toMatch(/method:\s*["'](POST|PUT|DELETE|PATCH)["']/);
  });

  it("Picker renders ONE button per candidate with aria-label naming the date", () => {
    expect(metadataDialogSource).toMatch(
      /aria-label=\{`Utiliser \$\{formatCandidateSentAt\(candidate\.sentAt\)\} comme date du document`\}/
    );
  });

  it("Picker marks the primary candidate with disabled button + 'Actuel' label (vs 'Utiliser cette date' for others)", () => {
    expect(metadataDialogSource).toMatch(/candidate\.isPrimary\s*\?\s*["']Actuel["']\s*:\s*["']Utiliser cette date["']/);
    expect(metadataDialogSource).toMatch(/disabled=\{candidate\.isPrimary\}/);
  });

  it("Picker visually highlights the primary candidate (border-emerald-300 + bg-emerald-50)", () => {
    expect(metadataDialogSource).toMatch(/candidate\.isPrimary\s*\?\s*"border-emerald-300 bg-emerald-50"/);
  });

  it("Picker hides itself when candidates.length === 0 (early return null — no empty section)", () => {
    expect(metadataDialogSource).toMatch(/if\s*\(candidates\.length\s*===\s*0\)\s*return null/);
  });

  it("Picker surfaces inferredConfidence + hasManualOverride badges (so user sees the system's state at a glance)", () => {
    expect(metadataDialogSource).toMatch(/Confiance haute/);
    expect(metadataDialogSource).toMatch(/Confiance moyenne/);
    expect(metadataDialogSource).toMatch(/Override manuel actif/);
  });

  it("onPick callback PRE-FILLS sourceDateInput (user still has to Save — no auto-commit)", () => {
    // The picker is wired to the parent's setSourceDateInput, NOT
    // to a mutation. Reviewing + clicking "Enregistrer" is what
    // commits. This protects against accidental clicks.
    expect(metadataDialogSource).toMatch(
      /<EmailCandidatesPicker[\s\S]{0,600}onPick=\{\(sentAt\)\s*=>\s*\{[\s\S]{0,400}setSourceDateInput\(toDateInputValue\(sentAt\)\)/
    );
  });

  it("Picker uses formatCandidateSentAt for display (consistent fr-FR formatting)", () => {
    expect(metadataDialogSource).toMatch(/function\s+formatCandidateSentAt/);
    expect(metadataDialogSource).toMatch(/toLocaleString\("fr-FR"/);
  });

  it("EmailCandidatesPayload type is frozen with the documented fields (wire contract)", () => {
    expect(metadataDialogSource).toMatch(/interface\s+EmailCandidatesPayload\s*\{/);
    expect(metadataDialogSource).toMatch(/interface\s+EmailCandidate\s*\{[\s\S]{0,300}from:\s*string\s*\|\s*null;[\s\S]{0,200}sentAt:\s*string;[\s\S]{0,200}subject:\s*string\s*\|\s*null;[\s\S]{0,200}isPrimary:\s*boolean;/);
    ["currentSourceDate", "inferredConfidence", "inferredFrom", "candidates", "hasManualOverride"].forEach((key) => {
      expect(metadataDialogSource).toMatch(new RegExp(`\\b${key}:`));
    });
  });

  it("Metadata patch onSuccess invalidates documentEmailCandidates key (after sourceDate change, picker's primary highlight refreshes)", () => {
    expect(metadataDialogSource).toMatch(
      /queryKeys\.documentEmailCandidates\.byDocument\(variables\.documentId\)/
    );
  });
});

describe("query-keys.ts — B7.3 documentEmailCandidates key", () => {
  it("exports queryKeys.documentEmailCandidates.{all, byDocument} (single source of truth for picker invalidation)", () => {
    const queryKeysSource = readFileSync(
      join(__dirname, "..", "..", "..", "lib", "query-keys.ts"),
      "utf8"
    );
    expect(queryKeysSource).toMatch(/documentEmailCandidates:\s*\{/);
    expect(queryKeysSource).toMatch(/all:\s*\["documentEmailCandidates"\]\s*as const/);
    expect(queryKeysSource).toMatch(
      /byDocument:\s*\(documentId:\s*string\)\s*=>[\s\S]{0,300}documentEmailCandidates\.all,\s*documentId\]\s*as const/
    );
  });
});
