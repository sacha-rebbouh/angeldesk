/**
 * Phase B8.2 — Drill-down contradiction.
 *
 * Codex B8.1 P2 flagged: "Voir <doc>" on contradictions opened the
 * metadata editor instead of a real drill-down or document view. B8.2
 * lands `ContradictionDrillDownDialog` to fix this. Tests here anchor:
 *
 *   1. The drill-down replaces the per-doc Voir buttons (single
 *      "Comparer X documents" action → drill-down opens).
 *   2. The drill-down lists every signal with classification + amount
 *      + currency, grouped by document (so a doc that claims two
 *      different values for the same year is surfaced as a single
 *      card with two amounts, not two duplicate cards).
 *   3. Per-signal actions go to the REAL inspection paths:
 *        - "Aperçu de la pièce" → `DocumentPreviewDialog`
 *        - "Voir l'audit d'extraction" → `DocumentExtractionAuditDialog`
 *   4. IDOR: `dealId` passed to the audit dialog is the panel's prop,
 *      NEVER a value derived from a fetched document.
 *   5. Auth: on-demand fetch goes through `clerkFetch` only.
 *   6. Positioning rule (CLAUDE.md): no GO/NO_GO/PASS/INVESTIR/REJETER
 *      in user-facing strings.
 *
 * Static-text guards (readFileSync + regex), no React render.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const drillDownSource = readFileSync(
  join(__dirname, "..", "contradiction-drill-down-dialog.tsx"),
  "utf8"
);
const panelSource = readFileSync(
  join(__dirname, "..", "evidence-health-panel.tsx"),
  "utf8"
);

// ----------------------------------------------------------------
// Drill-down component contract
// ----------------------------------------------------------------

describe("contradiction-drill-down-dialog.tsx — B8.2 inspection routing", () => {
  it("exports ContradictionDrillDownDialog as a named, memoised component", () => {
    expect(drillDownSource).toMatch(/export\s+const\s+ContradictionDrillDownDialog\s*=\s*memo\(/);
  });

  it("requires dealId + contradiction + byDocument props (IDOR scoping + render context)", () => {
    expect(drillDownSource).toMatch(/dealId:\s*string;/);
    expect(drillDownSource).toMatch(/contradiction:\s*ContradictionFinding\s*\|\s*null/);
    expect(drillDownSource).toMatch(/byDocument:\s*Record<string,\s*DocumentHealthSummary>/);
  });

  it("renders DocumentPreviewDialog AND DocumentExtractionAuditDialog (the two inspection paths)", () => {
    expect(drillDownSource).toMatch(/import\s*\{\s*DocumentPreviewDialog\s*\}/);
    expect(drillDownSource).toMatch(/import\s*\{\s*DocumentExtractionAuditDialog\s*\}/);
    expect(drillDownSource).toMatch(/<DocumentPreviewDialog/);
    expect(drillDownSource).toMatch(/<DocumentExtractionAuditDialog/);
  });

  it("'Aperçu de la pièce' button is wired to handleOpenPreview(docId)", () => {
    expect(drillDownSource).toMatch(/handleOpenPreview\(docId\)/);
    expect(drillDownSource).toMatch(/Aperçu de la pièce/);
  });

  it("'Voir l'audit d'extraction' button is wired to handleOpenAudit(docId)", () => {
    expect(drillDownSource).toMatch(/handleOpenAudit\(docId\)/);
    expect(drillDownSource).toMatch(/Voir l[’']audit d[’']extraction/);
  });

  it("groups signals BY documentId — same doc with two amounts → one card with two amounts (Map by docId)", () => {
    // Anti-regression for a future refactor that switches to `.map`
    // on the raw signals array — would render the same doc twice and
    // mislead the BA into thinking N sources disagree instead of one
    // doc carrying two values.
    expect(drillDownSource).toMatch(/groupedByDoc\s*=\s*new\s+Map/);
    expect(drillDownSource).toMatch(/groupedByDoc\.get\(sig\.documentId\)/);
  });

  it("audit dialog forwards the PANEL's dealId, NOT the fetched document's dealId (IDOR)", () => {
    // Anti-regression for a server-side bug that could leak a wrong
    // dealId on the document fetch — the audit dialog must always
    // scope back to the deal in scope, not whatever the API returned.
    // We anchor on `dealId,` appearing INSIDE the <DocumentExtractionAuditDialog ... document={{ ... dealId, ... }}> block.
    expect(drillDownSource).toMatch(
      /<DocumentExtractionAuditDialog[\s\S]{0,400}document=\{\{[\s\S]{0,300}dealId,/
    );
  });

  it("on-demand fetch goes through clerkFetch — never raw fetch (auth)", () => {
    expect(drillDownSource).toMatch(/clerkFetch\(`\/api\/documents\/\$\{documentId\}`\)/);
    expect(drillDownSource).not.toMatch(/[^a-zA-Z]fetch\(`\/api\/documents/);
  });

  it("uses queryKeys.documents.byId for caching (no ad-hoc keys)", () => {
    expect(drillDownSource).toMatch(/queryKeys\.documents\.byId\(/);
  });

  it("preserves the analytical tone (no GO/NO_GO/PASS/INVESTIR/REJETER in user-facing strings)", () => {
    const codeOnly = drillDownSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:/])\/\/.*$/gm, "$1");
    expect(codeOnly).not.toMatch(/\bGO\b|\bNO_GO\b|NO[- _]GO|REJETER|REJECT|INVESTIR|\bPASS\b/i);
  });

  it("Dialog severity badge respects the contradiction's real severity (HIGH/MEDIUM/LOW)", () => {
    expect(drillDownSource).toMatch(/SEVERITY_BADGE\[contradiction\.severity\]/);
  });

  it("Classification badges cover the three known classifications (actual / forecast / claim)", () => {
    expect(drillDownSource).toMatch(/actual:\s*\{/);
    expect(drillDownSource).toMatch(/forecast:\s*\{/);
    expect(drillDownSource).toMatch(/claim:\s*\{/);
  });

  it("handles currency=null gracefully ('Devise non détectée') instead of crashing", () => {
    expect(drillDownSource).toMatch(/Devise non détectée/);
  });

  it("renders nothing when contradiction is null (defensive — gate against stale prop)", () => {
    expect(drillDownSource).toMatch(/if\s*\(!contradiction\)\s*return\s+null/);
  });
});

// ----------------------------------------------------------------
// B8.2.1 — Codex B8.2 P2 fix-up: fetch errors no longer dead-click
// ----------------------------------------------------------------

describe("contradiction-drill-down-dialog.tsx — B8.2.1 fetch-error handling (Codex B8.2 P2)", () => {
  it("preview path branches on previewQuery.isError before falling back to the loading scrim", () => {
    // Anti-regression for the Codex B8.2 P2 finding: previewQuery
    // failure (403 / 404 / network) used to leave the user on an
    // infinite spinner. The component MUST gate `isError` BEFORE the
    // `data ? ... : <LoadingScrim />` ternary.
    expect(drillDownSource).toMatch(
      /previewQuery\.isError\s*\?[\s\S]{0,400}DocumentFetchErrorScrim/
    );
  });

  it("audit path branches on auditQuery.isError before falling back to the loading scrim", () => {
    // Same as above but for the audit fetch — pre-fix-up there was no
    // loading UI at all on the audit side, so a failure rendered
    // literally nothing (the click was dead).
    expect(drillDownSource).toMatch(
      /auditQuery\.isError\s*\?[\s\S]{0,400}DocumentFetchErrorScrim/
    );
  });

  it("error scrim surfaces a 'Document indisponible'-style title for both preview and audit", () => {
    expect(drillDownSource).toMatch(/title="Aperçu indisponible"/);
    expect(drillDownSource).toMatch(/title="Audit d[’']extraction indisponible"/);
  });

  it("error scrim exposes Retry that calls refetch (not a no-op)", () => {
    // The button label MUST be wired to the underlying query refetch
    // — anti-regression for a UI-only retry that doesn't actually
    // re-fire the request.
    expect(drillDownSource).toMatch(/previewQuery\.refetch\(\)/);
    expect(drillDownSource).toMatch(/auditQuery\.refetch\(\)/);
    expect(drillDownSource).toMatch(/Réessayer/);
  });

  it("error scrim exposes Close that clears the docId state (no zombie open)", () => {
    // Closing via the X / "Fermer" must reset the parent's previewDocId
    // / auditDocId, otherwise the error scrim stays mounted across the
    // drill-down's lifecycle.
    expect(drillDownSource).toMatch(/handleClosePreview\(false\)/);
    expect(drillDownSource).toMatch(/handleCloseAudit\(false\)/);
  });

  it("retry button is disabled while a refetch is in flight (no double-fire)", () => {
    // `disabled={isRetrying}` — guard against a triple-click that
    // would queue redundant network requests on a failing route.
    // The isRetrying prop is fed from each query's `isFetching` flag
    // (JSX prop syntax, not struct literal).
    expect(drillDownSource).toMatch(/isRetrying=\{previewQuery\.isFetching\}/);
    expect(drillDownSource).toMatch(/isRetrying=\{auditQuery\.isFetching\}/);
    expect(drillDownSource).toMatch(/disabled=\{isRetrying\}/);
  });

  it("errorMessage normalises auth / not-found / generic errors into French user-facing strings", () => {
    // Defensive helper — never render `[object Object]` or leak a
    // stack trace.
    expect(drillDownSource).toMatch(/function\s+errorMessage\(error:\s*unknown\)/);
    expect(drillDownSource).toMatch(/Document indisponible \(accès refusé\)/);
    expect(drillDownSource).toMatch(/Document introuvable/);
    expect(drillDownSource).toMatch(/Session expirée/);
  });

  it("B8.3 fix-up — non-HTTP errors fall back to the generic French message (no error.message leak)", () => {
    // Codex B8.2.1 non-blocking — pre-fix the fallback returned
    // `error.message` verbatim, which can be a technical string
    // ("Failed to fetch", "AbortError: ...") the BA shouldn't see.
    // The fallback is now a single shared constant. The static guard
    // anchors BOTH: the constant exists AND the `return error.message`
    // pattern is gone.
    expect(drillDownSource).toMatch(/GENERIC_FETCH_ERROR_MESSAGE\s*=\s*\n?\s*["']/);
    // Anti-regression — no bare `return error.message` (would mean
    // we're back to leaking technical strings).
    expect(drillDownSource).not.toMatch(/return\s+error\.message\b/);
  });

  it("audit path has a loading scrim too (parity with preview — no half-second blank flash)", () => {
    // Before B8.2.1 the audit path had no loading UI between click and
    // dialog mount; the user briefly saw nothing.
    expect(drillDownSource).toMatch(/function\s+DocumentAuditLoadingScrim\b/);
  });
});

// ----------------------------------------------------------------
// Panel wiring — drill-down mounted as sibling, dealId passed through
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B8.2 drill-down wiring", () => {
  it("imports ContradictionDrillDownDialog (the new dialog replaces the B8.1 fake Voir)", () => {
    expect(panelSource).toMatch(
      /import\s*\{\s*ContradictionDrillDownDialog\s*\}\s*from\s*["']\.\/contradiction-drill-down-dialog["']/
    );
  });

  it("mounts the drill-down as a sibling (not inside the metadata or upload dialog tree)", () => {
    // The metadata + upload + drill-down siblings each get their own
    // <Dialog> instance via Radix — nesting would break stack ordering
    // (same trap fixed by B6.1 P1 for the audit dialog).
    expect(panelSource).toMatch(/<ContradictionDrillDownDialog/);
    // Anchor on the prop set the dispatcher feeds: the contradiction
    // arrives via state, and the dealId comes from the panel prop.
    expect(panelSource).toMatch(/<ContradictionDrillDownDialog[\s\S]{0,300}dealId=\{dealId\}/);
    expect(panelSource).toMatch(
      /<ContradictionDrillDownDialog[\s\S]{0,300}contradiction=\{drillDownContradiction\}/
    );
    expect(panelSource).toMatch(/<ContradictionDrillDownDialog[\s\S]{0,300}byDocument=\{byDocument\}/);
  });

  it("dispatcher includes the open_contradiction_drill_down branch (was missing in B8.1)", () => {
    expect(panelSource).toMatch(/case\s+["']open_contradiction_drill_down["']/);
    expect(panelSource).toMatch(/handleOpenDrillDown\(action\.contradiction\)/);
  });

  it("contradiction action is a SINGLE open_contradiction_drill_down (no more per-doc open_metadata clones)", () => {
    // Anti-regression for the Codex B8.1 P2 root cause: per-doc Voir
    // buttons that opened the metadata editor. The new behavior is
    // exactly one drill-down action per contradiction.
    expect(panelSource).toMatch(/kind:\s*["']open_contradiction_drill_down["']/);
    // The label format proves the action carries a count of unique docs.
    expect(panelSource).toMatch(/Comparer \$\{count\} document/);
  });

  it("preserves the existing <EvidenceHealthPanel dealId={dealId} /> signature (anchored test)", () => {
    expect(panelSource).toMatch(/interface\s+EvidenceHealthPanelProps\s*\{\s*dealId:\s*string;\s*\}/);
  });
});
