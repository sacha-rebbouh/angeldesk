/**
 * Phase B7.1 — Static guards on the DocumentAttachmentsPanel surface.
 *
 * The endpoint contract (GET /api/documents/[id]/attachments) is
 * covered by attachments/__tests__/route.test.ts. These guards
 * anchor the UI contract:
 *   - Read-only (no link/unlink actions, no corpusParentDocumentId).
 *   - Uses TanStack Query (granular queryKey per documentId).
 *   - Renders BOTH inbound + outbound when present.
 *   - Confidence + match method visible per entry.
 *   - Mounted as a Tabs tab inside the audit dialog (not stacked
 *     somewhere stale).
 *   - Empty state has a clear hint pointing to the metadata editor.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const panelSource = readFileSync(
  join(__dirname, "..", "document-attachments-panel.tsx"),
  "utf8"
);
const auditDialogSource = readFileSync(
  join(__dirname, "..", "document-extraction-audit-dialog.tsx"),
  "utf8"
);

describe("document-attachments-panel.tsx — B7.1 surface contract", () => {
  it("B7.2 — NEVER touches corpusParentDocumentId (F62 lineage key immutability invariant survives the link/unlink surface)", () => {
    // B7.1's old "fully read-only" guard is obsolete now that B7.2
    // adds link/unlink mutations. The lineage-immutability invariant
    // is what actually matters: ATTACHMENT_RELATION is a signal layer
    // ALONGSIDE the F62 corpusParentDocumentId, never a replacement.
    const codeOnly = panelSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(codeOnly).not.toMatch(/corpusParentDocumentId/);
  });

  it("Codex B7.1 P2 — uses the CENTRALISED queryKey from `queryKeys.documentAttachments.byDocument(documentId)` (single source of truth for invalidation)", () => {
    // The local literal `["document-attachments", documentId]` was
    // replaced by the centralised key so the metadata editor + audit
    // dialog can invalidate via the SAME identifier. Anchor on the
    // import + the queryKey usage.
    expect(panelSource).toMatch(
      /import\s+\{\s*queryKeys\s*\}\s+from\s+["']@\/lib\/query-keys["']/
    );
    expect(panelSource).toMatch(
      /queryKey:\s*queryKeys\.documentAttachments\.byDocument\(documentId\)/
    );
    expect(panelSource).toMatch(/queryFn:\s*\(\)\s*=>\s*fetchAttachments\(documentId\)/);
    // Anti-régression: the local literal key MUST NOT come back.
    expect(panelSource).not.toMatch(/queryKey:\s*\[["']document-attachments["']/);
  });

  it("fetch goes through clerkFetch (auth required), NOT raw fetch", () => {
    expect(panelSource).toMatch(/clerkFetch\(`\/api\/documents\/\$\{documentId\}\/attachments`\)/);
    // Anti-régression on raw fetch.
    const codeOnly = panelSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(codeOnly).not.toMatch(/^\s*await\s+fetch\(/m);
    expect(codeOnly).not.toMatch(/[^a-zA-Z]fetch\(`\/api\/documents/);
  });

  it("fetch is gated on `enabled` prop (no requests for closed dialogs)", () => {
    expect(panelSource).toMatch(/enabled:\s*enabled\s*&&\s*Boolean\(documentId\)/);
  });

  it("renders BOTH inbound (Attaché à) and outbound (Pièces jointes détectées) sections when present", () => {
    expect(panelSource).toMatch(/Pièces jointes détectées/);
    expect(panelSource).toMatch(/Attaché à/);
    // Conditional render — sections only appear if their list is
    // non-empty. The boolean check on length is the gate.
    expect(panelSource).toMatch(/outbound\.length\s*>\s*0\s*&&/);
    expect(panelSource).toMatch(/inbound\.length\s*>\s*0\s*&&/);
  });

  it("each entry shows the related doc name + type + confidence badge + match method + date", () => {
    expect(panelSource).toMatch(/entry\.relatedDocumentName/);
    expect(panelSource).toMatch(/entry\.relatedDocumentType/);
    expect(panelSource).toMatch(/entry\.confidence/);
    expect(panelSource).toMatch(/entry\.matchMethod/);
    expect(panelSource).toMatch(/formatReportedAt\(entry\.reportedAt\)/);
  });

  it("confidence badge uses a clear colour scale (HIGH=green, MEDIUM=amber, LOW=muted)", () => {
    expect(panelSource).toMatch(/HIGH[\s\S]{0,200}emerald/);
    expect(panelSource).toMatch(/MEDIUM[\s\S]{0,200}amber/);
  });

  it("empty state mentions automatic linking + the manual link path (B7.2 UX)", () => {
    expect(panelSource).toMatch(/Aucune pièce jointe détectée/);
    expect(panelSource).toMatch(/lien manuel/);
  });

  it("loading state uses Skeleton (consistency with the rest of the dialog — B5.1 pattern)", () => {
    expect(panelSource).toMatch(/import\s+\{\s*Skeleton\s*\}\s+from\s+["']@\/components\/ui\/skeleton["']/);
    expect(panelSource).toMatch(/<Skeleton/);
  });

  it("error state uses role='alert' for a11y (matches other dialog error surfaces)", () => {
    expect(panelSource).toMatch(/role="alert"[\s\S]{0,400}Impossible de charger les pièces jointes/);
  });

  it("entry types match the route's AttachmentRelationEntry contract (frozen wire format)", () => {
    // Anchor the interface so a refactor that drops a field from
    // the wire response is caught at compile time.
    expect(panelSource).toMatch(/interface\s+AttachmentRelationEntry\s*\{/);
    [
      "signalId",
      "relatedDocumentId",
      "relatedDocumentName",
      "relatedDocumentType",
      "attachmentName",
      "matchMethod",
      "matchScore",
      "confidence",
      "emailSourceDate",
      "reportedAt",
      "createdAt",
    ].forEach((key) => {
      expect(panelSource).toMatch(new RegExp(`\\b${key}\\s*:`));
    });
  });

  it("informational footer explains the audit-preservation contract (auto relations stay in DB even after unlink)", () => {
    expect(panelSource).toMatch(/relations automatiques restent en base[\s\S]{0,200}audit/i);
  });
});

// ============================================================
// B7.2 — Link / Unlink mutations + provenance UI
// ============================================================
describe("document-attachments-panel.tsx — B7.2 link/unlink surface", () => {
  it("per-entry 'Délier' button is rendered for both inbound and outbound entries", () => {
    expect(panelSource).toMatch(/aria-label=\{`Délier \$\{entry\.relatedDocumentName\}`\}/);
    expect(panelSource).toMatch(/title="Délier cette relation"/);
  });

  it("unlink button dispatches the unlink mutation via clerkFetch DELETE", () => {
    expect(panelSource).toMatch(/unlinkSignal\(documentId,\s*signalId\)/);
    expect(panelSource).toMatch(
      /clerkFetch\([\s\S]{0,200}method:\s*["']DELETE["'][\s\S]{0,400}body:\s*JSON\.stringify\(\{\s*signalId\s*\}\)/
    );
  });

  it("unlink mutation onSuccess invalidates the per-document attachments key (granular invalidation)", () => {
    expect(panelSource).toMatch(
      /unlinkMutation[\s\S]{0,2000}invalidateQueries\(\{\s*queryKey:\s*queryKeys\.documentAttachments\.byDocument\(documentId\)/
    );
  });

  it("unlink toast distinguishes 'deleted' (human signal) vs 'suppressed' (auto signal preserved as audit trail)", () => {
    // The toast wording must be different between the two outcomes
    // so the user understands what happened — Codex B7.2 spec:
    // "unlink n'efface pas signal auto sans trace" needs to be
    // visible to the user, not just enforced server-side.
    expect(panelSource).toMatch(/result\.action\s*===\s*["']deleted["'][\s\S]{0,200}supprimé/);
    expect(panelSource).toMatch(/Relation auto masquée[\s\S]{0,100}trace préservée/);
  });

  it("Lier picker uses the Select primitive backed by candidateEmails (no separate fetch)", () => {
    expect(panelSource).toMatch(/function\s+ManualLinkPicker\(/);
    expect(panelSource).toMatch(
      /<Select[\s\S]{0,200}value=\{selectedEmailId\}[\s\S]{0,200}onValueChange=\{setSelectedEmailId\}/
    );
    expect(panelSource).toMatch(/candidateEmails\.map\(\(email\)\s*=>\s*\(/);
  });

  it("link mutation POSTs { emailDocumentId } via clerkFetch (auth required)", () => {
    // The mutationFn passes the selected email id positionally —
    // the inner var is `emailId` (the picker's local name), the
    // helper's second param is named `emailDocumentId`. Anchor on
    // the helper signature instead of the call-site var name.
    expect(panelSource).toMatch(/createManualLink\(documentId,\s*emailId\)/);
    expect(panelSource).toMatch(
      /async\s+function\s+createManualLink\([\s\S]{0,200}emailDocumentId:\s*string/
    );
    // Two assertions: clerkFetch in the helper, POST method present,
    // and a body that JSON.stringify({ emailDocumentId }). Decoupled
    // checks avoid the multi-line gap-counting fragility.
    expect(panelSource).toMatch(
      /async\s+function\s+createManualLink[\s\S]{0,800}clerkFetch\(/
    );
    expect(panelSource).toMatch(
      /async\s+function\s+createManualLink[\s\S]{0,800}method:\s*["']POST["']/
    );
    expect(panelSource).toMatch(/JSON\.stringify\(\{\s*emailDocumentId\s*\}\)/);
  });

  it("link mutation onSuccess invalidates the documentAttachments key + resets the picker selection", () => {
    expect(panelSource).toMatch(
      /linkMutation[\s\S]{0,1000}invalidateQueries\(\{\s*queryKey:\s*queryKeys\.documentAttachments\.byDocument\(documentId\)/
    );
    expect(panelSource).toMatch(/setSelectedEmailId\(""\)/);
  });

  it("link button is disabled until the user picks a candidate email AND the mutation isn't pending", () => {
    expect(panelSource).toMatch(
      /disabled=\{!selectedEmailId\s*\|\|\s*disabled\s*\|\|\s*linkMutation\.isPending\}/
    );
  });

  it("provenance is visually distinct: Sparkles icon + 'Auto' badge for auto, UserPen icon + 'Manuel' for human", () => {
    expect(panelSource).toMatch(/entry\.provenance\s*===\s*["']auto["']\s*\?\s*Sparkles\s*:\s*UserPen/);
    expect(panelSource).toMatch(/entry\.provenance\s*===\s*["']auto["']\s*\?\s*["']Auto["']\s*:\s*["']Manuel["']/);
  });

  it("link picker empty state when the deal has no candidate emails (no infinite-loop edge)", () => {
    expect(panelSource).toMatch(/candidateEmails\.length\s*===\s*0/);
    expect(panelSource).toMatch(/Aucun email disponible/);
  });

  it("AttachmentsPayload type includes candidateEmails (frozen wire contract)", () => {
    expect(panelSource).toMatch(/candidateEmails:\s*CandidateEmail\[\]/);
    expect(panelSource).toMatch(/interface\s+CandidateEmail\s*\{[\s\S]{0,300}id:\s*string;[\s\S]{0,300}name:\s*string;[\s\S]{0,300}sourceDate:\s*string\s*\|\s*null;/);
  });

  it("matchMethod type includes 'manual' (B7.2 new variant — human link signals have matchMethod='manual')", () => {
    expect(panelSource).toMatch(
      /matchMethod:\s*"exact"\s*\|\s*"normalized"\s*\|\s*"manual"\s*\|\s*"unknown"/
    );
    // formatMatchMethod has a "manual" case.
    expect(panelSource).toMatch(/case\s*["']manual["']:\s*\n\s*return\s*["']Manuel["']/);
  });

  it("per-entry unlink button shows a Loader2 spinner while THIS specific signal is being unlinked (per-row pending state)", () => {
    expect(panelSource).toMatch(/unlinkingSignalId\s*===\s*entry\.signalId/);
    expect(panelSource).toMatch(/isUnlinking[\s\S]{0,300}<Loader2/);
  });

  it("unlink button is disabled while pending (no double-fire)", () => {
    expect(panelSource).toMatch(/disabled=\{isUnlinking\}/);
  });
});

describe("document-extraction-audit-dialog.tsx — B7.1 wire-up of the attachments tab", () => {
  it("imports DocumentAttachmentsPanel via direct import (CLAUDE.md no-barrel rule)", () => {
    expect(auditDialogSource).toMatch(
      /import\s+\{\s*DocumentAttachmentsPanel\s*\}\s+from\s+["']\.\/document-attachments-panel["']/
    );
  });

  it("Tabs grid widened from 2 cols to 3 cols for the new 'Liens' tab", () => {
    expect(auditDialogSource).toMatch(/grid w-full grid-cols-3[\s\S]{0,500}TabsTrigger value="links"/);
  });

  it("'Liens' TabsTrigger + TabsContent both wired (no orphan trigger/content)", () => {
    expect(auditDialogSource).toMatch(/<TabsTrigger value="links">Liens<\/TabsTrigger>/);
    expect(auditDialogSource).toMatch(
      /<TabsContent value="links"[\s\S]{0,500}<DocumentAttachmentsPanel/
    );
  });

  it("DocumentAttachmentsPanel receives documentId from audit + enabled gated on the dialog being open", () => {
    expect(auditDialogSource).toMatch(
      /<DocumentAttachmentsPanel[\s\S]{0,400}documentId=\{audit\.document\.id\}[\s\S]{0,200}enabled=\{open\}/
    );
  });
});

// ============================================================
// B7.1 P2 fix-up — query invalidation contract
// ============================================================
describe("query-keys.ts — B7.1 P2 centralised documentAttachments key", () => {
  it("exports queryKeys.documentAttachments.{all, byDocument} (single source of truth for invalidation)", () => {
    const queryKeysSource = readFileSync(
      join(__dirname, "..", "..", "..", "lib", "query-keys.ts"),
      "utf8"
    );
    expect(queryKeysSource).toMatch(/documentAttachments:\s*\{/);
    expect(queryKeysSource).toMatch(/all:\s*\["documentAttachments"\]\s*as const/);
    expect(queryKeysSource).toMatch(
      /byDocument:\s*\(documentId:\s*string\)\s*=>[\s\S]{0,300}documentAttachments\.all,\s*documentId\]\s*as const/
    );
  });
});

describe("document-metadata-dialog.tsx — B7.1 P2 invalidates documentAttachments after a successful patch", () => {
  it("onSuccess invalidates queryKeys.documentAttachments.byDocument(documentId) (no more stale 60s window after metadata edit)", () => {
    const metadataDialogSource = readFileSync(
      join(__dirname, "..", "document-metadata-dialog.tsx"),
      "utf8"
    );
    // The mutation onSuccess MUST invalidate the per-document
    // attachments key, alongside deals.detail + evidenceHealth.
    expect(metadataDialogSource).toMatch(
      /queryKeys\.documentAttachments\.byDocument\(variables\.documentId\)/
    );
    // Granular invalidation, not a wholesale "all" purge — CLAUDE.md
    // React rule.
    expect(metadataDialogSource).not.toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.documentAttachments\.all\s*\}\)/
    );
  });
});

describe("document-extraction-audit-dialog.tsx — B7.1 P2 defense-in-depth invalidation", () => {
  it("audit dialog's onMetadataUpdated callback ALSO invalidates documentAttachments (covers callers that bypass DocumentMetadataDialog)", () => {
    // The metadata dialog already invalidates, but a future surface
    // (e.g. an inline documents-tab edit) might invoke
    // onMetadataUpdated via another path. Anchoring both layers
    // makes the staleness fix structurally complete.
    expect(auditDialogSource).toMatch(
      /onMetadataUpdated=\{\(updatedId\)\s*=>\s*\{[\s\S]{0,800}queryKeys\.documentAttachments\.byDocument\(updatedId\)/
    );
  });

  it("imports queryKeys from @/lib/query-keys (needed by the invalidation above)", () => {
    expect(auditDialogSource).toMatch(
      /import\s+\{\s*queryKeys\s*\}\s+from\s+["']@\/lib\/query-keys["']/
    );
  });
});
