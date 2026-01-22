/**
 * PDF Extraction Quality Analyzer
 *
 * Analyzes the quality of extracted text to detect:
 * - Image-heavy PDFs with little selectable text
 * - Corrupted or partially extracted content
 * - Fragmented text from poor PDF generation
 * - Missing expected sections in pitch decks
 */

// Expected characteristics for a pitch deck
const PITCH_DECK_KEYWORDS = [
  // Problem/Solution
  'problem', 'solution', 'market', 'opportunity',
  // Business
  'business', 'model', 'revenue', 'customer', 'traction',
  // Team
  'team', 'founder', 'ceo', 'cto', 'experience',
  // Financial
  'arr', 'mrr', 'growth', 'projection', 'funding', 'raise',
  // Market
  'tam', 'sam', 'som', 'competitor', 'competitive',
  // Other
  'roadmap', 'milestone', 'ask', 'investment', 'valuation'
];

// Minimum thresholds
const MIN_CHARS_PER_PAGE = 200;         // A page with less is likely image-heavy
const MIN_WORDS_PER_PAGE = 30;          // Sanity check for words
const MIN_QUALITY_SCORE = 40;           // Below this, warn the user
const GOOD_QUALITY_SCORE = 70;          // Above this, extraction is reliable
const MIN_KEYWORD_MATCHES = 3;          // Minimum pitch deck keywords expected

export interface ExtractionQualityMetrics {
  // Overall score (0-100)
  qualityScore: number;

  // Detailed metrics
  totalCharacters: number;
  totalWords: number;
  pageCount: number;
  charsPerPage: number;
  wordsPerPage: number;

  // Page analysis
  emptyPages: number;
  lowContentPages: number;  // Pages with < MIN_CHARS_PER_PAGE
  goodContentPages: number;
  pageContentDistribution: number[];  // Chars per page array

  // Content quality
  uniqueWordsRatio: number;           // Higher = less repetitive/garbage
  averageWordLength: number;          // 3-8 is normal, outside indicates issues
  sentenceCount: number;
  hasStructuredContent: boolean;      // Has paragraphs/sections

  // Pitch deck specific
  keywordMatchCount: number;
  matchedKeywords: string[];
  missingCriticalSections: string[];
  isPitchDeckLikely: boolean;

  // Quality indicators
  hasGarbageCharacters: boolean;      // Lots of special chars/encoding issues
  hasFragmentedText: boolean;         // Many single characters/short fragments
  hasRepetitiveContent: boolean;      // Same text repeated (extraction bug)

  // Confidence assessment
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  confidenceReasons: string[];
}

