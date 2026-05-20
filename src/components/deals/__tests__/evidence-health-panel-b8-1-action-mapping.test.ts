/**
 * Phase B8.1 — Action mapping per signal.
 *
 * Spec gates:
 *   1. Every signal kind exposes at least one action ("pas de signal
 *      'ok je fais quoi ?'").
 *   2. Each action routes to the correct UI (metadata dialog with the
 *      right doc OR upload dialog).
 *
 * Tests split into two layers:
 *
 *   A) Pure helper tests (`__deriveSignalActions`) — assert the routing
 *      table for every contradiction kind, every MissingEvidenceKind,
 *      and every StaleWarningKind. These tests are the "every kind has
 *      ≥1 action" contract and catch the next time someone adds a new
 *      kind without registering an action (exhaustiveness check in the
 *      panel surfaces it as a TS error, but the unit test guarantees a
 *      non-empty list AND that the actions point at the right
 *      documentId / discriminator).
 *
 *   B) Static-text guards on the panel source — assert the action
 *      dispatcher is wired to the right dialogs (DocumentMetadataDialog
 *      for "open_metadata", DocumentUploadDialog for "open_upload"),
 *      and that the panel's onAction passes through dealId correctly.
 *      Catches a future refactor that disconnects the buttons from the
 *      dialogs without re-running the pure-function tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { __deriveSignalActions, type SignalAction } from "../evidence-health-panel";
import type {
  ContradictionFinding,
  DocumentHealthSummary,
  MissingEvidenceFinding,
  MissingEvidenceKind,
  StaleWarningKind,
} from "@/services/evidence";

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

function makeSummary(name: string): DocumentHealthSummary {
  return {
    contradictionCount: 0,
    highestContradictionSeverity: null,
    missing: [],
    freshness: [],
    documentName: name,
    documentType: "PITCH_DECK",
  };
}

const byDocument: Record<string, DocumentHealthSummary> = {
  doc_pitch: makeSummary("pitch.pdf"),
  doc_captable: makeSummary("captable.xlsx"),
  doc_model: makeSummary("model.xlsx"),
  doc_balance: makeSummary("balance.pdf"),
};

function makeContradiction(
  signals: Array<{ documentId: string; documentName: string }>
): ContradictionFinding {
  return {
    kind: "METRIC_MISMATCH",
    subject: "CA",
    year: 2025,
    severity: "HIGH",
    reason: "test",
    spreadRatio: 1.5,
    signals: signals.map((s) => ({
      documentId: s.documentId,
      documentName: s.documentName,
      documentType: "PITCH_DECK",
      classification: "claim",
      amount: 1_000_000,
      currency: "EUR",
      signalId: `sig_${s.documentId}`,
    })),
  };
}

function makeMissing(
  kind: MissingEvidenceKind,
  affectedDocumentIds: string[]
): MissingEvidenceFinding {
  return {
    kind,
    severity: "MEDIUM",
    message: "test",
    affectedDocumentIds,
  };
}

// ----------------------------------------------------------------
// A) Pure helper — contradictions
// ----------------------------------------------------------------

describe("__deriveSignalActions.contradiction — B8.2 drill-down replaces B8.1 per-doc Voir buttons", () => {
  it("two-doc contradiction → one open_contradiction_drill_down action carrying the finding", () => {
    const contradiction = makeContradiction([
      { documentId: "doc_pitch", documentName: "pitch.pdf" },
      { documentId: "doc_captable", documentName: "captable.xlsx" },
    ]);
    const actions = __deriveSignalActions.contradiction(contradiction, byDocument);
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.kind).toBe("open_contradiction_drill_down");
    if (action.kind === "open_contradiction_drill_down") {
      // The dialog needs the full finding to render all signals
      // side-by-side — passing a referential identity guarantees no
      // round-trip and no stale slice.
      expect(action.contradiction).toBe(contradiction);
      expect(action.label).toMatch(/Comparer 2 documents/);
    }
  });

  it("singular label for a single-doc contradiction (no spurious 's' suffix)", () => {
    const contradiction = makeContradiction([
      { documentId: "doc_pitch", documentName: "pitch.pdf" },
      // Same doc, different amount → 1 unique doc.
      { documentId: "doc_pitch", documentName: "pitch.pdf" },
    ]);
    const actions = __deriveSignalActions.contradiction(contradiction, byDocument);
    expect(actions).toHaveLength(1);
    const action = actions[0];
    if (action.kind === "open_contradiction_drill_down") {
      expect(action.label).toBe("Comparer 1 document");
    }
  });

  it("returns no actions when the contradiction has no signals (defensive)", () => {
    const contradiction = makeContradiction([]);
    const actions = __deriveSignalActions.contradiction(contradiction, byDocument);
    expect(actions).toEqual([]);
  });

  it("dedupes by documentId — 10 raw signals across 3 docs → label 'Comparer 3 documents'", () => {
    // The drill-down dialog groups internally; the action label should
    // reflect the count of UNIQUE docs, not raw signal count, so the
    // BA isn't misled into thinking 10 separate sources disagree.
    const signals = [
      ...Array.from({ length: 4 }, () => ({ documentId: "a", documentName: "a.pdf" })),
      ...Array.from({ length: 3 }, () => ({ documentId: "b", documentName: "b.pdf" })),
      ...Array.from({ length: 3 }, () => ({ documentId: "c", documentName: "c.pdf" })),
    ];
    const actions = __deriveSignalActions.contradiction(makeContradiction(signals), byDocument);
    expect(actions).toHaveLength(1);
    const action = actions[0];
    if (action.kind === "open_contradiction_drill_down") {
      expect(action.label).toBe("Comparer 3 documents");
    }
  });
});

// ----------------------------------------------------------------
// A) Pure helper — missing evidence (every kind)
// ----------------------------------------------------------------

describe("__deriveSignalActions.missing — every MissingEvidenceKind surfaces ≥1 action", () => {
  const ALL_KINDS: MissingEvidenceKind[] = [
    "NO_CAP_TABLE_AS_OF",
    "NO_FINANCIAL_STATEMENTS",
    "NO_FORECAST_PERIOD",
    "NO_PITCH_DECK_DATE",
  ];

  // Exhaustiveness — touched by the panel's TS exhaustiveness check too,
  // but the unit test re-asserts so a future enum extension that
  // accidentally lands a default-empty array still fails CI.
  it.each(ALL_KINDS)("kind %s → at least one action", (kind) => {
    const affected = kind === "NO_FINANCIAL_STATEMENTS" ? [] : ["doc_pitch"];
    const actions = __deriveSignalActions.missing(makeMissing(kind, affected), byDocument);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("NO_CAP_TABLE_AS_OF with affected docs → open_metadata + sourceDate focus + cap-table label", () => {
    const actions = __deriveSignalActions.missing(
      makeMissing("NO_CAP_TABLE_AS_OF", ["doc_captable"]),
      byDocument
    );
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.kind).toBe("open_metadata");
    if (action.kind === "open_metadata") {
      expect(action.documentId).toBe("doc_captable");
      expect(action.focusField).toBe("sourceDate");
      expect(action.label).toMatch(/Renseigner la date/);
      expect(action.label).toContain("captable.xlsx");
    }
  });

  it("NO_CAP_TABLE_AS_OF with NO cap table at all → open_upload(CAP_TABLE) only", () => {
    const actions = __deriveSignalActions.missing(
      makeMissing("NO_CAP_TABLE_AS_OF", []),
      byDocument
    );
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.kind).toBe("open_upload");
    if (action.kind === "open_upload") {
      expect(action.suggestedType).toBe("CAP_TABLE");
      expect(action.label).toMatch(/Ajouter une cap table/);
    }
  });

  it("NO_FINANCIAL_STATEMENTS → open_upload(FINANCIAL_STATEMENTS)", () => {
    const actions = __deriveSignalActions.missing(
      makeMissing("NO_FINANCIAL_STATEMENTS", []),
      byDocument
    );
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.kind).toBe("open_upload");
    if (action.kind === "open_upload") {
      expect(action.suggestedType).toBe("FINANCIAL_STATEMENTS");
      expect(action.label).toMatch(/Ajouter un bilan/);
    }
  });

  it("NO_FORECAST_PERIOD → open_metadata per doc + a single open_upload(FINANCIAL_MODEL)", () => {
    const actions = __deriveSignalActions.missing(
      makeMissing("NO_FORECAST_PERIOD", ["doc_model"]),
      byDocument
    );
    // 1 per-doc metadata edit + 1 upload fallback.
    expect(actions).toHaveLength(2);
    expect(actions[0].kind).toBe("open_metadata");
    expect(actions[1].kind).toBe("open_upload");
    if (actions[1].kind === "open_upload") {
      expect(actions[1].suggestedType).toBe("FINANCIAL_MODEL");
    }
  });

  it("NO_PITCH_DECK_DATE → open_metadata with sourceDate focus per undated deck", () => {
    const actions = __deriveSignalActions.missing(
      makeMissing("NO_PITCH_DECK_DATE", ["doc_pitch"]),
      byDocument
    );
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.kind).toBe("open_metadata");
    if (action.kind === "open_metadata") {
      expect(action.documentId).toBe("doc_pitch");
      expect(action.focusField).toBe("sourceDate");
      expect(action.label).toMatch(/Renseigner la date/);
    }
  });
});

// ----------------------------------------------------------------
// A) Pure helper — freshness (every kind)
// ----------------------------------------------------------------

describe("__deriveSignalActions.freshness — every StaleWarningKind surfaces ≥1 action", () => {
  const ALL_KINDS: StaleWarningKind[] = [
    "cap_table_stale",
    "balance_sheet_stale",
    "forecast_now_historical",
  ];

  it.each(ALL_KINDS)("kind %s → at least one action (one open_metadata + one open_upload)", (kind) => {
    const actions = __deriveSignalActions.freshness(kind, "doc_pitch", byDocument);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    // Sanity: both shapes are present so the user has either path.
    const hasMetadata = actions.some((a) => a.kind === "open_metadata");
    const hasUpload = actions.some((a) => a.kind === "open_upload");
    expect(hasMetadata).toBe(true);
    expect(hasUpload).toBe(true);
  });

  it("cap_table_stale upload suggestion = CAP_TABLE", () => {
    const actions = __deriveSignalActions.freshness("cap_table_stale", "doc_captable", byDocument);
    const upload = actions.find((a): a is Extract<SignalAction, { kind: "open_upload" }> => a.kind === "open_upload");
    expect(upload?.suggestedType).toBe("CAP_TABLE");
  });

  it("balance_sheet_stale upload suggestion = FINANCIAL_STATEMENTS", () => {
    const actions = __deriveSignalActions.freshness("balance_sheet_stale", "doc_balance", byDocument);
    const upload = actions.find((a): a is Extract<SignalAction, { kind: "open_upload" }> => a.kind === "open_upload");
    expect(upload?.suggestedType).toBe("FINANCIAL_STATEMENTS");
  });

  it("forecast_now_historical upload suggestion = FINANCIAL_MODEL (actuals/YTD)", () => {
    const actions = __deriveSignalActions.freshness("forecast_now_historical", "doc_model", byDocument);
    const upload = actions.find((a): a is Extract<SignalAction, { kind: "open_upload" }> => a.kind === "open_upload");
    expect(upload?.suggestedType).toBe("FINANCIAL_MODEL");
    expect(upload?.label).toMatch(/actuals/i);
  });
});

// ----------------------------------------------------------------
// A) Pure helper — flattenFreshness
// ----------------------------------------------------------------

describe("__deriveSignalActions.flattenFreshness — bundle → per-doc rows", () => {
  it("collapses byDocument.freshness into one row per (doc, kind), sorted HIGH > MEDIUM > LOW", () => {
    const byDoc: Record<string, DocumentHealthSummary> = {
      a: {
        contradictionCount: 0,
        highestContradictionSeverity: null,
        missing: [],
        freshness: [{ kind: "cap_table_stale", severity: "LOW" }],
        documentName: "Z-doc",
      },
      b: {
        contradictionCount: 0,
        highestContradictionSeverity: null,
        missing: [],
        freshness: [
          { kind: "balance_sheet_stale", severity: "HIGH" },
          { kind: "forecast_now_historical", severity: "MEDIUM" },
        ],
        documentName: "A-doc",
      },
    };
    const entries = __deriveSignalActions.flattenFreshness(byDoc);
    expect(entries.map((e) => `${e.documentId}:${e.kind}:${e.severity}`)).toEqual([
      "b:balance_sheet_stale:HIGH",
      "b:forecast_now_historical:MEDIUM",
      "a:cap_table_stale:LOW",
    ]);
  });

  it("returns [] when no freshness entries exist", () => {
    const byDoc: Record<string, DocumentHealthSummary> = {
      a: {
        contradictionCount: 0,
        highestContradictionSeverity: null,
        missing: [],
        freshness: [],
        documentName: "doc",
      },
    };
    expect(__deriveSignalActions.flattenFreshness(byDoc)).toEqual([]);
  });
});

// ----------------------------------------------------------------
// B) Static-text guards — the panel wires the actions to the dialogs
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B8.1 action dispatcher wiring (static guard)", () => {
  const panelSource = readFileSync(
    join(__dirname, "..", "evidence-health-panel.tsx"),
    "utf8"
  );

  it("mounts DocumentMetadataDialog and DocumentUploadDialog (the two action targets)", () => {
    expect(panelSource).toMatch(/import\s*\{\s*DocumentMetadataDialog\s*\}\s*from\s*["']\.\/document-metadata-dialog["']/);
    expect(panelSource).toMatch(/import\s*\{\s*DocumentUploadDialog\s*\}\s*from\s*["']\.\/document-upload-dialog["']/);
    expect(panelSource).toMatch(/<DocumentMetadataDialog/);
    expect(panelSource).toMatch(/<DocumentUploadDialog/);
  });

  it("dispatcher routes each SignalAction kind through a switch (open_metadata / open_upload / open_contradiction_drill_down)", () => {
    // The dispatcher MUST branch on action.kind so a future refactor
    // that loses the discriminator falls back to a no-op (and not e.g.
    // every click opening the upload dialog). B8.2 added the
    // contradiction drill-down branch — assert it explicitly so a
    // regression that drops it is caught at CI.
    expect(panelSource).toMatch(/case\s+["']open_metadata["']/);
    expect(panelSource).toMatch(/case\s+["']open_upload["']/);
    expect(panelSource).toMatch(/case\s+["']open_contradiction_drill_down["']/);
    expect(panelSource).toMatch(/handleOpenMetadata\(action\.documentId\)/);
    expect(panelSource).toMatch(/handleOpenUpload\(\)/);
    expect(panelSource).toMatch(/handleOpenDrillDown\(action\.contradiction\)/);
  });

  it("metadata dialog receives the dealId from the panel props (no IDOR-by-omission)", () => {
    // dealId comes from the panel's own prop, not from the fetched
    // document. Anchors the IDOR posture: the dialog's PATCH route
    // verifies ownership server-side, but the dialog's dealId field
    // must reflect the deal in scope, not whatever the API returned.
    expect(panelSource).toMatch(/dealId\s*,\s*\n[\s\S]{0,200}name:\s*metadataQuery\.data\.name/);
  });

  it("upload dialog is mounted with the panel's dealId (not a hard-coded value)", () => {
    expect(panelSource).toMatch(/<DocumentUploadDialog\s+dealId=\{dealId\}/);
  });

  it("on-demand fetch goes through clerkFetch (auth) — never raw fetch", () => {
    expect(panelSource).toMatch(/clerkFetch\(`\/api\/documents\/\$\{documentId\}`\)/);
    expect(panelSource).not.toMatch(/[^a-zA-Z]fetch\(`\/api\/documents/);
  });

  it("uses the centralised queryKeys.documents.byId — no ad-hoc cache key", () => {
    expect(panelSource).toMatch(/queryKeys\.documents\.byId\(/);
  });

  it("preserves the analytical tone (no GO/NO_GO/PASS/INVESTIR/REJETER in user-facing strings)", () => {
    // CLAUDE.md positioning rule — labels MUST stay analytical. The
    // action buttons are the most visible new surface in B8.1 and the
    // most tempting place to slip prescriptive copy in. We strip
    // single-line + multi-line comments before scanning so the
    // doctrine comment at the top of the panel (which intentionally
    // names the forbidden words to forbid them) does not trip the
    // guard.
    const codeOnly = panelSource
      .replace(/\/\*[\s\S]*?\*\//g, "") // multi-line comments
      .replace(/(^|[^:/])\/\/.*$/gm, "$1"); // single-line comments (keep "https://")
    expect(codeOnly).not.toMatch(/\bGO\b|\bNO_GO\b|NO[- _]GO|REJETER|REJECT|INVESTIR|\bPASS\b/i);
  });
});

describe("evidence-health-panel.tsx — preserves the existing analysis-panel signature", () => {
  // The analysis-panel-evidence-health.test.ts guard pins
  // `<EvidenceHealthPanel dealId={dealId} />`. Anchor the export shape so
  // that contract stays satisfied after the B8.1 rewrite (we did NOT
  // add new required props to the component).
  const panelSource = readFileSync(
    join(__dirname, "..", "evidence-health-panel.tsx"),
    "utf8"
  );

  it("EvidenceHealthPanel still accepts only { dealId } as required props", () => {
    expect(panelSource).toMatch(/interface\s+EvidenceHealthPanelProps\s*\{\s*dealId:\s*string;\s*\}/);
  });
});

// ----------------------------------------------------------------
// B8.3 — Copy/share corpus checklist (panel wiring)
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B8.3 copy-checklist wiring", () => {
  const panelSource = readFileSync(
    join(__dirname, "..", "evidence-health-panel.tsx"),
    "utf8"
  );

  it("imports the pure builder from @/services/evidence (not from a barrel relative path)", () => {
    expect(panelSource).toMatch(
      /import\s*\{[\s\S]*?buildCorpusChecklistMarkdown[\s\S]*?\}\s*from\s*["']@\/services\/evidence["']/
    );
  });

  it("uses navigator.clipboard.writeText (the codebase-standard clipboard API)", () => {
    expect(panelSource).toMatch(/navigator\.clipboard\.writeText\(markdown\)/);
  });

  it("wraps the clipboard call in try/catch so a permission denial surfaces a toast (no silent no-op)", () => {
    expect(panelSource).toMatch(/await\s+navigator\.clipboard\.writeText/);
    expect(panelSource).toMatch(/catch\s*\(\s*clipboardError\s*\)/);
    expect(panelSource).toMatch(/toast\.error\(`Copie impossible/);
  });

  it("surfaces a 'Checklist copiée' success toast (analytical wording)", () => {
    expect(panelSource).toMatch(/toast\.success\(\s*["']Checklist copiée["']/);
  });

  it("renders 'Copier la checklist' button with an aria-label (a11y)", () => {
    expect(panelSource).toMatch(/Copier la checklist/);
    expect(panelSource).toMatch(/aria-label="Copier la checklist du corpus"/);
  });

  it("toggles transient 'Copié !' feedback with a 2s revert (no permanent stuck state)", () => {
    expect(panelSource).toMatch(/setIsChecklistCopied\(true\)/);
    expect(panelSource).toMatch(/window\.setTimeout\(\(\)\s*=>\s*setIsChecklistCopied\(false\),\s*2_000\)/);
  });

  it("button only renders when there's at least one signal active OR treated (no panel = no button)", () => {
    // The early-return at the top of EvidenceHealthPanel already
    // guarantees the button never ships an empty checklist. B9.3
    // widened the guard to include treated signals (so a deal where
    // everything was resolved still surfaces the panel with the
    // history). Anchor on the new compound shape so a future
    // refactor that drops the early return doesn't silently start
    // producing "Aucun signal" copies on quiet deals.
    expect(panelSource).toMatch(
      /if\s*\(\s*totalFindings\s*===\s*0\s*&&\s*treatedCount\s*===\s*0\s*\)\s*return\s+null/
    );
  });
});
