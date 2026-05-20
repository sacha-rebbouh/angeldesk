/**
 * Phase B1 — Concurrency pool unit tests.
 */
import { describe, expect, it, vi } from "vitest";
import { createConcurrencyPool } from "../upload-concurrency";

describe("createConcurrencyPool", () => {
  it("rejette une limite invalide", () => {
    expect(() => createConcurrencyPool(0)).toThrow(/positive integer/);
    expect(() => createConcurrencyPool(-1)).toThrow();
    expect(() => createConcurrencyPool(1.5)).toThrow();
  });

  it("au plus `limit` tâches actives en même temps", async () => {
    const pool = createConcurrencyPool(2);
    const peakActive: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) =>
      pool.run(async () => {
        peakActive.push(pool.active);
        // Resolve next microtask so the next task can be admitted.
        await new Promise<void>((r) => setTimeout(r, 0));
        return i;
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    // Le contrat critique : peakActive ne dépasse JAMAIS la limite.
    expect(peakActive.every((n) => n <= 2)).toBe(true);
    expect(peakActive.length).toBe(5);
    expect(pool.active).toBe(0);
    expect(pool.pending).toBe(0);
  });

  it("préserve l'ordre FIFO d'admission", async () => {
    const pool = createConcurrencyPool(1);
    const order: number[] = [];
    const promises = [1, 2, 3].map((i) =>
      pool.run(async () => {
        order.push(i);
      })
    );
    await Promise.all(promises);
    expect(order).toEqual([1, 2, 3]);
  });

  it("propage le rejet du task et libère le slot", async () => {
    const pool = createConcurrencyPool(1);
    const a = pool.run(async () => {
      throw new Error("boom");
    });
    await expect(a).rejects.toThrow("boom");
    expect(pool.active).toBe(0);
    // La 2e tâche doit pouvoir s'exécuter malgré l'échec de la 1ère.
    const result = await pool.run(async () => 42);
    expect(result).toBe(42);
  });

  it("limit=1 sérialise", async () => {
    const pool = createConcurrencyPool(1);
    const fn = vi.fn(async (i: number) => {
      expect(pool.active).toBe(1);
      return i;
    });
    const out = await Promise.all([1, 2, 3].map((i) => pool.run(() => fn(i))));
    expect(out).toEqual([1, 2, 3]);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
