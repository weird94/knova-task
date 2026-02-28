import { tokenizeParagraph } from "./tokenizer";
import {
  serializeParagraphStyle,
  serializeTextStyle
} from "./utils";
import type { FontMeasureCache } from "./font-measure-cache";
import type {
  Glyph,
  Line,
  ParagraphSkeleton,
  ParagraphStyle,
  TextStyle,
  Word
} from "./types";

export interface ParagraphLayoutInput {
  paragraphId: string;
  paraIndex: number;
  text: string;
  sourceStart: number;
  sourceEnd: number;
  paragraphStyle: ParagraphStyle;
  textStyle: TextStyle;
  revision: number;
  pageWidth: number;
  fontEpoch: number;
}

export const createParagraphLayoutKey = (
  revision: number,
  pageWidth: number,
  fontEpoch: number,
  paragraphStyle: ParagraphStyle,
  textStyle: TextStyle
): string =>
  [
    revision,
    pageWidth,
    fontEpoch,
    serializeParagraphStyle(paragraphStyle),
    serializeTextStyle(textStyle)
  ].join("|");

export const rebaseParagraphSkeleton = (
  skeleton: ParagraphSkeleton,
  nextSourceStart: number,
  nextSourceEnd: number
): ParagraphSkeleton => {
  const delta = nextSourceStart - skeleton.sourceStart;

  if (delta === 0 && nextSourceEnd === skeleton.sourceEnd) {
    return skeleton;
  }

  return {
    ...skeleton,
    sourceStart: nextSourceStart,
    sourceEnd: nextSourceEnd,
    lines: skeleton.lines.map((line) => ({
      ...line,
      sourceStart: line.sourceStart + delta,
      sourceEnd: line.sourceEnd + delta,
      words: line.words.map((word) => ({
        ...word,
        sourceStart: word.sourceStart + delta,
        sourceEnd: word.sourceEnd + delta,
        glyphs: word.glyphs.map((glyph) => ({
          ...glyph,
          sourceOffset: glyph.sourceOffset + delta
        }))
      }))
    }))
  };
};

const measureText = (
  text: string,
  sourceStart: number,
  textStyle: TextStyle,
  fontCache: FontMeasureCache,
  tabWidth: number
): Glyph[] => {
  const glyphs: Glyph[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const glyphMetrics =
      char === "\t"
        ? {
            ...fontCache.measureGlyph(" ", textStyle),
            width: tabWidth
          }
        : fontCache.measureGlyph(char, textStyle);

    glyphs.push({
      text: char,
      width: glyphMetrics.width,
      sourceOffset: sourceStart + index,
      ascent: glyphMetrics.ascent,
      descent: glyphMetrics.descent
    });
  }

  return glyphs;
};

export const measureWords = (
  text: string,
  sourceStart: number,
  textStyle: TextStyle,
  fontCache: FontMeasureCache
): Word[] => {
  const tabWidth = fontCache.measureGlyph(" ", textStyle).width * 4;

  return tokenizeParagraph(text, sourceStart).map((seed) => {
    const glyphs = measureText(seed.text, seed.sourceStart, textStyle, fontCache, tabWidth);
    const contentGlyphCount = seed.contentText.length;
    const contentWidth = glyphs
      .slice(0, contentGlyphCount)
      .reduce((total, glyph) => total + glyph.width, 0);
    const trailingWhitespaceWidth = glyphs
      .slice(contentGlyphCount)
      .reduce((total, glyph) => total + glyph.width, 0);
    const letterSpacing = textStyle.letterSpacing ?? 0;
    const internalSpacing = Math.max(glyphs.length - 1, 0) * letterSpacing;
    const contentSpacing = Math.max(contentGlyphCount - 1, 0) * letterSpacing;
    const trailingSpacing = internalSpacing - contentSpacing;

    return {
      ...seed,
      glyphs,
      width: contentWidth + trailingWhitespaceWidth + internalSpacing,
      contentWidth: contentWidth + contentSpacing,
      trailingWhitespaceWidth: trailingWhitespaceWidth + Math.max(trailingSpacing, 0)
    };
  });
};

