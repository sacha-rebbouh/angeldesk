/**
 * Source guard — budget deadline-aware du step synthesis-deal-scorer (dé-scorisation P2-d).
 *
 * Post-mortem prod (analysis cmq9lg9un…) : un run est mort en boucle sur le step de synthèse.
 * L'invocation Vercel porte la réhydratation du snapshot stepwise + execute() + l'écriture du
 * snapshot suivant. Avec config.timeoutMs = 300000 (= plafond Vercel) et des appels LLM non
 * bornés (3 tentatives router + fallback model-aware implicite), un seul appel pouvait
 * consommer tout le budget → kill plateforme mid-write → boucle de retries Inngest.
 *
 * Invariants verrouillés mécaniquement :
 * 1. Les appels LLM de synthèse portent SYNTHESIS_LLM_CALL_OPTIONS : timeoutMs borné,
 *    disableModelFallback (pas de failover cross-modèle long), maxRetries borné.
 * 2. AUCUN appel `llmCompleteJSON<LLMSynthesisResponse>` n'est fait sans ce bornage.
 * 3. config.timeoutMs < plafond Vercel 300s, avec marge pour rehydrate/write snapshot.
 * 4. Le pire cas execute() (1 appel in-execute × budget par appel) tient SOUS config.timeoutMs,
 *    avec une large marge pour rehydrate/write snapshot.
 *
 * Chantier P4 — l'ancien retry « dimensions » (2e appel conditionnel) et le
 * post-traitement F37 (percentile de score) sont retirés : execute() ne fait
 * plus qu'UN appel LLM borné, ce qui renforce la marge anti-boucle 300s.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AGENT_PATH = resolve(__dirname, "../synthesis-deal-scorer.ts");
const source = readFileSync(AGENT_PATH, "utf-8");

const PER_CALL_BUDGET_MS = 100_000;
const CONFIG_TIMEOUT_MS = 220_000;
const VERCEL_STEP_BUDGET_MS = 300_000;
const MAX_IN_EXECUTE_CALLS = 1; // P4 — un seul appel LLM (retry « dimensions » retiré)

describe("synthesis-deal-scorer — budget deadline-aware (anti boucle 300s)", () => {
  it("définit SYNTHESIS_LLM_CALL_OPTIONS avec timeoutMs, disableModelFallback, maxRetries bornés", () => {
    const block = source.match(/const SYNTHESIS_LLM_CALL_OPTIONS = \{[\s\S]*?\} as const;/);
    expect(block, "const SYNTHESIS_LLM_CALL_OPTIONS introuvable").not.toBeNull();
    // Le budget par appel doit être présent et borné (sous le plafond Vercel).
    const perCall = block![0].match(/timeoutMs:\s*(\d[\d_]*)/);
    expect(perCall, "timeoutMs introuvable dans SYNTHESIS_LLM_CALL_OPTIONS").not.toBeNull();
    expect(Number(perCall![1].replace(/_/g, ""))).toBe(PER_CALL_BUDGET_MS);
    expect(block![0]).toContain("disableModelFallback: true");
    expect(block![0]).toMatch(/maxRetries:\s*[01]\b/);
  });

  it("tous les appels llmCompleteJSON<LLMSynthesisResponse> portent SYNTHESIS_LLM_CALL_OPTIONS", () => {
    const calls = source.match(/llmCompleteJSON<LLMSynthesisResponse>\([^)]*\)/g) ?? [];
    // P4 — exactement 1 appel (le retry « dimensions » a été retiré).
    expect(calls.length, "appel llmCompleteJSON<LLMSynthesisResponse> attendu (exactement 1 après P4)").toBe(MAX_IN_EXECUTE_CALLS);
    for (const call of calls) {
      expect(call, `appel non borné détecté: ${call}`).toContain("SYNTHESIS_LLM_CALL_OPTIONS");
    }
  });

  it("config.timeoutMs est 220000 et reste sous le plafond Vercel 300s", () => {
    // Premier timeoutMs à l'intérieur du super({...}) du constructeur = la config de l'agent.
    const cfg = source.match(/super\(\{[\s\S]*?timeoutMs:\s*(\d[\d_]*)/);
    expect(cfg, "config.timeoutMs du constructeur introuvable").not.toBeNull();
    const configMs = Number(cfg![1].replace(/_/g, ""));
    expect(configMs).toBe(CONFIG_TIMEOUT_MS);
    expect(configMs).toBeLessThan(VERCEL_STEP_BUDGET_MS);
  });

  it("laisse une marge Vercel >= 60s pour rehydrate + write snapshot", () => {
    expect(VERCEL_STEP_BUDGET_MS - CONFIG_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("le pire cas execute() (1 appel in-execute borné) tient sous config.timeoutMs", () => {
    // P4 — 1 × 100s = 100s < 220s → large marge pour rehydrate + write snapshot.
    expect(MAX_IN_EXECUTE_CALLS * PER_CALL_BUDGET_MS).toBeLessThan(CONFIG_TIMEOUT_MS);
  });
});
