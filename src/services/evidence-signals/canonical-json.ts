/**
 * Canonical JSON stringifier used to compute deterministic signal hashes.
 *
 * Guarantees:
 *  - object keys are sorted recursively (so { a:1, b:2 } === { b:2, a:1 })
 *  - string values are NFC-normalized (so composé/précomposé Unicode produce
 *    the same canonical output; required because valueJson can carry OCR
 *    excerpts like "à jour au 18/09/2024" whose normalization may vary).
 *  - arrays preserve their order (order is semantic for tuples/sequences).
 *  - undefined values are dropped (JSON-native behavior).
 */
export function canonicalJSONStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) out[key] = canonicalize(obj[key]);
  return out;
}
