import { describe, expect, it } from "vitest";
import {
  breakLines,
  layoutParagraph,
  measureWords,
  rebaseParagraphSkeleton
} from "../src/paragraph-layout";
import { createFontCache, createLayoutSettings } from "./helpers";

describe("paragraph layout", () => {
  it("measures words and separates trailing whitespace from content width", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords("hello world ", 0, settings.defaultTextStyle, fontCache);

    expect(words[0].contentWidth).toBe(40);
    expect(words[0].trailingWhitespaceWidth).toBe(4);
    expect(words[1].contentWidth).toBe(40);
    expect(words[1].trailingWhitespaceWidth).toBe(4);
  });

  it("produces a paragraph skeleton with line metrics and spacing", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const skeleton = layoutParagraph(
      {
        paragraphId: "paragraph-0",
        paraIndex: 0,
        text: "hello world from knova",
        sourceStart: 0,
        sourceEnd: 22,
        paragraphStyle: settings.defaultParagraphStyle,
        textStyle: settings.defaultTextStyle,
        revision: 1,
        pageWidth: 60,
        fontEpoch: fontCache.fontEpoch
      },
      fontCache
    );

    expect(skeleton.lines.length).toBeGreaterThan(1);
    expect(skeleton.spacingBefore).toBe(4);
    expect(skeleton.spacingAfter).toBe(6);
    expect(skeleton.totalHeight).toBe(
      skeleton.spacingBefore + skeleton.contentHeight + skeleton.spacingAfter
    );
  });

  it("breaks lines on exact visible width without treating trailing space as overflow", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords("hello world", 0, settings.defaultTextStyle, fontCache);
    const lines = breakLines(words, 40, 12);

    expect(lines).toHaveLength(2);
    expect(lines[0].contentWidth).toBe(40);
    expect(lines[0].trailingWhitespaceWidth).toBe(4);
    expect(lines[0].words.map((word) => word.text).join("")).toBe("hello ");
    expect(lines[1].words.map((word) => word.text).join("")).toBe("world");
  });

  it("splits an oversized word across multiple lines", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords("encyclopedia", 0, settings.defaultTextStyle, fontCache);
    const lines = breakLines(words, 20, 12);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((line) => line.words.map((word) => word.text).join("")).join("")).toBe(
      "encyclopedia"
    );
    expect(lines.every((line) => line.contentWidth <= 20)).toBe(true);
  });

  it("splits oversized punctuation and url-like tokens across lines", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const text = "https://example.com/veryveryverylongpath";
    const words = measureWords(text, 0, settings.defaultTextStyle, fontCache);
    const lines = breakLines(words, 40, 12);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((line) => line.words.map((word) => word.text).join("")).join("")).toBe(text);
  });

  it("keeps trailing whitespace only on the final fragment of a split token", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords("superlongword   ", 0, settings.defaultTextStyle, fontCache);
    const lines = breakLines(words, 24, 12);
    const fragments = lines.flatMap((line) => line.words);

    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.slice(0, -1).every((word) => word.trailingWhitespaceText === "")).toBe(true);
    expect(fragments[fragments.length - 1].trailingWhitespaceText).toBe("   ");
  });

  it("preserves contiguous source offsets across split fragments", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const text = "encyclopedia";
    const words = measureWords(text, 10, settings.defaultTextStyle, fontCache);
    const originalOffsets = words[0].glyphs.map((glyph) => glyph.sourceOffset);
    const lines = breakLines(words, 20, 12);
    const fragmentOffsets = lines.flatMap((line) =>
      line.words.flatMap((word) => word.glyphs.map((glyph) => glyph.sourceOffset))
    );

    expect(fragmentOffsets).toEqual(originalOffsets);
  });

  it("continues to split correctly when letter spacing is applied", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords(
      "abcdef",
      0,
      {
        ...settings.defaultTextStyle,
        letterSpacing: 1
      },
      fontCache
    );
    const lines = breakLines(words, 17, 12);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.contentWidth <= 17)).toBe(true);
    expect(lines.map((line) => line.words.map((word) => word.text).join("")).join("")).toBe(
      "abcdef"
    );
  });

  it("forces at least one glyph per line when every glyph is wider than the line", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords("alpha", 0, settings.defaultTextStyle, fontCache);
    const lines = breakLines(words, 4, 12);

    expect(lines).toHaveLength(5);
    expect(lines.every((line) => line.words[0]?.contentText.length === 1)).toBe(true);
  });

  it("includes letter spacing in content width and trailing whitespace width", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const words = measureWords(
      "hi ",
      0,
      {
        ...settings.defaultTextStyle,
        letterSpacing: 1
      },
      fontCache
    );

    expect(words[0].contentWidth).toBe(17);
    expect(words[0].trailingWhitespaceWidth).toBe(5);
    expect(words[0].width).toBe(22);
  });

  it("rebases cached skeleton offsets when earlier text changes shift source positions", () => {
    const fontCache = createFontCache();
    const settings = createLayoutSettings();
    const skeleton = layoutParagraph(
      {
        paragraphId: "paragraph-0",
        paraIndex: 0,
        text: "hello world",
        sourceStart: 0,
        sourceEnd: 11,
        paragraphStyle: settings.defaultParagraphStyle,
        textStyle: settings.defaultTextStyle,
        revision: 1,
        pageWidth: 80,
        fontEpoch: fontCache.fontEpoch
      },
      fontCache
    );
    const rebased = rebaseParagraphSkeleton(skeleton, 10, 21);

    expect(rebased.sourceStart).toBe(10);
    expect(rebased.sourceEnd).toBe(21);
    expect(rebased.lines[0].sourceStart).toBe(skeleton.lines[0].sourceStart + 10);
    expect(rebased.lines[0].words[0].sourceStart).toBe(
      skeleton.lines[0].words[0].sourceStart + 10
    );
    expect(rebased.lines[0].words[0].glyphs[0].sourceOffset).toBe(
      skeleton.lines[0].words[0].glyphs[0].sourceOffset + 10
    );
    expect(rebased.contentHeight).toBe(skeleton.contentHeight);
  });
});