export interface ExtractionWarning {
  code: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

export interface QualityAnalysisResult {
  metrics: ExtractionQualityMetrics;
  warnings: ExtractionWarning[];
  isUsable: boolean;
  requiresOCR: boolean;
  summary: string;
}

/**
 * Analyze the quality of extracted PDF text
 */
export function analyzeExtractionQuality(
  text: string,
  pageCount: number
): QualityAnalysisResult {
  const warnings: ExtractionWarning[] = [];

  // Basic metrics
  const totalCharacters = text.length;
  const words = extractWords(text);
  const totalWords = words.length;
  const charsPerPage = pageCount > 0 ? totalCharacters / pageCount : 0;
  const wordsPerPage = pageCount > 0 ? totalWords / pageCount : 0;

  // Page content analysis (estimate by splitting on double newlines)
  const pageEstimates = estimatePageContent(text, pageCount);
  const emptyPages = pageEstimates.filter(c => c < 50).length;
  const lowContentPages = pageEstimates.filter(c => c >= 50 && c < MIN_CHARS_PER_PAGE).length;
  const goodContentPages = pageEstimates.filter(c => c >= MIN_CHARS_PER_PAGE).length;

  // Word analysis
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const uniqueWordsRatio = totalWords > 0 ? uniqueWords.size / totalWords : 0;
  const averageWordLength = totalWords > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / totalWords
    : 0;

  // Sentence analysis
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sentenceCount = sentences.length;
  const hasStructuredContent = sentenceCount > 5 && text.includes('\n\n');

  // Pitch deck keyword detection
  const textLower = text.toLowerCase();
  const matchedKeywords = PITCH_DECK_KEYWORDS.filter(kw => textLower.includes(kw));
  const keywordMatchCount = matchedKeywords.length;

  // Missing critical sections for pitch deck
  const criticalSections = ['problem', 'solution', 'market', 'team', 'business'];
  const missingCriticalSections = criticalSections.filter(s => !textLower.includes(s));
  const isPitchDeckLikely = keywordMatchCount >= MIN_KEYWORD_MATCHES;

  // Quality indicators
  const garbageCharRatio = countGarbageCharacters(text) / Math.max(totalCharacters, 1);
  const hasGarbageCharacters = garbageCharRatio > 0.1;

  const fragmentedRatio = countFragmentedWords(words) / Math.max(totalWords, 1);
  const hasFragmentedText = fragmentedRatio > 0.3;

  const repetitionScore = detectRepetition(text);
  const hasRepetitiveContent = repetitionScore > 0.3;

  // Calculate quality score
  let qualityScore = 100;

  // Deduct for insufficient content
  if (charsPerPage < MIN_CHARS_PER_PAGE) {
    const deficit = (MIN_CHARS_PER_PAGE - charsPerPage) / MIN_CHARS_PER_PAGE;
    qualityScore -= deficit * 40;
  }

  // Deduct for empty/low content pages
  if (pageCount > 0) {
    const emptyRatio = emptyPages / pageCount;
    const lowRatio = lowContentPages / pageCount;
    qualityScore -= emptyRatio * 30;
    qualityScore -= lowRatio * 15;
  }

  // Deduct for garbage characters
  if (hasGarbageCharacters) {
    qualityScore -= garbageCharRatio * 30;
  }

  // Deduct for fragmented text
  if (hasFragmentedText) {
    qualityScore -= fragmentedRatio * 25;
  }

  // Deduct for repetitive content
  if (hasRepetitiveContent) {
    qualityScore -= repetitionScore * 20;
  }

  // Deduct for abnormal word length
  if (averageWordLength < 3 || averageWordLength > 12) {
    qualityScore -= 15;
  }

  // Bonus for pitch deck keywords found
  if (isPitchDeckLikely) {
    qualityScore += Math.min(keywordMatchCount * 2, 10);
  }

  // Clamp score
  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  // Determine confidence level
  let confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  const confidenceReasons: string[] = [];

  if (qualityScore >= GOOD_QUALITY_SCORE) {
    confidenceLevel = 'high';
    confidenceReasons.push('Sufficient text content extracted');
    if (isPitchDeckLikely) {
      confidenceReasons.push('Pitch deck structure detected');
    }
  } else if (qualityScore >= MIN_QUALITY_SCORE) {
    confidenceLevel = 'medium';
    confidenceReasons.push('Partial text extraction - some content may be missing');
  } else if (qualityScore >= 20) {
    confidenceLevel = 'low';
    confidenceReasons.push('Poor text extraction - significant content likely missing');
  } else {
    confidenceLevel = 'insufficient';
    confidenceReasons.push('Insufficient text extracted - PDF may be image-based');
  }

  // Generate warnings
  if (totalCharacters < 500) {
    warnings.push({
      code: 'INSUFFICIENT_TEXT',
      severity: 'critical',
      message: `Only ${totalCharacters} characters extracted from ${pageCount} pages`,
      suggestion: 'This PDF appears to be mostly images. Consider uploading a text-based version or using our OCR option.'
    });
  }

  if (charsPerPage < MIN_CHARS_PER_PAGE && totalCharacters > 500) {
    warnings.push({
      code: 'LOW_TEXT_DENSITY',
      severity: 'high',
      message: `Low text density: ${Math.round(charsPerPage)} chars/page (expected: ${MIN_CHARS_PER_PAGE}+)`,
      suggestion: 'Many slides may contain images or charts that we cannot analyze. Key data may be missing.'
    });
  }

  if (emptyPages > 0) {
    warnings.push({
      code: 'EMPTY_PAGES',
      severity: emptyPages > pageCount / 2 ? 'high' : 'medium',
      message: `${emptyPages} of ${pageCount} pages have no extractable text`,
      suggestion: 'These pages likely contain images, charts, or graphics that we cannot read.'
    });
  }

  if (hasGarbageCharacters) {
    warnings.push({
      code: 'ENCODING_ISSUES',
      severity: 'medium',
      message: 'Text contains encoding issues or special characters',
      suggestion: 'Some text may not be properly extracted. Try re-exporting the PDF with standard fonts.'
    });
  }

  if (hasFragmentedText) {
    warnings.push({
      code: 'FRAGMENTED_TEXT',
      severity: 'medium',
      message: 'Text appears fragmented - possible PDF generation issue',
      suggestion: 'The PDF may have been created with unusual settings. Try re-exporting from the original source.'
    });
  }

  if (isPitchDeckLikely && missingCriticalSections.length >= 3) {
    warnings.push({
      code: 'MISSING_SECTIONS',
      severity: 'medium',
      message: `Expected pitch deck sections not found: ${missingCriticalSections.join(', ')}`,
      suggestion: 'These sections may be in images or missing from the deck. Analysis may be incomplete.'
    });
  }

  // Determine if usable and if OCR is needed
  const isUsable = qualityScore >= MIN_QUALITY_SCORE;
  const requiresOCR = qualityScore < MIN_QUALITY_SCORE ||
    (charsPerPage < MIN_CHARS_PER_PAGE / 2 && pageCount > 3);

  // Generate summary
  let summary: string;
  if (qualityScore >= GOOD_QUALITY_SCORE) {
    summary = `Good extraction quality (${qualityScore}%). ${totalWords} words extracted from ${pageCount} pages.`;
  } else if (qualityScore >= MIN_QUALITY_SCORE) {
    summary = `Partial extraction (${qualityScore}%). Some content may be in images. ${warnings.length} warning(s).`;
  } else {
    summary = `Poor extraction (${qualityScore}%). This PDF appears to be image-heavy. OCR recommended.`;
  }

  return {
    metrics: {
      qualityScore,
      totalCharacters,
      totalWords,
      pageCount,
      charsPerPage: Math.round(charsPerPage),
      wordsPerPage: Math.round(wordsPerPage),
      emptyPages,
      lowContentPages,
      goodContentPages,
      pageContentDistribution: pageEstimates,
      uniqueWordsRatio: Math.round(uniqueWordsRatio * 100) / 100,
      averageWordLength: Math.round(averageWordLength * 10) / 10,
      sentenceCount,
      hasStructuredContent,
      keywordMatchCount,
      matchedKeywords,
      missingCriticalSections,
      isPitchDeckLikely,
      hasGarbageCharacters,
      hasFragmentedText,
      hasRepetitiveContent,
      confidenceLevel,
      confidenceReasons
    },
    warnings,
    isUsable,
    requiresOCR,
    summary
  };
}

/**
 * Extract words from text
 */
function extractWords(text: string): string[] {
  return text
    .split(/[\s\n\r\t]+/)
    .filter(w => w.length > 1 && /^[a-zA-Z0-9\u00C0-\u017F]+$/.test(w));
}

/**
 * Estimate content per page by analyzing text structure
 */
function estimatePageContent(text: string, pageCount: number): number[] {
  if (pageCount <= 0) return [];

  // Try to split by common page markers or estimate evenly
  const avgCharsPerPage = text.length / pageCount;
  const estimates: number[] = [];

  // Look for page breaks or section markers
  const sections = text.split(/\n{3,}|\f/);

  if (sections.length >= pageCount * 0.5) {
    // Use sections as page estimates
    const sectionGroups = Math.ceil(sections.length / pageCount);
    for (let i = 0; i < pageCount; i++) {
      const start = i * sectionGroups;
      const end = Math.min(start + sectionGroups, sections.length);
      const pageContent = sections.slice(start, end).join('\n');
      estimates.push(pageContent.length);
    }
  } else {
    // Estimate evenly with some variance based on content density
    for (let i = 0; i < pageCount; i++) {
      estimates.push(Math.round(avgCharsPerPage));
    }
  }

  return estimates;
}

/**
 * Count garbage/encoding issue characters
 */
function countGarbageCharacters(text: string): number {
  // Count characters that shouldn't appear in normal text
  const garbagePattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD\uFFFE\uFFFF]/g;
  const matches = text.match(garbagePattern);
  return matches ? matches.length : 0;
}

