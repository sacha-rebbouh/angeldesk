/**
 * Phase B3.2 — Upload session storage unit tests.
 *
 * Covers the recovery contract: save / load / clear, TTL expiry, schema
 * version mismatch, malformed payload, SSR no-op, per-dealId scoping.
 */
import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";

// In-memory localStorage polyfill — Node vitest env has no `window`. We
// install a minimal Web Storage shim before the module under test is
// loaded so its `typeof window === "undefined"` guard exits the SSR
// fallback and exercises the real persistence path.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

beforeAll(() => {
  (globalThis as { window?: { localStorage: Storage } }).window = {
    localStorage: new MemoryStorage(),
  };
});
afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

import {
  clearUploadSession,
  loadUploadSession,
  saveUploadSession,
  type PersistedUploadItem,
} from "../upload-session-storage";

const DEAL_A = "deal_a";
const DEAL_B = "deal_b";
const SESSION_A = "upl_session_a";
const ITEM_A: PersistedUploadItem = {
  id: "item_1",
  name: "deck.pdf",
  size: 12_345,
  type: "application/pdf",
  lastModified: 1_700_000_000_000,
  documentType: "PITCH_DECK",
  customType: "",
};

function ensureCleanStorage() {
  if (typeof window === "undefined") return;
  // Use the Storage interface (length + key(i)) so the cleanup works on
  // both the real browser localStorage AND our MemoryStorage polyfill
  // (whose keys live in a private Map, not as own-properties).
  const storage = window.localStorage;
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k && k.startsWith("angeldesk:upload-session:v1:")) keysToRemove.push(k);
  }
  for (const k of keysToRemove) storage.removeItem(k);
}

