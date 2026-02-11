import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// Test du calcul de prompt version hash (F42)
describe('computePromptVersionHash', () => {
  it('should produce deterministic hash for same input', () => {
    const prompt = "You are a financial auditor.";
    const config = "HAIKU|120000";
    const content = `${prompt}||${config}`;
    const hash1 = createHash("sha256").update(content).digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update(content).digest("hex").slice(0, 12);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe("1.0");
    expect(hash1).toHaveLength(12);
  });

  it('should produce different hash for different prompts', () => {
    const hash1 = createHash("sha256").update("prompt A||HAIKU|120000").digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update("prompt B||HAIKU|120000").digest("hex").slice(0, 12);
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hash for different model configs', () => {
    const hash1 = createHash("sha256").update("same prompt||HAIKU|120000").digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update("same prompt||SONNET|120000").digest("hex").slice(0, 12);
    expect(hash1).not.toBe(hash2);
  });
});
