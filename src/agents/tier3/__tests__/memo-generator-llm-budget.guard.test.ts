/**
 * Source guard — budget wall-clock du LLM memo-generator (fix racine « boucle 300s »).
 *
 * Post-mortem prod (analysis cmq9lg9un…) : l'invocation Vercel du step memo porte
 * la réhydratation du snapshot stepwise + l'appel LLM + l'écriture du snapshot
 * suivant. Avec le LLM borné seulement par le timeout agent (180s), la somme
 * dépassait le plafond Vercel 300s → kill → boucle de retries Inngest → reaper.
 *
 * Invariants verrouillés mécaniquement :
 * 1. L'appel `llmCompleteJSON` du mémo porte un `timeoutMs` EXPLICITE de 120s.
 * 2. Ce budget reste STRICTEMENT inférieur au timeout global de l'agent (180s),
 *    pour que le filet déterministe (buildDeterministicFallback) ait le temps de
 *    livrer un mémo dégradé DANS la même invocation au lieu de boucler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AGENT_PATH = resolve(__dirname, "../memo-generator.ts");
const source = readFileSync(AGENT_PATH, "utf-8");

const LLM_BUDGET_MS = 120_000;
const VERCEL_STEP_BUDGET_MS = 300_000;

describe("memo-generator — budget wall-clock du LLM (anti boucle 300s)", () => {
  it("l'appel llmCompleteJSON du mémo porte timeoutMs: 120_000 explicite", () => {
    // Le bloc d'options de l'appel LLM principal doit contenir le budget explicite
    // (sans lui, c'est config.timeoutMs=180s qui s'applique → invocation > 300s).
    const llmCallBlock = source.match(
      /llmCompleteJSON<LLMMemoResponse>\(prompt,\s*\{[\s\S]*?\}\s*\)/
    );
    expect(llmCallBlock, "appel llmCompleteJSON<LLMMemoResponse> introuvable").not.toBeNull();
    expect(llmCallBlock![0]).toContain("timeoutMs: 120_000");
  });

  it("le budget LLM (120s) reste < timeout global de l'agent (headroom du filet déterministe)", () => {
    const configTimeout = source.match(/timeoutMs:\s*(\d[\d_]*)\s*,?\s*\/\/.*3 minutes/);
    expect(configTimeout, "timeoutMs de la config agent introuvable").not.toBeNull();
    const agentTimeoutMs = Number(configTimeout![1].replace(/_/g, ""));
    expect(LLM_BUDGET_MS).toBeLessThan(agentTimeoutMs);
  });

  it("le budget LLM laisse de la marge sous le plafond Vercel 300s (réhydratation + snapshot)", () => {
    // ~120s LLM + lecture/écriture snapshot multi-MB + overheads : il faut au moins
    // la moitié du plafond en marge pour que le step tienne dans l'invocation.
    expect(LLM_BUDGET_MS).toBeLessThanOrEqual(VERCEL_STEP_BUDGET_MS / 2);
  });
});
