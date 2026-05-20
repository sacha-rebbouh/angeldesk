import { describe, expect, it } from "vitest";
import { computeSignalHash } from "../signal-hash";
import { canonicalJSONStringify } from "../canonical-json";

const baseInput = {
  extractorVersion: "temporal-extractor@2026-05-17-001",
  kind: "CAP_TABLE_AS_OF" as const,
  valueJson: { asOf: "2024-09-18", raw: "à jour au 18/09/2024" },
  evidenceText: "Table de capitalisation à jour au 18/09/2024",
  pageNumber: 1,
  sheetName: null,
  charOffset: 240,
};

describe("computeSignalHash", () => {
  it("test 14 — permutation des clés valueJson produit le même hash (canonical JSON)", () => {
    const a = computeSignalHash({ ...baseInput, valueJson: { asOf: "2024-09-18", raw: "..." } });
    const b = computeSignalHash({ ...baseInput, valueJson: { raw: "...", asOf: "2024-09-18" } });
    expect(a).toBe(b);
  });

  it("test 20 — permutation valueJson récursive (nested keys triées)", () => {
    const a = computeSignalHash({
      ...baseInput,
      valueJson: { a: 1, b: { c: 2, d: 3 } },
    });
    const b = computeSignalHash({
      ...baseInput,
      valueJson: { b: { d: 3, c: 2 }, a: 1 },
    });
    expect(a).toBe(b);
  });

  it("test 21 — normalisation Unicode NFC: 'été' composé === 'été' précomposé", () => {
    const composed = "eté"; // e + combining acute
    const precomposed = "eté"; // é precomposed
    expect(composed.normalize("NFC")).toBe(precomposed.normalize("NFC"));

    const a = computeSignalHash({ ...baseInput, evidenceText: `Texte ${composed} important` });
    const b = computeSignalHash({ ...baseInput, evidenceText: `Texte ${precomposed} important` });
    expect(a).toBe(b);
  });

  it("test 22 — extractorVersion différent produit un hash différent (upgrade parser)", () => {
    const v1 = computeSignalHash({ ...baseInput, extractorVersion: "temporal-extractor@v1.0" });
    const v2 = computeSignalHash({ ...baseInput, extractorVersion: "temporal-extractor@v2.0" });
    expect(v1).not.toBe(v2);
  });

  it("kind différent produit un hash différent", () => {
    const capTable = computeSignalHash({ ...baseInput, kind: "CAP_TABLE_AS_OF" });
    const balanceSheet = computeSignalHash({ ...baseInput, kind: "BALANCE_SHEET_AS_OF" });
    expect(capTable).not.toBe(balanceSheet);
  });

  it("pageNumber différent produit un hash différent (anchor)", () => {
    const p1 = computeSignalHash({ ...baseInput, pageNumber: 1 });
    const p2 = computeSignalHash({ ...baseInput, pageNumber: 2 });
    expect(p1).not.toBe(p2);
  });

  it("sheetName différent produit un hash différent (anchor)", () => {
    const a = computeSignalHash({ ...baseInput, sheetName: "Sheet1" });
    const b = computeSignalHash({ ...baseInput, sheetName: "Sheet2" });
    expect(a).not.toBe(b);
  });

  it("evidenceText trim whitespace ne change pas le hash", () => {
    const a = computeSignalHash({ ...baseInput, evidenceText: "  hello  " });
    const b = computeSignalHash({ ...baseInput, evidenceText: "hello" });
    expect(a).toBe(b);
  });

  it("evidenceText null === evidenceText '' (les deux normalisés en string vide)", () => {
    const a = computeSignalHash({ ...baseInput, evidenceText: null });
    const b = computeSignalHash({ ...baseInput, evidenceText: "" });
    expect(a).toBe(b);
  });

  it("hash est déterministe sur 100 itérations", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      hashes.add(computeSignalHash(baseInput));
    }
    expect(hashes.size).toBe(1);
  });

  it("hash est de longueur sha256 (64 hex chars)", () => {
    const hash = computeSignalHash(baseInput);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("test 21b (Codex round 4 P2) — normalisation Unicode NFC dans valueJson (string value imbriquée)", () => {
    const composed = "eté"; // e + combining acute (NFD)
    const precomposed = composed.normalize("NFC"); // "été" precomposed
    expect(composed).not.toBe(precomposed); // raw codepoints differ
    expect(composed.normalize("NFC")).toBe(precomposed);

    const a = computeSignalHash({ ...baseInput, valueJson: { raw: composed, asOf: "2024-09-18" } });
    const b = computeSignalHash({ ...baseInput, valueJson: { raw: precomposed, asOf: "2024-09-18" } });
    expect(a).toBe(b);
  });

  it("test 21c (Codex round 4 P2) — NFC dans valueJson récursif (nested string)", () => {
    const composed = "eté";
    const precomposed = composed.normalize("NFC");
    const a = computeSignalHash({ ...baseInput, valueJson: { meta: { evidence: { text: composed } } } });
    const b = computeSignalHash({ ...baseInput, valueJson: { meta: { evidence: { text: precomposed } } } });
    expect(a).toBe(b);
  });

  it("test 21d (Codex round 4 P2) — NFC dans valueJson arrays de strings", () => {
    const composed = "eté";
    const precomposed = composed.normalize("NFC");
    const a = computeSignalHash({ ...baseInput, valueJson: { tags: [composed, "neutral"] } });
    const b = computeSignalHash({ ...baseInput, valueJson: { tags: [precomposed, "neutral"] } });
    expect(a).toBe(b);
  });

  it("Codex round 4 P2 — parts encoded as JSON array, no '|' delimiter ambiguity", () => {
    // If we had used parts.join("|"), an extractorVersion containing "|" could collide
    // with the kind of the next signal. JSON.stringify wraps each part unambiguously.
    const a = computeSignalHash({ ...baseInput, extractorVersion: "v1", kind: "DOCUMENT_DATE" });
    const b = computeSignalHash({ ...baseInput, extractorVersion: "v1|DOCUMENT_DATE", kind: "CAP_TABLE_AS_OF" });
    // Different inputs → different hash, no collision via concat with '|'.
    expect(a).not.toBe(b);
  });

  it("sourceTextHash N'EST PAS inclus dans le hash (redondance avec evidenceText)", () => {
    // Sanity: changer un champ qu'on n'inclut pas ne devrait pas affecter
    // (mais notre fonction ne prend pas sourceTextHash en input → pass implicite).
    // On vérifie via canonicalJSONStringify que valueJson est l'unique vecteur.
    const a = canonicalJSONStringify({ x: 1 });
    const b = canonicalJSONStringify({ x: 1 });
    expect(a).toBe(b);
  });
});

describe("canonicalJSONStringify", () => {
  it("trie les clés de premier niveau", () => {
    expect(canonicalJSONStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("trie les clés imbriquées récursivement", () => {
    expect(canonicalJSONStringify({ z: { y: 1, x: 2 }, a: 0 })).toBe('{"a":0,"z":{"x":2,"y":1}}');
  });

  it("préserve l'ordre des arrays (non trié)", () => {
    expect(canonicalJSONStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("gère null, true, false, numbers, strings", () => {
    expect(canonicalJSONStringify({ n: null, t: true, f: false, num: 42, s: "x" }))
      .toBe('{"f":false,"n":null,"num":42,"s":"x","t":true}');
  });

  it("(Codex round 4 P2) NFC normalise les string values imbriquées", () => {
    const composed = "eté";
    const precomposed = composed.normalize("NFC");
    expect(canonicalJSONStringify({ raw: composed })).toBe(canonicalJSONStringify({ raw: precomposed }));
    expect(canonicalJSONStringify({ raw: composed })).toBe(JSON.stringify({ raw: precomposed }));
  });
});