describe("upload-session-storage — happy path", () => {
  beforeEach(ensureCleanStorage);

  it("save → load round-trip preserves sessionId + items + dealId", () => {
    saveUploadSession(DEAL_A, SESSION_A, [ITEM_A]);
    const loaded = loadUploadSession(DEAL_A);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe(SESSION_A);
    expect(loaded?.dealId).toBe(DEAL_A);
    expect(loaded?.items).toEqual([ITEM_A]);
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.savedAt).toBeGreaterThan(0);
  });

  it("clearUploadSession removes the entry", () => {
    saveUploadSession(DEAL_A, SESSION_A, [ITEM_A]);
    expect(loadUploadSession(DEAL_A)).not.toBeNull();
    clearUploadSession(DEAL_A);
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("saveUploadSession with empty items array clears the snapshot (parity with clearUploadSession)", () => {
    saveUploadSession(DEAL_A, SESSION_A, [ITEM_A]);
    expect(loadUploadSession(DEAL_A)).not.toBeNull();
    saveUploadSession(DEAL_A, SESSION_A, []);
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("B3.2 — per-dealId scoping: dealB cannot read dealA's session", () => {
    saveUploadSession(DEAL_A, SESSION_A, [ITEM_A]);
    expect(loadUploadSession(DEAL_B)).toBeNull();
    expect(loadUploadSession(DEAL_A)?.sessionId).toBe(SESSION_A);
  });

  it("multiple items preserved in order", () => {
    const items: PersistedUploadItem[] = [
      { ...ITEM_A, id: "i1", name: "a.pdf" },
      { ...ITEM_A, id: "i2", name: "b.pdf" },
      { ...ITEM_A, id: "i3", name: "c.pdf" },
    ];
    saveUploadSession(DEAL_A, SESSION_A, items);
    expect(loadUploadSession(DEAL_A)?.items.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
  });
});

describe("upload-session-storage — TTL + schema version", () => {
  beforeEach(ensureCleanStorage);

  it("TTL expiry: snapshot older than maxAgeMs → null + cleared", () => {
    saveUploadSession(DEAL_A, SESSION_A, [ITEM_A]);
    const nowMs = Date.now() + 25 * 60 * 60 * 1000; // +25h
    const loaded = loadUploadSession(DEAL_A, { nowMs, maxAgeMs: 24 * 60 * 60 * 1000 });
    expect(loaded).toBeNull();
    // Should have cleared the entry as a side-effect.
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("schema version mismatch (v999) → null + cleared (defensive against future migrations)", () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "angeldesk:upload-session:v1:" + DEAL_A,
      JSON.stringify({
        schemaVersion: 999,
        sessionId: SESSION_A,
        dealId: DEAL_A,
        savedAt: Date.now(),
        items: [ITEM_A],
      })
    );
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("malformed JSON → null + cleared (defensive)", () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("angeldesk:upload-session:v1:" + DEAL_A, "{not-json");
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("missing required field (no items array) → null + cleared", () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "angeldesk:upload-session:v1:" + DEAL_A,
      JSON.stringify({ schemaVersion: 1, sessionId: SESSION_A, dealId: DEAL_A, savedAt: Date.now() })
    );
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("item with non-string id → entire session rejected (anti-poisoning)", () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "angeldesk:upload-session:v1:" + DEAL_A,
      JSON.stringify({
        schemaVersion: 1,
        sessionId: SESSION_A,
        dealId: DEAL_A,
        savedAt: Date.now(),
        items: [{ ...ITEM_A, id: 42 }],
      })
    );
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("B3.3 P3 — item avec documentType inconnu rejette toute la session (enum validation)", () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "angeldesk:upload-session:v1:" + DEAL_A,
      JSON.stringify({
        schemaVersion: 1,
        sessionId: SESSION_A,
        dealId: DEAL_A,
        savedAt: Date.now(),
        items: [{ ...ITEM_A, documentType: "RENAMED_OR_REMOVED_TYPE" }],
      })
    );
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("B3.3 P3 — chaque documentType de l'enum est accepté", () => {
    if (typeof window === "undefined") return;
    const enumTypes = [
      "PITCH_DECK",
      "FINANCIAL_MODEL",
      "CAP_TABLE",
      "TERM_SHEET",
      "INVESTOR_MEMO",
      "FINANCIAL_STATEMENTS",
      "LEGAL_DOCS",
      "MARKET_STUDY",
      "PRODUCT_DEMO",
      "OTHER",
    ];
    for (const t of enumTypes) {
      saveUploadSession(DEAL_A, SESSION_A, [{ ...ITEM_A, documentType: t }]);
      expect(loadUploadSession(DEAL_A)?.items[0]?.documentType).toBe(t);
    }
  });
});

describe("upload-session-storage — degraded environments", () => {
  beforeEach(ensureCleanStorage);

  it("empty dealId / sessionId → save no-op (defensive)", () => {
    saveUploadSession("", SESSION_A, [ITEM_A]);
    saveUploadSession(DEAL_A, "", [ITEM_A]);
    expect(loadUploadSession(DEAL_A)).toBeNull();
  });

  it("empty dealId → load returns null", () => {
    expect(loadUploadSession("")).toBeNull();
  });

  it("clear is idempotent (no entry → no throw)", () => {
    expect(() => clearUploadSession(DEAL_A)).not.toThrow();
    expect(() => clearUploadSession(DEAL_A)).not.toThrow();
  });
});

describe("upload-session-storage — privacy surface (no file bytes)", () => {
  beforeEach(ensureCleanStorage);

  it("only whitelisted metadata fields are serialised", () => {
    // Even if the caller smuggles extra fields onto the item, the saved
    // shape must be the strict PersistedUploadItem.
    const polluted = {
      ...ITEM_A,
      blobUrl: "https://blob.vercel-storage.com/x?token=SECRET",
      arrayBuffer: "shouldnotpersist",
    } as PersistedUploadItem;
    saveUploadSession(DEAL_A, SESSION_A, [polluted]);
    const raw = typeof window !== "undefined"
      ? window.localStorage.getItem("angeldesk:upload-session:v1:" + DEAL_A) ?? ""
      : "";
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("blob.vercel-storage");
    expect(raw).not.toContain("arrayBuffer");
    expect(raw).not.toContain("shouldnotpersist");
  });
});
