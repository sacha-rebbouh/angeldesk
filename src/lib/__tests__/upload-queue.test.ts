/**
 * Phase B0/B1 — Upload queue unit tests.
 *
 * Covers:
 *   - 6 files added in one dispatch → 6 deterministic items
 *   - State transitions are pure
 *   - `createQueueItem(file)` does NOT invoke any heavy File API
 *     (FileReader, arrayBuffer, text, slice, stream). This is the
 *     core guarantee that picker selection cannot freeze the UI.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createQueueItem,
  initialQueueState,
  uploadQueueReducer,
  type UploadQueueAction,
  type UploadQueueItem,
} from "../upload-queue";

function mkItem(over: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    id: over.id ?? `id_${Math.random().toString(36).slice(2, 8)}`,
    name: "test.pdf",
    size: 12_345,
    type: "application/pdf",
    lastModified: 1_700_000_000_000,
    documentType: "PITCH_DECK",
    customType: "",
    state: "selected",
    ...over,
  };
}

describe("uploadQueueReducer — add_items", () => {
  it("ajoute 6 items en une seule dispatch (≤ O(N) métadonnées)", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      mkItem({ id: `f_${i}`, name: `file_${i}.pdf` })
    );
    const next = uploadQueueReducer(initialQueueState, { kind: "add_items", items });
    expect(next).toHaveLength(6);
    expect(next.map((i) => i.id)).toEqual(["f_0", "f_1", "f_2", "f_3", "f_4", "f_5"]);
    expect(next.every((i) => i.state === "selected")).toBe(true);
  });

  it("idempotent sur id collision — pas de doublon de row", () => {
    const a = mkItem({ id: "dup" });
    const b = mkItem({ id: "dup" });
    const first = uploadQueueReducer(initialQueueState, { kind: "add_items", items: [a] });
    const second = uploadQueueReducer(first, { kind: "add_items", items: [b] });
    expect(second).toHaveLength(1);
    expect(second).toBe(first); // same reference when no-op
  });

  it("renvoie le state inchangé quand items vide", () => {
    const state = [mkItem({ id: "x" })];
    const next = uploadQueueReducer(state, { kind: "add_items", items: [] });
    expect(next).toBe(state);
  });
});

describe("uploadQueueReducer — transitions déterministes", () => {
  it("set_state met à jour uniquement l'item ciblé", () => {
    const state = [mkItem({ id: "a" }), mkItem({ id: "b" })];
    const next = uploadQueueReducer(state, { kind: "set_state", id: "b", state: "uploading" });
    expect(next[0].state).toBe("selected");
    expect(next[1].state).toBe("uploading");
  });

  it("set_validation ok=true → state=validated, validationError undefined", () => {
    const state = [mkItem({ id: "a", state: "validating" })];
    const next = uploadQueueReducer(state, { kind: "set_validation", id: "a", ok: true });
    expect(next[0].state).toBe("validated");
    expect(next[0].validationError).toBeUndefined();
  });

  it("set_validation ok=false → state=error + validationError + error message", () => {
    const state = [mkItem({ id: "a", state: "validating" })];
    const next = uploadQueueReducer(state, {
      kind: "set_validation",
      id: "a",
      ok: false,
      error: "Fichier trop volumineux",
    });
    expect(next[0].state).toBe("error");
    expect(next[0].validationError).toBe("Fichier trop volumineux");
    expect(next[0].error).toBe("Fichier trop volumineux");
  });

  it("B2.2 — set_state vers un état ≠ 'error' clear le stale error (retry flow)", () => {
    const state = [mkItem({ id: "a", state: "error", error: "HTTP 500 from /api/documents/upload" })];
    const next = uploadQueueReducer(state, { kind: "set_state", id: "a", state: "validated" });
    expect(next[0].state).toBe("validated");
    expect(next[0].error).toBeUndefined();
  });

  it("B2.2 — set_state vers 'error' avec message stamp le nouveau message", () => {
    const state = [mkItem({ id: "a", state: "uploading" })];
    const next = uploadQueueReducer(state, {
      kind: "set_state",
      id: "a",
      state: "error",
      error: "Nouvelle erreur",
    });
    expect(next[0].state).toBe("error");
    expect(next[0].error).toBe("Nouvelle erreur");
  });

  it("B2.2 — set_state vers 'error' SANS message conserve l'ancien error (défensif)", () => {
    const state = [mkItem({ id: "a", state: "error", error: "Erreur d'origine" })];
    const next = uploadQueueReducer(state, { kind: "set_state", id: "a", state: "error" });
    expect(next[0].error).toBe("Erreur d'origine");
  });

  it("B2.3 — set_state 'uploading' → 'cancelled' transition + error cleared", () => {
    const state = [mkItem({ id: "a", state: "uploading", error: "Old error somehow" })];
    const next = uploadQueueReducer(state, { kind: "set_state", id: "a", state: "cancelled" });
    expect(next[0].state).toBe("cancelled");
    expect(next[0].error).toBeUndefined();
  });

  it("B2.3 — set_state 'extracting' → 'cancelled' (cancel pendant async OCR)", () => {
    const state = [mkItem({ id: "a", state: "extracting" })];
    const next = uploadQueueReducer(state, { kind: "set_state", id: "a", state: "cancelled" });
    expect(next[0].state).toBe("cancelled");
  });

  it("B2.4 — set_state vers 'error' stamp errorCategory + errorActionLabel + errorActionData", () => {
    const state = [mkItem({ id: "a", state: "uploading" })];
    const next = uploadQueueReducer(state, {
      kind: "set_state",
      id: "a",
      state: "error",
      error: "Document identique déjà présent",
      errorCategory: "duplicate",
      errorActionLabel: "Voir le document existant",
      errorActionData: { kind: "view_existing_document", documentId: "doc_42", documentName: "deck.pdf" },
    });
    expect(next[0].state).toBe("error");
    expect(next[0].errorCategory).toBe("duplicate");
    expect(next[0].errorActionLabel).toBe("Voir le document existant");
    expect(next[0].errorActionData).toEqual({
      kind: "view_existing_document",
      documentId: "doc_42",
      documentName: "deck.pdf",
    });
  });

  it("B2.4 — set_state hors 'error' clear errorCategory + errorActionLabel + errorActionData (retry/cancel flows)", () => {
    const state = [
      mkItem({
        id: "a",
        state: "error",
        error: "Old failure",
        errorCategory: "duplicate",
        errorActionLabel: "Voir le doc",
        errorActionData: { kind: "view_existing_document", documentId: "x", documentName: "y" },
      }),
    ];
    const next = uploadQueueReducer(state, { kind: "set_state", id: "a", state: "validated" });
    expect(next[0].errorCategory).toBeUndefined();
    expect(next[0].errorActionLabel).toBeUndefined();
    expect(next[0].errorActionData).toBeUndefined();
  });

  it("B2.4 — set_state error sans category/action clear les anciens (refresh défensif)", () => {
    // Re-erroring without passing category should NOT keep the stale
    // duplicate cue.
    const state = [
      mkItem({
        id: "a",
        state: "error",
        error: "first failure",
        errorCategory: "duplicate",
        errorActionLabel: "Voir",
      }),
    ];
    const next = uploadQueueReducer(state, {
      kind: "set_state",
      id: "a",
      state: "error",
      error: "new failure",
    });
    expect(next[0].error).toBe("new failure");
    expect(next[0].errorCategory).toBeUndefined();
    expect(next[0].errorActionLabel).toBeUndefined();
  });

  it("remove retire l'item ciblé uniquement", () => {
    const state = [mkItem({ id: "a" }), mkItem({ id: "b" }), mkItem({ id: "c" })];
    const next = uploadQueueReducer(state, { kind: "remove", id: "b" });
    expect(next.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("reset vide la queue", () => {
    const state = [mkItem({ id: "a" }), mkItem({ id: "b" })];
    const next = uploadQueueReducer(state, { kind: "reset" });
    expect(next).toEqual([]);
  });

  it("action inconnue → state inchangé (exhaustive guard)", () => {
    const state = [mkItem({ id: "a" })];
    // @ts-expect-error — testing runtime guard
    const next = uploadQueueReducer(state, { kind: "nonexistent" } as UploadQueueAction);
    expect(next).toBe(state);
  });

  it("B3.2 — restore_session ajoute items avec needsReselect=true forcé", () => {
    const restored = mkItem({ id: "r1", needsReselect: false });
    const next = uploadQueueReducer([], { kind: "restore_session", items: [restored] });
    expect(next).toHaveLength(1);
    expect(next[0].needsReselect).toBe(true);
  });

  it("B3.2 — restore_session idempotent sur id collision (skip existing)", () => {
    const existing = mkItem({ id: "x" });
    const state = [existing];
    const next = uploadQueueReducer(state, {
      kind: "restore_session",
      items: [mkItem({ id: "x", needsReselect: true })],
    });
    expect(next).toBe(state);
  });

  it("B3.2 — attach_file_to_item clear needsReselect + transition vers 'selected'", () => {
    const state = [
      mkItem({
        id: "a",
        state: "error",
        needsReselect: true,
        error: "old failure pre-refresh",
        errorCategory: "duplicate",
        errorActionLabel: "Voir",
      }),
    ];
    const next = uploadQueueReducer(state, { kind: "attach_file_to_item", id: "a" });
    expect(next[0].state).toBe("selected");
    expect(next[0].needsReselect).toBeUndefined();
    expect(next[0].error).toBeUndefined();
    expect(next[0].errorCategory).toBeUndefined();
    expect(next[0].errorActionLabel).toBeUndefined();
  });

  it("B3.2 — attach_file_to_item sur id inconnu = no-op", () => {
    const state = [mkItem({ id: "a", needsReselect: true })];
    const next = uploadQueueReducer(state, { kind: "attach_file_to_item", id: "ghost" });
    expect(next[0].needsReselect).toBe(true);
  });

  it("Codex B3.2.1 P2 — attach_file_to_item avec refreshedMetadata met à jour name/size/type/lastModified", () => {
    // The re-selected file differs from the original snapshot. Without
    // refresh, validation (size cap) + upload-route choice (server vs
    // blob) would use the stale numbers.
    const state = [
      mkItem({ id: "a", needsReselect: true, name: "old.pdf", size: 100, type: "application/pdf", lastModified: 1 }),
    ];
    const next = uploadQueueReducer(state, {
      kind: "attach_file_to_item",
      id: "a",
      refreshedMetadata: {
        name: "corrected.pdf",
        size: 5_000_000,
        type: "application/octet-stream",
        lastModified: 9_999,
      },
    });
    expect(next[0].name).toBe("corrected.pdf");
    expect(next[0].size).toBe(5_000_000);
    expect(next[0].type).toBe("application/octet-stream");
    expect(next[0].lastModified).toBe(9_999);
    expect(next[0].state).toBe("selected");
    expect(next[0].needsReselect).toBeUndefined();
  });

  it("Codex B3.2.1 P2 — attach_file_to_item SANS refreshedMetadata conserve les fields d'origine", () => {
    const state = [
      mkItem({ id: "a", needsReselect: true, name: "deck.pdf", size: 4242, type: "application/pdf", lastModified: 7 }),
    ];
    const next = uploadQueueReducer(state, { kind: "attach_file_to_item", id: "a" });
    expect(next[0].name).toBe("deck.pdf");
    expect(next[0].size).toBe(4242);
    expect(next[0].type).toBe("application/pdf");
    expect(next[0].lastModified).toBe(7);
  });
});

describe("createQueueItem — n'invoque AUCUNE API File coûteuse (B1 anti-freeze)", () => {
  it("ne lit pas le contenu du fichier (FileReader/arrayBuffer/text/slice/stream)", () => {
    const file = new File(["a".repeat(1024)], "deck.pdf", {
      type: "application/pdf",
      lastModified: 1_700_000_000_000,
    });
    // Node test env doesn't ship FileReader. Install a sentinel that throws
    // if anything in createQueueItem ever tries to instantiate it — proves
    // the picker path stays browser-API-pure.
    const fileReaderConstructions: unknown[] = [];
    const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;
    class SentinelFileReader {
      constructor() {
        fileReaderConstructions.push(this);
      }
    }
    (globalThis as { FileReader?: unknown }).FileReader = SentinelFileReader;

    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");
    const textSpy = vi.spyOn(file, "text");
    const sliceSpy = vi.spyOn(file, "slice");
    const streamSpy = vi.spyOn(file, "stream");

    try {
      const item = createQueueItem(file, { documentType: "PITCH_DECK" });

      expect(fileReaderConstructions).toHaveLength(0);
      expect(arrayBufferSpy).not.toHaveBeenCalled();
      expect(textSpy).not.toHaveBeenCalled();
      expect(sliceSpy).not.toHaveBeenCalled();
      expect(streamSpy).not.toHaveBeenCalled();
      // Sanity: the item carries only metadata.
      expect(item.name).toBe("deck.pdf");
      expect(item.size).toBe(1024);
      expect(item.type).toBe("application/pdf");
      expect(item.lastModified).toBe(1_700_000_000_000);
    } finally {
      // Restore (or delete if absent originally) to avoid leaking into other tests.
      if (originalFileReader === undefined) {
        delete (globalThis as { FileReader?: unknown }).FileReader;
      } else {
        (globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
      }
    }
  });

  it("génère un id stable par appel (UUID format ou fallback timestamp_random)", () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    const a = createQueueItem(file, { documentType: "PITCH_DECK" });
    const b = createQueueItem(file, { documentType: "PITCH_DECK" });
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThan(8);
  });

  it("état initial 'selected' systématiquement", () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    const item = createQueueItem(file, { documentType: "FINANCIAL_MODEL" });
    expect(item.state).toBe("selected");
    expect(item.documentType).toBe("FINANCIAL_MODEL");
    expect(item.customType).toBe("");
  });

  it("6 fichiers transformés en items en un tick synchrone (smoke timing)", () => {
    const files = Array.from(
      { length: 6 },
      (_, i) => new File([`x${i}`], `f${i}.pdf`, { type: "application/pdf" })
    );
    const t0 = performance.now();
    const items = files.map((f) => createQueueItem(f, { documentType: "PITCH_DECK" }));
    const elapsed = performance.now() - t0;
    expect(items).toHaveLength(6);
    // Generous bound — the point is "well under one render frame".
    expect(elapsed).toBeLessThan(50);
  });
});