/**
 * Count fragmented words (single characters, very short sequences)
 */
function countFragmentedWords(words: string[]): number {
  return words.filter(w => w.length <= 2).length;
}

/**
 * Detect repetitive content (same phrases appearing multiple times)
 */
function detectRepetition(text: string): number {
  // Split into chunks and check for duplicates
  const chunks = text.match(/.{50,100}/g) || [];
  if (chunks.length < 3) return 0;

  const seen = new Set<string>();
  let duplicates = 0;

  for (const chunk of chunks) {
    const normalized = chunk.toLowerCase().trim();
    if (seen.has(normalized)) {
      duplicates++;
    }
    seen.add(normalized);
  }

  return duplicates / chunks.length;
}

/**
 * Quick check if OCR is needed without full analysis
 */
export function quickOCRCheck(text: string, pageCount: number): boolean {
  const charsPerPage = pageCount > 0 ? text.length / pageCount : 0;
  return charsPerPage < MIN_CHARS_PER_PAGE / 2;
}

/**
 * Get list of page indices that need OCR (0-indexed)
 * Returns pages with < MIN_CHARS_PER_PAGE characters
 */
export function getPagesNeedingOCR(
  pageContentDistribution: number[],
  maxPages: number = 20
): number[] {
  const lowContentPages: { index: number; chars: number }[] = [];

  for (let i = 0; i < pageContentDistribution.length; i++) {
    if (pageContentDistribution[i] < MIN_CHARS_PER_PAGE) {
      lowContentPages.push({ index: i, chars: pageContentDistribution[i] });
    }
  }

  // Sort by lowest content first (prioritize emptiest pages)
  lowContentPages.sort((a, b) => a.chars - b.chars);

  // Return indices, limited to maxPages
  return lowContentPages.slice(0, maxPages).map(p => p.index);
}

/**
 * Estimate OCR cost based on pages needing OCR
 * Returns cost in USD
 */
export function estimateOCRCost(pagesNeedingOCR: number): number {
  // Using Haiku: ~$0.00025/1K input + $0.00125/1K output
  // Estimate ~800 input tokens (image) + 300 output tokens per page
  const inputCostPerPage = (800 / 1000) * 0.00025;
  const outputCostPerPage = (300 / 1000) * 0.00125;
  return pagesNeedingOCR * (inputCostPerPage + outputCostPerPage);
}
