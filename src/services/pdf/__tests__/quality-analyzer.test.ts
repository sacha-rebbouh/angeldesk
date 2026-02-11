import { describe, it, expect } from 'vitest';
import {
  analyzeExtractionQuality,
  getPagesNeedingOCR,
  quickOCRCheck,
} from '../quality-analyzer';

describe('analyzeExtractionQuality', () => {
  it('should return high quality for good text', () => {
    const text = `This is a pitch deck with problem, solution, market, team and business model.
    Revenue is growing at 100% YoY. ARR is 1M EUR. TAM is 10B. The competitive landscape
    includes 5 competitors. Our team has strong experience. The product roadmap includes
    expansion to Europe. We are raising 2M at 10M valuation. Growth projection for next year.
    ` + ' lorem ipsum '.repeat(100);

    const result = analyzeExtractionQuality(text, 10);
    expect(result.metrics.qualityScore).toBeGreaterThan(50);
    expect(result.isUsable).toBe(true);
  });

  it('should detect insufficient text', () => {
    const result = analyzeExtractionQuality('hello', 10);
    expect(result.metrics.qualityScore).toBeLessThanOrEqual(30);
    expect(result.requiresOCR).toBe(true);
  });

  it('should handle empty text', () => {
    const result = analyzeExtractionQuality('', 5);
    expect(result.metrics.totalCharacters).toBe(0);
    expect(result.requiresOCR).toBe(true);
  });
});

describe('getPagesNeedingOCR', () => {
  it('should return pages with low content', () => {
    const distribution = [500, 50, 300, 10, 400]; // pages 1,3 are low
    const result = getPagesNeedingOCR(distribution, 20);
    expect(result).toContain(1);
    expect(result).toContain(3);
    expect(result).not.toContain(0);
  });

  it('should respect maxPages limit', () => {
    const distribution = Array(50).fill(10); // all pages low
    const result = getPagesNeedingOCR(distribution, 5);
    expect(result).toHaveLength(5);
  });

  it('should deprioritize cover page (index 0)', () => {
    // All pages have same low content - cover page should not be first
    const distribution = [50, 50, 50, 50, 50];
    const result = getPagesNeedingOCR(distribution, 5);
    expect(result[0]).not.toBe(0);
  });

  it('should boost pages with financial keywords', () => {
    const distribution = [50, 50, 50]; // all low
    const existingText = "intro page\n\n\nrevenue arr mrr growth\n\n\nthank you merci";
    const result = getPagesNeedingOCR(distribution, 3, existingText);
    // Page 1 (financial keywords) should rank higher than page 2 (decorative)
    expect(result.indexOf(1)).toBeLessThan(result.indexOf(2));
  });

  it('should handle empty distribution', () => {
    expect(getPagesNeedingOCR([], 20)).toEqual([]);
  });
});

describe('quickOCRCheck', () => {
  it('should return true for low density', () => {
    expect(quickOCRCheck('short', 10)).toBe(true);
  });

  it('should return false for good density', () => {
    const goodText = 'x'.repeat(5000);
    expect(quickOCRCheck(goodText, 5)).toBe(false);
  });
});