const getDerivedLetterSpacing = (word: Word): number => {
  if (word.glyphs.length <= 1) {
    return 0;
  }

  const glyphWidth = word.glyphs.reduce((total, glyph) => total + glyph.width, 0);

  return (word.width - glyphWidth) / (word.glyphs.length - 1);
};

const measureGlyphSliceWidth = (glyphs: Glyph[], letterSpacing: number): number =>
  glyphs.reduce((total, glyph) => total + glyph.width, 0) +
  Math.max(glyphs.length - 1, 0) * letterSpacing;

const isSplittableWord = (word: Word): boolean => /\S/.test(word.contentText || word.text);

// Line breaking may synthesize continuation fragments from a measured token.
// Those fragments must preserve the original source offsets exactly, and only
// the final fragment is allowed to retain the original trailing whitespace.
const buildWordFromGlyphSlice = (
  word: Word,
  startContentGlyphIndex: number,
  endContentGlyphIndex: number,
  includeTrailingWhitespace: boolean
): Word => {
  const contentGlyphCount = word.contentText.length;
  const contentGlyphs = word.glyphs.slice(startContentGlyphIndex, endContentGlyphIndex);
  const trailingWhitespaceGlyphs = includeTrailingWhitespace
    ? word.glyphs.slice(contentGlyphCount)
    : [];
  const glyphs = [...contentGlyphs, ...trailingWhitespaceGlyphs];
  const letterSpacing = getDerivedLetterSpacing(word);
  const contentText = contentGlyphs.map((glyph) => glyph.text).join("");
  const trailingWhitespaceText = trailingWhitespaceGlyphs.map((glyph) => glyph.text).join("");
  const contentWidth = measureGlyphSliceWidth(contentGlyphs, letterSpacing);
  const trailingWhitespaceWidth =
    trailingWhitespaceGlyphs.reduce((total, glyph) => total + glyph.width, 0) +
    trailingWhitespaceGlyphs.length * letterSpacing;
  const sourceStart = contentGlyphs[0]?.sourceOffset ?? word.sourceStart;
  const sourceEnd = (glyphs[glyphs.length - 1]?.sourceOffset ?? sourceStart - 1) + 1;

  return {
    text: `${contentText}${trailingWhitespaceText}`,
    contentText,
    trailingWhitespaceText,
    glyphs,
    width: contentWidth + trailingWhitespaceWidth,
    contentWidth,
    trailingWhitespaceWidth,
    breakAfter: includeTrailingWhitespace ? word.breakAfter : false,
    sourceStart,
    sourceEnd
  };
};

const findLargestFittingContentGlyphCount = (
  word: Word,
  maxVisibleWidth: number
): number => {
  const contentGlyphCount = word.contentText.length;

  if (contentGlyphCount <= 1) {
    return contentGlyphCount;
  }

  const letterSpacing = getDerivedLetterSpacing(word);
  let width = 0;
  let bestCount = 0;

  for (let index = 0; index < contentGlyphCount; index += 1) {
    if (index > 0) {
      width += letterSpacing;
    }

    width += word.glyphs[index].width;

    if (width <= maxVisibleWidth) {
      bestCount = index + 1;
      continue;
    }

    break;
  }

  return bestCount > 0 ? bestCount : 1;
};

const splitOversizedWord = (
  word: Word,
  availableWidth: number,
  maxWidth: number
): { head: Word; tail: Word | null } => {
  const visibleWidth = word.width - word.trailingWhitespaceWidth;
  const contentGlyphCount = word.contentText.length;
  const resolvedAvailableWidth = availableWidth > 0 ? availableWidth : maxWidth;

  if (visibleWidth <= resolvedAvailableWidth || contentGlyphCount <= 1) {
    return {
      head: word,
      tail: null
    };
  }

  const fittingGlyphCount = findLargestFittingContentGlyphCount(word, resolvedAvailableWidth);

  if (fittingGlyphCount >= contentGlyphCount) {
    return {
      head: word,
      tail: null
    };
  }

  return {
    head: buildWordFromGlyphSlice(word, 0, fittingGlyphCount, false),
    tail: buildWordFromGlyphSlice(word, fittingGlyphCount, contentGlyphCount, true)
  };
};

