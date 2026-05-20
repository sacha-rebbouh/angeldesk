/**
 * Phase B9.3 — UI guards for the resolution/ignore panel surface.
 *
 * Spec gates:
 *   - Per-signal "Marquer résolu" + "Ignorer" buttons (each surface
 *     opens the reason dialog; mutations go through clerkFetch).
 *   - Optional-reason dialog (Textarea, cap 1000 chars, no required
 *     field).
 *   - "Signaux traités" collapsible section (resolved + ignored
 *     entries with a "Réouvrir" button).
 *   - Mutations invalidate `queryKeys.evidenceHealth.byDeal(dealId)`.
 *   - DELETE mutation path for re-open is wired.
 *   - The resolution flow uses the stable `signalKey*` helpers from
 *     B9.1.1/B9.1.2 (NOT a per-display key — the Codex point of
 *     attention).
 *   - The panel imports the bundled hook payload (B9.3 widened
 *     contract): `resolved` and `ignored` arrays at the top level.
 *   - Tone analytical (CLAUDE.md positioning rule).
 *
 * Static-text guards (readFileSync + regex), no React render — same
 * pattern as the B8 panel tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelSource = readFileSync(
  join(__dirname, "..", "evidence-health-panel.tsx"),
  "utf8"
);

// ----------------------------------------------------------------
// Imports + wiring
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 import wiring", () => {
  it("imports the signalKey helpers from @/services/evidence (stable identity, not display text)", () => {
    expect(panelSource).toMatch(/import\s*\{[\s\S]*?signalKeyForContradiction[\s\S]*?\}\s*from\s*["']@\/services\/evidence["']/);
    expect(panelSource).toMatch(/signalKeyForMissing/);
    expect(panelSource).toMatch(/signalKeyForFreshness/);
  });

  it("imports useMutation + useQueryClient (resolution mutations)", () => {
    expect(panelSource).toMatch(/import\s*\{[\s\S]*?useMutation[\s\S]*?useQueryClient[\s\S]*?\}\s*from\s*["']@tanstack\/react-query["']/);
  });

  it("imports the EvidenceSignalResolutionAction + ResolvedSignalEntry types from the bundle", () => {
    expect(panelSource).toMatch(/EvidenceSignalResolutionAction/);
    expect(panelSource).toMatch(/ResolvedSignalEntry/);
  });

  it("imports Collapsible primitives (the 'Signaux traités' section is repliable)", () => {
    expect(panelSource).toMatch(/import\s*\{\s*Collapsible[\s\S]*?\}\s*from\s*["']@\/components\/ui\/collapsible["']/);
  });

  it("imports Textarea + Label (the reason dialog input)", () => {
    expect(panelSource).toMatch(/import\s*\{\s*Textarea\s*\}/);
    expect(panelSource).toMatch(/import\s*\{\s*Label\s*\}/);
  });
});

// ----------------------------------------------------------------
// Mutation wiring
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 mutations go through clerkFetch + invalidate the bundle key", () => {
  it("POST /resolutions is a useMutation using clerkFetch with method 'POST' + JSON body", () => {
    expect(panelSource).toMatch(
      /clerkFetch\(`\/api\/deals\/\$\{dealId\}\/evidence-health\/resolutions`,\s*\{[\s\S]{0,400}method:\s*["']POST["']/
    );
  });

  it("DELETE /resolutions uses the same path with method 'DELETE' + signalKey body", () => {
    expect(panelSource).toMatch(
      /clerkFetch\(`\/api\/deals\/\$\{dealId\}\/evidence-health\/resolutions`,\s*\{[\s\S]{0,400}method:\s*["']DELETE["']/
    );
  });

  it("anti-regression: never raw fetch on the resolutions route", () => {
    expect(panelSource).not.toMatch(/[^a-zA-Z]fetch\(`\/api\/deals\/\$\{dealId\}\/evidence-health\/resolutions/);
  });

  it("both mutations invalidate queryKeys.evidenceHealth.byDeal(dealId) on success", () => {
    // The mutation onSuccess hook MUST refire the bundle fetch so the
    // signal moves from active → resolved/ignored (or back) without a
    // page reload. We expect at least TWO occurrences (POST + DELETE).
    const matches =
      panelSource.match(/invalidateQueries\(\{\s*queryKey:\s*queryKeys\.evidenceHealth\.byDeal\(dealId\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("reason is OPTIONAL (trimmed → null when empty) — matches the server's nullable contract", () => {
    expect(panelSource).toMatch(/trimmed\.length\s*>\s*0\s*\?\s*trimmed\s*:\s*null/);
  });

  it("surfaces signal_not_active server error as a friendly French toast (no raw code leak)", () => {
    expect(panelSource).toMatch(/signal_not_active/);
    expect(panelSource).toMatch(/Ce signal n['’]est plus actif/);
  });
});

// ----------------------------------------------------------------
// Per-signal buttons
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 per-signal 'Marquer résolu' + 'Ignorer' buttons", () => {
  it("each block (contradiction / missing / freshness) renders the ResolutionButtons helper", () => {
    // The helper carries the signalKey + label so the dialog can
    // tell the BA which signal is about to be resolved.
    expect(panelSource).toMatch(/function\s+ResolutionButtons\b/);
    // Anchor on the call sites — each block must pass onMarkResolved /
    // onMarkIgnored down. Three sections × two callbacks = the
    // callback names appear at least 6 times.
    const resolvedRefs = (panelSource.match(/onMarkResolved=\{/g) ?? []).length;
    const ignoredRefs = (panelSource.match(/onMarkIgnored=\{/g) ?? []).length;
    expect(resolvedRefs).toBeGreaterThanOrEqual(3);
    expect(ignoredRefs).toBeGreaterThanOrEqual(3);
  });

  it("'Marquer résolu' and 'Ignorer' labels are present (French analytical wording)", () => {
    expect(panelSource).toMatch(/Marquer résolu/);
    expect(panelSource).toMatch(/Ignorer/);
  });

  it("buttons carry aria-labels for accessibility (label + signal-specific suffix)", () => {
    expect(panelSource).toMatch(/aria-label=\{`Marquer \$\{label\} comme résolu`\}/);
    expect(panelSource).toMatch(/aria-label=\{`Ignorer \$\{label\}`\}/);
  });

  it("per-doc missing findings render ONE ResolutionButtons per affected doc (no global mass-resolve)", () => {
    // A NO_PITCH_DECK_DATE with 3 affected docs should expose 3
    // separate "Marquer résolu" controls (anti-regression for a
    // future refactor that wires a single button to the aggregated
    // finding). Anchor on the perDocKeys.map(...) pattern.
    expect(panelSource).toMatch(/perDocKeys\.map/);
    expect(panelSource).toMatch(
      /m\.affectedDocumentIds\.length\s*===\s*0\s*\?\s*\[\{\s*signalKey:\s*signalKeyForMissing\(m,\s*null\)/
    );
  });

  it("contradictions use signalKeyForContradiction(c) (stable, with evidence-set hash from B9.1.1)", () => {
    expect(panelSource).toMatch(/const\s+signalKey\s*=\s*signalKeyForContradiction\(c\)/);
  });

  it("freshness uses signalKeyForFreshness(kind, docId) — per-doc, no mass-resolve", () => {
    expect(panelSource).toMatch(/signalKeyForFreshness\(entry\.kind,\s*entry\.documentId\)/);
  });
});

// ----------------------------------------------------------------
// Reason dialog
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 ResolutionDialog (optional reason)", () => {
  it("renders a Textarea for the reason input", () => {
    expect(panelSource).toMatch(/<Textarea[\s\S]{0,300}id="resolution-reason"/);
  });

  it("caps the Textarea at maxLength=1000 (matches server schema)", () => {
    expect(panelSource).toMatch(/maxLength=\{1000\}/);
  });

  it("displays the current reason length / 1000 indicator", () => {
    expect(panelSource).toMatch(/\{reason\.length\}\/1000/);
  });

  it("reason field is OPTIONAL — placeholder copy explicitly says so", () => {
    expect(panelSource).toMatch(/Raison\s*\(optionnel\)/);
  });

  it("Confirm button label flips by action (RESOLVED → 'Marquer résolu', IGNORED → 'Ignorer')", () => {
    expect(panelSource).toMatch(/isResolved\s*\?\s*["']Marquer résolu["']/);
  });

  it("dialog mount gated on `state` (null → closed)", () => {
    expect(panelSource).toMatch(/<ResolutionDialog/);
    expect(panelSource).toMatch(/const\s+open\s*=\s*Boolean\(state\)/);
  });

  it("Cancel button uses DialogClose (preserves Esc + outside-click semantics)", () => {
    expect(panelSource).toMatch(/<DialogClose\s+asChild>[\s\S]{0,200}Annuler/);
  });

  it("Confirm + Cancel buttons disabled while the mutation is in flight (no double-fire)", () => {
    expect(panelSource).toMatch(/disabled=\{isPending\}/);
  });
});

// ----------------------------------------------------------------
// "Signaux traités" section
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 'Signaux traités' collapsible section", () => {
  it("renders a Collapsible (default state managed by isTreatedSectionOpen)", () => {
    expect(panelSource).toMatch(/<Collapsible\s+open=\{isOpen\}/);
    expect(panelSource).toMatch(/isTreatedSectionOpen/);
  });

  it("default state is collapsed (informational, not competing with active signals)", () => {
    expect(panelSource).toMatch(/setIsTreatedSectionOpen\]\s*=\s*useState\(false\)/);
  });

  it("section is hidden entirely when treatedCount === 0 (no zero-state noise)", () => {
    // The JSX has `{treatedCount > 0 && (<TreatedSignalsSection ...`
    // — the regex tolerates the opening paren / brace and whitespace.
    expect(panelSource).toMatch(/treatedCount\s*>\s*0\s*&&[\s\S]{0,400}TreatedSignalsSection/);
  });

  it("each treated row exposes a 'Réouvrir' button wired to handleReopen(entry.signalKey)", () => {
    expect(panelSource).toMatch(/Réouvrir/);
    expect(panelSource).toMatch(/onReopen\(entry\.signalKey\)/);
  });

  it("'Réouvrir' button is disabled while the DELETE mutation is in flight", () => {
    expect(panelSource).toMatch(/disabled=\{isReopenInFlight\}/);
  });

  it("treated entries are sorted by most-recent action first (resolvedAt desc)", () => {
    expect(panelSource).toMatch(
      /\.sort\(\s*\(a,\s*b\)\s*=>\s*b\.resolvedAt\.getTime\(\)\s*-\s*a\.resolvedAt\.getTime\(\)/
    );
  });

  it("reason (if set) is rendered in italic French quotes — never as raw editable text", () => {
    // JSX expression `« {entry.reason} »` (not a template literal).
    expect(panelSource).toMatch(/«\s*\{entry\.reason\}\s*»/);
    // Italic style on the same element so the quoted reason stays
    // visually distinct from the analytical body copy.
    expect(panelSource).toMatch(/italic[\s\S]{0,200}entry\.reason/);
  });

  it("resolved entries get an emerald check icon; ignored get a slate eye-off (visual separation)", () => {
    expect(panelSource).toMatch(/CheckCircle2[\s\S]{0,200}text-emerald-600/);
    expect(panelSource).toMatch(/EyeOff[\s\S]{0,200}text-slate-500/);
  });
});

// ----------------------------------------------------------------
// Empty active state + treated-only display
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 empty-active state", () => {
  it("when totalFindings === 0 but treatedCount > 0, renders an analytical 'Aucun signal actif' line", () => {
    expect(panelSource).toMatch(/Aucun signal actif sur le corpus/);
  });

  it("panel early-return widened to (totalFindings === 0 && treatedCount === 0) — the section can solo", () => {
    expect(panelSource).toMatch(
      /if\s*\(\s*totalFindings\s*===\s*0\s*&&\s*treatedCount\s*===\s*0\s*\)\s*return\s+null/
    );
  });
});

// ----------------------------------------------------------------
// Tone — CLAUDE.md positioning rule
// ----------------------------------------------------------------

describe("evidence-health-panel.tsx — B9.3 tone (analytical, no prescriptive verdicts)", () => {
  it("never emits GO/NO_GO/PASS/INVESTIR/REJETER/FUYEZ (positioning rule)", () => {
    const codeOnly = panelSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:/])\/\/.*$/gm, "$1");
    expect(codeOnly).not.toMatch(/(rejet|investir|no[\s_-]?go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS)/i);
  });
});
