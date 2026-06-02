import { describe, it, expect } from "vitest";
import { withHardWall } from "@/lib/hard-wall";

describe("withHardWall (Fix C — H)", () => {
  it("résout la valeur si fn() résout avant le mur", async () => {
    const r = await withHardWall("fast", async () => 42, 1000);
    expect(r).toBe(42);
  });

  it("LÈVE [hard-wall:<label>] timed out si fn() dépasse wallMs", async () => {
    const slow = () => new Promise<number>(() => {}); // ne résout jamais → seul le mur tranche
    await expect(withHardWall("funding-db", slow, 20)).rejects.toThrow(
      /\[hard-wall:funding-db\] timed out after 20ms/
    );
  });

  it("propage l'erreur de fn() (pas le timeout) si fn() rejette avant le mur", async () => {
    const boom = () => Promise.reject(new Error("db error"));
    await expect(withHardWall("funding-db", boom, 1000)).rejects.toThrow("db error");
  });

  it("clearTimeout : un résultat rapide ne laisse pas le timer rejeter après coup", async () => {
    // Si clearTimeout manquait, le timer (mur 30ms) rejetterait à ~30ms après une résolution
    // immédiate → unhandled rejection. On attend au-delà du mur pour le détecter.
    const r = await withHardWall("fast", async () => "ok", 30);
    expect(r).toBe("ok");
    await new Promise((res) => setTimeout(res, 50));
    expect(r).toBe("ok");
  });
});