export const breakLines = (
  words: Word[],
  maxWidth: number,
  lineHeight: number
): Line[] => {
  const lines: Line[] = [];
  let currentWords: Word[] = [];
  let currentWidth = 0;

  const flushLine = (): void => {
    const trailingWhitespaceWidth =
      currentWords.length > 0 ? currentWords[currentWords.length - 1].trailingWhitespaceWidth : 0;
    const width = currentWidth;
    const contentWidth = width - trailingWhitespaceWidth;
    const ascent = Math.max(
      0,
      ...currentWords.flatMap((word) => word.glyphs.map((glyph) => glyph.ascent))
    );
    const descent = Math.max(
      0,
      ...currentWords.flatMap((word) => word.glyphs.map((glyph) => glyph.descent))
    );
    const contentMetricsHeight = ascent + descent;
    const resolvedLineHeight = Math.max(lineHeight, contentMetricsHeight || lineHeight);
    const baseline = (resolvedLineHeight - contentMetricsHeight) / 2 + ascent;
    const sourceStart = currentWords[0]?.sourceStart ?? 0;
    const sourceEnd = currentWords[currentWords.length - 1]?.sourceEnd ?? sourceStart;

    lines.push({
      words: currentWords,
      width,
      contentWidth,
      trailingWhitespaceWidth,
      height: resolvedLineHeight,
      ascent,
      descent,
      baseline,
      sourceStart,
      sourceEnd
    });
    currentWords = [];
    currentWidth = 0;
  };

  if (words.length === 0) {
    return [
      {
        words: [],
        width: 0,
        contentWidth: 0,
        trailingWhitespaceWidth: 0,
        height: lineHeight,
        ascent: 0,
        descent: 0,
        baseline: lineHeight / 2,
        sourceStart: 0,
        sourceEnd: 0
      }
    ];
  }

  const pendingWords = [...words];

  while (pendingWords.length > 0) {
    let word = pendingWords.shift() as Word;

    while (true) {
      const candidateVisibleWidth = currentWidth + word.width - word.trailingWhitespaceWidth;

      if (currentWords.length > 0 && candidateVisibleWidth > maxWidth) {
        flushLine();
        continue;
      }

      const visibleWidth = word.width - word.trailingWhitespaceWidth;

      if (currentWords.length === 0 && visibleWidth > maxWidth && isSplittableWord(word)) {
        const { head, tail } = splitOversizedWord(word, maxWidth, maxWidth);

        currentWords.push(head);
        currentWidth += head.width;
        flushLine();

        if (tail) {
          word = tail;
          continue;
        }
      } else {
        currentWords.push(word);
        currentWidth += word.width;
      }

      break;
    }
  }

  if (currentWords.length > 0) {
    flushLine();
  }

  return lines;
};

export const layoutParagraph = (
  input: ParagraphLayoutInput,
  fontCache: FontMeasureCache
): ParagraphSkeleton => {
  const words = measureWords(input.text, input.sourceStart, input.textStyle, fontCache);
  const baseMetrics = fontCache.measureGlyph("M", input.textStyle);
  const lineHeight = Math.max(
    baseMetrics.ascent + baseMetrics.descent,
    input.textStyle.fontSize * (input.paragraphStyle.lineHeight ?? 1.4)
  );
  const lines = breakLines(words, input.pageWidth, lineHeight);
  const contentHeight = lines.reduce((total, line) => total + line.height, 0);
  const spacingBefore = input.paragraphStyle.spacingBefore ?? 0;
  const spacingAfter = input.paragraphStyle.spacingAfter ?? 0;

  return {
    paraIndex: input.paraIndex,
    paragraphId: input.paragraphId,
    sourceStart: input.sourceStart,
    sourceEnd: input.sourceEnd,
    text: input.text,
    lines,
    contentHeight,
    spacingBefore,
    spacingAfter,
    totalHeight: spacingBefore + contentHeight + spacingAfter,
    lineHeight,
    layoutKey: createParagraphLayoutKey(
      input.revision,
      input.pageWidth,
      input.fontEpoch,
      input.paragraphStyle,
      input.textStyle
    ),
    revision: input.revision,
    pageWidth: input.pageWidth
  };
};
