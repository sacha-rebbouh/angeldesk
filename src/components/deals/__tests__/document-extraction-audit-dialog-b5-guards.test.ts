/**
 * Phase B5.1 — Static guards on document-extraction-audit-dialog.tsx's
 * page-preview surface.
 *
 * B5.1 deliverable (anti-latence trompeuse) :
 *   1. Skeleton (NOT a centred spinner) while a NEW page image is loading.
 *   2. Cache of already-loaded preview URLs so a re-visited page renders
 *      instantly (no loader flash — kills the "wait, OCRing again?"
 *      impression).
 *   3. Page switch shows the loading state IMMEDIATELY for new URLs and
 *      the image IMMEDIATELY for cached URLs (no double-flash).
 *   4. Preload page-1 + page+1 adjacent images, AND don't re-warm a URL
 *      we've already warmed (preloadedUrlsRef dedup).
 *   5. Page image alt + caption stay anchored to `page.pageNumber` so a
 *      stale image can never claim to be a different page.
 *
 * The audit dialog is heavyweight (1800+ lines, JSDOM-incompatible due
 * to TanStack Query + intersection observer assumptions) so we stick to
 * grep guards — same convention as the B4 dialog guards.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(__dirname, "..", "document-extraction-audit-dialog.tsx"),
  "utf8"
);

describe("document-extraction-audit-dialog.tsx — B5.1 page-preview cache + skeleton", () => {
  it("imports Skeleton from the shadcn UI primitive (no ad-hoc div pulse)", () => {
    // Skeleton is shadcn's primitive with bg-accent + animate-pulse +
    // rounded-md. Re-implementing it inline drifts from the design
    // system — the import is the contract.
    expect(source).toMatch(
      /import\s+\{\s*Skeleton\s*\}\s+from\s+["']@\/components\/ui\/skeleton["']/
    );
  });

  it("tracks loaded preview URLs as a Set (NOT a single string)", () => {
    // The previous shape `loadedPreviewUrl: string | null` lost every
    // page the user had visited as soon as they switched — re-visiting
    // a page flashed the loader again. The Set keeps a per-dialog cache
    // of every URL successfully rendered, so navigation back is instant.
    expect(source).toMatch(/loadedUrls,\s*setLoadedUrls\]\s*=\s*useState<Set<string>>/);
    expect(source).toMatch(/failedUrls,\s*setFailedUrls\]\s*=\s*useState<Set<string>>/);
    // The anti-pattern (single-URL state) MUST be gone.
    expect(source).not.toMatch(/loadedPreviewUrl,\s*setLoadedPreviewUrl/);
    expect(source).not.toMatch(/failedPreviewUrl,\s*setFailedPreviewUrl/);
  });

  it("previewLoaded is derived from `loadedUrls.has(previewImageUrl)` (Set membership)", () => {
    // The derivation drives the hidden/visible state of the <img>
    // element AND whether the skeleton renders. Without this contract,
    // a regression to single-URL state would silently flash the loader
    // on every page revisit.
    //
    // B5.3 round 2 — the `previewImageUrl !== null` null-check was
    // dropped: PageSourcePreview is now PDF-only and the URL is always
    // defined. The Set membership check alone is the source of truth.
    expect(source).toMatch(/previewLoaded\s*=\s*loadedUrls\.has\(previewImageUrl\)/);
    expect(source).toMatch(/previewFailed\s*=\s*failedUrls\.has\(previewImageUrl\)/);
  });

  it("onLoad / onError handlers add to the Set immutably (no in-place mutation)", () => {
    // Using `setLoadedUrls(prev => new Set(prev).add(url))` is the safe
    // pattern — React requires a new reference to detect the state
    // change. Mutating the existing Set would skip the re-render and
    // the loader would never hide.
    expect(source).toMatch(
      /setLoadedUrls\([\s\S]{0,200}new\s+Set\(prev\)[\s\S]{0,80}next\.add\(url\)/
    );
    expect(source).toMatch(
      /setFailedUrls\([\s\S]{0,200}new\s+Set\(prev\)[\s\S]{0,80}next\.add\(url\)/
    );
  });

  it("Codex B5.1 P2 — handleLoad REMOVES url from failedUrls (mutual exclusion on recovery)", () => {
    // Real recovery sequence: image fails once (failedUrls grows) →
    // user retries / browser auto-retries / network heals → same URL
    // loads. Without the cross-cleanup, the URL stays in failedUrls
    // forever and the UI renders BOTH "Preview indisponible" AND the
    // image. handleLoad must remove the URL from failedUrls so the
    // two Sets are disjoint at all times.
    expect(source).toMatch(
      /const\s+handleLoad\s*=\s*useCallback\([\s\S]{0,1500}setFailedUrls\([\s\S]{0,400}next\.delete\(url\)/
    );
  });

  it("Codex B5.1 P2 — handleError REMOVES url from loadedUrls (mutual exclusion on regression)", () => {
    // Symmetric guard: if a URL was previously loaded and a later
    // attempt at the SAME URL errors (browser cache evicted, server
    // returns 500), the URL must leave loadedUrls so the failed banner
    // can show on its own.
    expect(source).toMatch(
      /const\s+handleError\s*=\s*useCallback\([\s\S]{0,1500}setLoadedUrls\([\s\S]{0,400}next\.delete\(url\)/
    );
  });

  it("Codex B5.1 P2 — loaded/failed mutual exclusion: derived flags can never be both true", () => {
    // Anchor on the contract that drives the UI: previewLoaded is true
    // iff the URL is in loadedUrls, previewFailed iff in failedUrls.
    // Combined with the handler cleanup above, the two flags are
    // strictly disjoint at every point in time — no contradictory UI.
    //
    // B5.3 round 2 — null-check was dropped from PageSourcePreview
    // (PDF guarantees non-null URL). Same Set-membership contract.
    expect(source).toMatch(/previewLoaded\s*=\s*loadedUrls\.has\(previewImageUrl\)/);
    expect(source).toMatch(/previewFailed\s*=\s*failedUrls\.has\(previewImageUrl\)/);
  });

  it("preload effect dedups via preloadedUrlsRef so warmers fire AT MOST once per URL", () => {
    // Without dedup, every parent re-render that recomputes the
    // adjacent URLs array (new identity each time) would create a new
    // <Image> object for URLs already in browser cache — wasteful but
    // not incorrect. The ref makes preload monotonic.
    expect(source).toMatch(/preloadedUrlsRef\s*=\s*useRef<Set<string>>/);
    expect(source).toMatch(/previouslyPreloaded\.has\(url\)\)\s*continue/);
    expect(source).toMatch(/previouslyPreloaded\.add\(url\)/);
  });

  it("preload effect runs only when the URL set actually changes (preloadImageUrlKey memo)", () => {
    // Effect dep is the joined key, not the raw array — the array gets
    // a fresh identity on every parent render via
    // `getAdjacentPreviewImageUrls(...)`, but the joined string is
    // stable across re-renders with the same URLs.
    expect(source).toMatch(/preloadImageUrlKey\s*=\s*preloadImageUrls\.join\(["']\|["']\)/);
    expect(source).toMatch(/useEffect\([\s\S]{0,1500}\},\s*\[preloadImageUrlKey\]\)/);
  });

  it("skeleton block renders ONLY while !previewLoaded && !previewFailed", () => {
    // The skeleton must never co-render with the <img> (would double
    // the apparent layout) and must hide as soon as the URL is in the
    // loadedUrls Set. The current contract is `{!previewLoaded && !previewFailed && (...)}`.
    expect(source).toMatch(
      /\{!previewLoaded\s*&&\s*!previewFailed\s*&&\s*\([\s\S]{0,1200}<Skeleton/
    );
  });

  it("skeleton uses an aspect-[1/1.3] portrait box (matches typical PDF page footprint)", () => {
    // A square-ish portrait aspect avoids the layout-shift when the
    // real image arrives. aspect-video was the legacy generic fallback
    // and looked nothing like a PDF page.
    expect(source).toMatch(/aspect-\[1\/1\.3\]/);
    // Counter-check: no aspect-video on the loader anymore.
    expect(source).not.toMatch(/!previewLoaded\s*&&\s*!previewFailed\s*&&\s*\([\s\S]{0,200}aspect-video/);
  });

  it("loading region exposes role=status + aria-live=polite + per-page aria-label", () => {
    // The skeleton is the *announcement* to assistive tech that a page
    // is loading. Without aria-live, a screen-reader user wouldn't know
    // anything happened on page switch. The aria-label spells out the
    // page number so the announcement is specific.
    expect(source).toMatch(
      /role="status"[\s\S]{0,200}aria-live="polite"[\s\S]{0,200}aria-label=\{`Chargement de la page \$\{page\.pageNumber\}`\}/
    );
  });

  it("loading caption stays attached to the actual page number (no stale text)", () => {
    // The text under the skeleton must reference `page.pageNumber` so
    // it can never claim to be a different page. Anchoring to the
    // interpolation guards against a future regression that hardcodes
    // a number or uses a stale state value.
    // JSX expression syntax: `{page.pageNumber}` (no `$` prefix —
    // that's template-literal syntax). The aria-label uses ${...} via a
    // template literal, but the visible <span> uses plain JSX.
    expect(source).toMatch(/Chargement page \{page\.pageNumber\}/);
  });

  it("<img> stays hidden until its OWN URL is in loadedUrls (no flash of wrong image)", () => {
    // `key={previewImageUrl}` already forces a remount per URL change;
    // combined with the Set check, a previously-loaded URL skips the
    // hidden phase entirely (instant render) and a new URL only reveals
    // after its own onLoad fires.
    expect(source).toMatch(
      /<img[\s\S]{0,1500}key=\{previewImageUrl\}[\s\S]{0,500}!previewLoaded\s*&&\s*"hidden"/
    );
  });

  it("getPreviewImageUrl includes the content-hash version param (cache busts on retry)", () => {
    // The cache Set is keyed on the URL; the URL embeds
    // `?v=${pageImageHash}` so a Retry-page that regenerates the
    // preview gets a different URL → cache miss → fresh load. Without
    // this, a retried page would show the stale cached image.
    expect(source).toMatch(/pageImageHash[\s\S]{0,200}\?v=\$\{encodeURIComponent\(page\.pageImageHash\)\}/);
  });

  it("getAdjacentPreviewImageUrls returns [n-1, n+1] (preload neighbors only, not the whole doc)", () => {
    // Preloading the entire document would be expensive on a 80-page
    // deck. n±1 is the cheapest win: covers the most common navigation
    // pattern (sequential reading) at constant cost.
    expect(source).toMatch(
      /const\s+adjacentPages\s*=\s*new\s+Set\(\[pageNumber\s*-\s*1,\s*pageNumber\s*\+\s*1\]\)/
    );
  });

  it("PageSourcePreview is invoked with preloadImageUrls={getAdjacentPreviewImageUrls(...)} in the page detail panel", () => {
    // The preload prop must actually be wired — without it, the
    // useEffect inside PageSourcePreview never fires and the warmer
    // is dead code.
    expect(source).toMatch(
      /<PageSourcePreview[\s\S]{0,500}preloadImageUrls=\{getAdjacentPreviewImageUrls\([\s\S]{0,200}\)\}/
    );
  });
});

// ============================================================
// B5.2 — Header/actions propres (non-collision, alignment, fallbacks)
// ============================================================
describe("document-extraction-audit-dialog.tsx — B5.2 header & actions", () => {
  it("disables shadcn's absolute X (showCloseButton={false}) so the close is part of our action cluster", () => {
    // The default shadcn close button sits at top-4 right-4 — independent
    // of header layout, so any header content has to reserve space for
    // it (the legacy pr-12 hack). Owning the close inside our action row
    // is the structural fix.
    expect(source).toMatch(/<DialogContent[\s\S]{0,500}showCloseButton=\{false\}/);
    // The legacy reservation MUST be gone — otherwise we'd have dead
    // horizontal space.
    expect(source).not.toMatch(/<DialogHeader[\s\S]{0,200}pr-12/);
  });

  it("renders a DialogClose-wrapped X button INSIDE the header action cluster", () => {
    // DialogClose preserves Radix's close lifecycle (focus restore,
    // animations, ESC behaviour). asChild lets us use our Button
    // styling for visual consistency with the surrounding outline
    // buttons.
    expect(source).toMatch(/<DialogClose\s+asChild>[\s\S]{0,400}<X\s+className/);
    expect(source).toMatch(/<DialogClose\s+asChild>[\s\S]{0,400}aria-label="Fermer l'audit extraction"/);
  });

  it("header layout is flex-wrap so actions wrap to a new row on narrow widths (no overlap, no clipping)", () => {
    // Without flex-wrap, a narrow viewport would either compress the
    // title (truncated to nothing) or push the actions off the right
    // edge. With wrap, the row collapses to a 2-line layout naturally.
    expect(source).toMatch(
      /<DialogHeader[\s\S]{0,400}flex flex-wrap items-center justify-between gap-3/
    );
    // The title is the flex item that can shrink (min-w-0 + flex-1)
    // while the action cluster is rigid.
    expect(source).toMatch(/<DialogTitle\s+className="flex min-w-0 flex-1 items-center gap-2/);
  });

  it("header exposes a 'Nouvel onglet' action wired to /download?disposition=inline (modal-level)", () => {
    // Distinct from the per-page 'Ouvrir la page' button — this opens
    // the WHOLE document inline. Inline disposition makes the browser
    // try to render it instead of forcing download.
    expect(source).toMatch(
      /\/api\/documents\/\$\{document\.id\}\/download\?disposition=inline[\s\S]{0,400}Nouvel onglet/
    );
    expect(source).toMatch(/aria-label="Ouvrir le document dans un nouvel onglet"/);
  });

  it("header exposes a 'Télécharger' action wired to /download (default = attachment disposition)", () => {
    // No `?disposition=...` defaults to attachment in the route (see
    // src/app/api/documents/[documentId]/download/route.ts). Wiring
    // here MUST NOT add `?disposition=inline` — that would re-route
    // to the inline endpoint and the browser would not force a save.
    expect(source).toMatch(
      /\/api\/documents\/\$\{document\.id\}\/download[\s\S]{0,400}Télécharger/
    );
    expect(source).toMatch(/aria-label="Télécharger le document original"/);
  });

  it("header action labels collapse to icon-only on narrow widths via hidden md:inline", () => {
    // The action cluster on a narrow viewport keeps the X + icons
    // visible but hides the text labels (kept in aria-label + title for
    // a11y / hover). Prevents horizontal overflow on a 360 px modal.
    expect(source).toMatch(/<span\s+className="hidden md:inline">Nouvel onglet<\/span>/);
    expect(source).toMatch(/<span\s+className="hidden md:inline">Télécharger<\/span>/);
  });

  it("imports the Download icon + X icon + DialogClose primitive (B5.2 new dependencies)", () => {
    expect(source).toMatch(/import\s+\{[\s\S]{0,400}\bDownload\b[\s\S]{0,400}\}\s+from\s+["']lucide-react["']/);
    expect(source).toMatch(/import\s+\{[\s\S]{0,400}\bX\b[\s\S]{0,400}\}\s+from\s+["']lucide-react["']/);
    expect(source).toMatch(/import\s+\{[\s\S]{0,400}DialogClose[\s\S]{0,400}\}\s+from\s+["']@\/components\/ui\/dialog["']/);
  });
});

describe("document-extraction-audit-dialog.tsx — B5.2 PageSourcePreview header", () => {
  it("page-preview header is flex-wrap so the action cluster wraps without overlap on narrow widths", () => {
    // The page-preview header sits inside the main grid's middle column
    // which can shrink on smaller viewports — wrap keeps the action
    // buttons accessible.
    expect(source).toMatch(
      /flex flex-wrap items-center justify-between gap-2 border-b bg-muted\/30/
    );
  });

  it("page-preview title block uses min-w-0 + truncate so the action cluster never gets pushed off-screen", () => {
    // Without min-w-0 the title block grows to its content width and
    // the action buttons get clipped. truncate gives a controlled
    // ellipsis instead.
    expect(source).toMatch(
      /<div className="min-w-0">[\s\S]{0,400}<p className="truncate text-xs text-muted-foreground"/
    );
  });

  it("each per-page action carries an explicit aria-label naming the page number (no icon-only ambiguity)", () => {
    // The Open buttons are icon + text on wide screens, but screen
    // readers always read the aria-label first. Naming the page number
    // tells the SR user exactly what will happen.
    expect(source).toMatch(/aria-label=\{`Ouvrir l'image de la page \$\{page\.pageNumber\} dans un nouvel onglet`\}/);
    expect(source).toMatch(/aria-label=\{`Ouvrir la page \$\{page\.pageNumber\} du PDF dans un nouvel onglet`\}/);
  });
});

describe("document-extraction-audit-dialog.tsx — B5.2 fallback for non-PDF documents (no preview)", () => {
  // B5.3 round 2 — the non-PDF fallback that used to live in
  // `PageSourcePreview` (gated on `!previewImageUrl`) MOVED to
  // `EmptyDocumentPreview`. The contract is now: PageSourcePreview is
  // PDF-only; everything non-PDF (with or without pages) routes
  // through EmptyDocumentPreview at the parent level. These guards
  // are re-anchored on the new location.

  it("EmptyDocumentPreview owns the non-image fallback CTAs (download + open-in-new-tab)", () => {
    // The user still needs a path to the file. Download + open-in-tab
    // cover the two common needs (consult vs save locally). Anchored
    // on the function body, not on the legacy `!previewImageUrl` branch.
    expect(source).toMatch(/function\s+EmptyDocumentPreview[\s\S]{0,8000}<Download className/);
    expect(source).toMatch(/function\s+EmptyDocumentPreview[\s\S]{0,8000}<ExternalLink className/);
  });

  it("download CTA in the EmptyDocumentPreview fallback uses the attachment-disposition route (saves the file, not renders it)", () => {
    // Symmetric to the header download action — same /download route,
    // no `?disposition=inline` → server defaults to attachment.
    expect(source).toMatch(
      /function\s+EmptyDocumentPreview[\s\S]{0,1500}downloadUrl\s*=\s*`\/api\/documents\/\$\{documentId\}\/download`/
    );
  });

  it("fallback CTAs are aria-labelled with the documentName (sr users know what they're saving)", () => {
    expect(source).toMatch(
      /aria-label=\{`Ouvrir \$\{documentName\} dans un nouvel onglet`\}/
    );
    expect(source).toMatch(
      /aria-label=\{`Télécharger \$\{documentName\}`\}/
    );
  });

  it("non-image fallback CTA uses variant=default on the download (primary action)", () => {
    // Hierarchy preserved across the refactor: Télécharger is the
    // always-works path, Open-in-tab is the helpful-but-non-essential
    // secondary.
    expect(source).toMatch(
      /function\s+EmptyDocumentPreview[\s\S]{0,8000}variant="default"[\s\S]{0,500}Télécharger/
    );
  });
});

// ============================================================
// B5.3 — Preview formats (image direct, Office/PPT fallback, no dead-end)
// ============================================================
describe("document-extraction-audit-dialog.tsx — B5.3 image preview + category-aware fallback", () => {
  it("REMOVES the 'Aucune page extraite' dead-end branch (replaced by EmptyDocumentPreview)", () => {
    // The legacy branch was a textual dead-end with no way to access
    // the file. Anti-regression guard: the text must NOT be hardcoded
    // anywhere in the source — the new EmptyDocumentPreview gives the
    // user a category-specific heading + download CTAs.
    expect(source).not.toMatch(/>\s*Aucune page extraite\s*</);
    // The empty-pages branch must wire EmptyDocumentPreview instead.
    expect(source).toMatch(/<EmptyDocumentPreview\s+documentId=/);
  });

  it("EmptyDocumentPreview receives documentId + documentName + mimeType (full context for category routing)", () => {
    // Without mimeType the component can't choose between image preview
    // and download CTA. Without documentName the aria-labels would be
    // generic. Without documentId no URL can be built.
    expect(source).toMatch(
      /<EmptyDocumentPreview[\s\S]{0,400}documentId=\{audit\.document\.id\}[\s\S]{0,400}documentName=\{audit\.document\.name\}[\s\S]{0,400}mimeType=\{audit\.document\.mimeType\s*\?\?\s*null\}/
    );
  });

  it("categorizeDocumentMime returns 'image' for image/* mime types", () => {
    // The helper drives the entire routing inside EmptyDocumentPreview.
    // Anchor on the explicit image/* prefix check so a future regression
    // that adds an allowlist breaking JPG/PNG/WebP is caught.
    expect(source).toMatch(
      /function\s+categorizeDocumentMime[\s\S]{0,500}mimeType\.startsWith\("image\/"\)\)\s*return\s*"image"/
    );
  });

  it("categorizeDocumentMime routes the Office family (Excel + PowerPoint + Word, both old + xml formats) to 'office'", () => {
    // All 6 mime types must collapse to a single bucket — the message
    // and the lack-of-inline-render are uniform across the family.
    expect(source).toMatch(/spreadsheetml\.sheet/); // xlsx
    expect(source).toMatch(/vnd\.ms-excel/); // xls
    expect(source).toMatch(/presentationml\.presentation/); // pptx
    expect(source).toMatch(/vnd\.ms-powerpoint/); // ppt
    expect(source).toMatch(/wordprocessingml\.document/); // docx
    expect(source).toMatch(/application\/msword/); // doc
    expect(source).toMatch(/return\s*"office"/);
  });

  it("categorizeDocumentMime returns 'pdf' for application/pdf and 'other' for unknown / null", () => {
    expect(source).toMatch(/mimeType\s*===\s*"application\/pdf"\)\s*return\s*"pdf"/);
    expect(source).toMatch(/if\s*\(!mimeType\)\s*return\s*"other"/);
    expect(source).toMatch(/return\s*"other";?\s*\}/);
  });

  it("image branch renders the source file inline via /download?disposition=inline (no per-page rasterisation)", () => {
    // For images the browser can render the file natively — no need to
    // hit /preview-pages (which only handles PDFs). The URL must use
    // inline-disposition so the browser doesn't force a download.
    expect(source).toMatch(/inlineUrl\s*=\s*`\/api\/documents\/\$\{documentId\}\/download\?disposition=inline`/);
    expect(source).toMatch(/category\s*===\s*"image"[\s\S]{0,3500}src=\{inlineUrl\}/);
  });

  it("image branch reuses the skeleton + loaded/failed mutual-exclusion pattern (consistency with PageSourcePreview)", () => {
    // Same shape as B5.1 P2 fix: handlers add to one Set and remove from
    // the other, so `previewLoaded` and `previewFailed` are disjoint.
    // We re-assert here because it's a separate component (the contract
    // could regress independently of PageSourcePreview).
    expect(source).toMatch(
      /function\s+EmptyDocumentPreview[\s\S]{0,4000}setFailedUrls\([\s\S]{0,400}next\.delete\(url\)/
    );
    expect(source).toMatch(
      /function\s+EmptyDocumentPreview[\s\S]{0,4000}setLoadedUrls\([\s\S]{0,400}next\.delete\(url\)/
    );
    // Skeleton import is already covered by B5.1 — but verify it's
    // actually used in the image branch.
    expect(source).toMatch(/category\s*===\s*"image"[\s\S]{0,2500}<Skeleton/);
  });

  it("image branch has aria-label / alt anchored to documentName (sr context)", () => {
    expect(source).toMatch(/aria-label=\{`Chargement de l'image \$\{documentName\}`\}/);
    expect(source).toMatch(/<img[\s\S]{0,500}alt=\{documentName\}/);
  });

  it("non-image fallback shows category-specific heading + detail (PDF-no-pages vs Office vs other)", () => {
    // Each category gets a heading that names the actual problem the
    // user is facing. Generic "indisponible" is the last resort, not
    // the default.
    expect(source).toMatch(/case\s*"pdf":[\s\S]{0,500}"Aucune page extraite pour ce PDF"/);
    expect(source).toMatch(/case\s*"office":[\s\S]{0,500}"Format Office non prévisualisable"/);
    expect(source).toMatch(
      /case\s*"pdf":[\s\S]{0,1500}relancez l'extraction depuis le header/
    );
    expect(source).toMatch(
      /case\s*"office":[\s\S]{0,1500}Excel, PowerPoint et Word ne peuvent pas être rendus inline/
    );
  });

  it("non-image fallback CTAs preserve the B5.2 contract: Télécharger=variant default, Open=variant outline", () => {
    // Hierarchy stays consistent with PageSourcePreview's !previewImageUrl
    // branch (B5.2). Download is the always-works path; Open is helpful
    // for the user who just wants a quick look in another tab.
    expect(source).toMatch(
      /function\s+EmptyDocumentPreview[\s\S]{0,8000}variant="default"[\s\S]{0,500}<Download/
    );
    expect(source).toMatch(
      /function\s+EmptyDocumentPreview[\s\S]{0,8000}variant="outline"[\s\S]{0,500}<ExternalLink/
    );
  });

  it("non-image fallback wires downloadUrl=/download (attachment) and inlineUrl=/download?disposition=inline", () => {
    // Same contract as B5.2 header — no `?disposition=...` defaults to
    // attachment in the route. The fallback CTAs MUST NOT swap these
    // URLs or the user clicking "Télécharger" would get an inline view.
    expect(source).toMatch(/downloadUrl\s*=\s*`\/api\/documents\/\$\{documentId\}\/download`/);
    expect(source).toMatch(/inlineUrl\s*=\s*`\/api\/documents\/\$\{documentId\}\/download\?disposition=inline`/);
  });

  it("EmptyDocumentPreview is the ONLY new component rendered in the no-pages branch (no leftover dead-end variants)", () => {
    // After B5.3 the no-pages branch must be exactly one component.
    // Defensive: a regression that left both the legacy text + the new
    // component would render two preview panels stacked. The branch
    // structure is `</div>) : (\n   ...comment...\n   <EmptyDocumentPreview`
    // — anchor on the false-branch opening + the component.
    const noPagesBranchMatch = source.match(
      /<\/div>\s*\)\s*:\s*\([\s\S]{0,2000}<EmptyDocumentPreview/
    );
    expect(noPagesBranchMatch).not.toBeNull();
    // No "Aucune page extraite" or other legacy fallback strings inside
    // the no-pages branch.
    const branchSlice = noPagesBranchMatch?.[0] ?? "";
    expect(branchSlice).not.toMatch(/>\s*Aucune page extraite\s*</);
  });

  it("image preview surface DOES NOT call /preview-pages (that route is PDF-rasterisation only)", () => {
    // Anti-regression: a future refactor could try to "unify" by
    // routing image previews through /preview-pages — that route only
    // knows how to rasterise PDF pages and would 500 on an image doc.
    // The image branch must use /download?disposition=inline directly.
    expect(source).not.toMatch(
      /category\s*===\s*"image"[\s\S]{0,3500}preview-pages/
    );
  });
});

// ============================================================
// B5.3 round 2 — Codex P1: category-first routing (PageSourcePreview is PDF-only)
// ============================================================
describe("document-extraction-audit-dialog.tsx — B5.3 round 2 category-first routing", () => {
  it("Codex B5.3 P1 — derives documentCategory at the dialog body level (single source of truth for the JSX branch)", () => {
    // Without a category derived at the parent, the JSX branch can't
    // pick the right preview surface. Anchor on the assignment so the
    // helper call doesn't get refactored to a local-to-PageSourcePreview
    // computation (which is precisely the bug we're closing).
    expect(source).toMatch(
      /const\s+documentCategory\s*=\s*categorizeDocumentMime\(audit\?\.document\.mimeType\s*\?\?\s*null\)/
    );
  });

  it("Codex B5.3 P1 — PageSourcePreview is invoked ONLY in the `documentCategory === \"pdf\" && pageToInspect` branch", () => {
    // The pre-fix code rendered <PageSourcePreview /> whenever
    // pageToInspect was set, regardless of mime — that's how images
    // with one extraction page were hitting the generic fallback. The
    // ternary condition must include the category check.
    expect(source).toMatch(
      /\{documentCategory\s*===\s*"pdf"\s*&&\s*pageToInspect\s*\?\s*\([\s\S]{0,2000}<PageSourcePreview/
    );
  });

  it("Codex B5.3 P1 — non-PDF documents WITH a pageToInspect still route through EmptyDocumentPreview (NOT the generic PageSourcePreview fallback)", () => {
    // The Codex review demanded this guard explicitly. The contract is
    // structural: when `documentCategory !== "pdf"`, the ternary
    // collapses to the false branch (EmptyDocumentPreview) regardless
    // of whether pageToInspect is set. So an image with 1 extracted
    // page renders the inline image, and an Office doc with extracted
    // sheets renders the office-specific CTAs.
    //
    // We assert this by checking that the SECOND branch of the ternary
    // (the `else` after `pageToInspect ? (...) :`) is exclusively
    // EmptyDocumentPreview — there's no `<PageSourcePreview` in it.
    const elseBranchMatch = source.match(
      /documentCategory\s*===\s*"pdf"\s*&&\s*pageToInspect\s*\?\s*\([\s\S]+?<\/div>\s*\)\s*:\s*\(([\s\S]{0,3000})\)\}/
    );
    expect(elseBranchMatch).not.toBeNull();
    const elseBranch = elseBranchMatch?.[1] ?? "";
    expect(elseBranch).toMatch(/<EmptyDocumentPreview/);
    expect(elseBranch).not.toMatch(/<PageSourcePreview/);
  });

  it("Codex B5.3 P1 — PageSourcePreview signature no longer accepts `isPdf` (it's PDF-only by contract)", () => {
    // Dropping the prop makes the contract explicit at the type
    // system level: a caller cannot pretend a non-PDF is OK because
    // the prop doesn't exist anymore.
    expect(source).toMatch(
      /function\s+PageSourcePreview\(\{[\s\S]{0,200}page,[\s\S]{0,200}documentId,[\s\S]{0,200}documentName,[\s\S]{0,200}preloadImageUrls/
    );
    // The `isPdf` prop is gone from both destructure and type.
    expect(source).not.toMatch(/function\s+PageSourcePreview\(\{[\s\S]{0,400}\bisPdf\b/);
    expect(source).not.toMatch(/isPdf:\s*boolean/);
  });

  it("Codex B5.3 P1 — PageSourcePreview no longer has the `!previewImageUrl` dead-end fallback (PDF guarantees a non-null URL)", () => {
    // The legacy fallback branch was where the user's image with one
    // page used to land. Removing it makes a regression structurally
    // impossible — a non-PDF caller would either fail loudly (URL
    // computation requires page) or, more likely, be caught by the
    // parent category gate.
    expect(source).not.toMatch(/if\s*\(!previewImageUrl\)\s*\{/);
  });

  it("Codex B5.3 P1 — PageSourcePreview always computes previewImageUrl + pageUrl (no isPdf ternary)", () => {
    // The legacy `isPdf ? getPreviewImageUrl(...) : null` is gone. The
    // direct assignment is the contract: PageSourcePreview is invoked
    // with a PDF + a page → URL is always defined.
    expect(source).toMatch(
      /const\s+previewImageUrl\s*=\s*getPreviewImageUrl\(documentId,\s*page\);/
    );
    expect(source).not.toMatch(/previewImageUrl\s*=\s*isPdf\s*\?/);
  });

  it("Codex B5.3 P1 — PageSourcePreview invocation no longer passes `isPdf={...}` (prop dropped, call site cleaned)", () => {
    // Anti-regression on the call site too — passing a removed prop
    // would be a type error, but if the prop got re-added with a
    // default it could re-introduce the bug silently. Asserting the
    // call shape directly catches it.
    expect(source).not.toMatch(/<PageSourcePreview[\s\S]{0,400}isPdf=/);
  });

  it("Codex B5.3 P1 — the page-list aside (left column) is preserved (Office sheets / slides still navigable)", () => {
    // The category-first routing decision affects the MIDDLE preview
    // surface only. The left page-list is still useful for Office
    // docs (sheet/slide nav) + image docs (the one page row is harmless).
    // Anchor on the left aside markup — if a future refactor collapses
    // it for non-PDFs, this guard catches it.
    // B12.3 P1 #5 — class list updated: `min-h-0` is now gated to lg
    // so the aside grows to natural content height at sub-lg (where
    // the 3-col grid collapses to a vertical stack and the outer
    // grid scrolls instead of clipping). The lg:border-* anchors
    // stay so the 3-col layout is preserved at lg+.
    expect(source).toMatch(
      /<aside\s+className="flex flex-col border-b bg-background lg:min-h-0 lg:border-b-0 lg:border-r"/
    );
  });
});
