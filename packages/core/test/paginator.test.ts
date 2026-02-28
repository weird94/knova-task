import { describe, expect, it } from "vitest";
import { paginateParagraphs } from "../src/paginator";
import type { ParagraphSkeleton } from "../src/types";
import { createLayoutSettings } from "./helpers";

const createParagraphSkeleton = (
  paraIndex: number,
  lineHeights: number[],
  spacingBefore = 4,
  spacingAfter = 6
): ParagraphSkeleton => ({
  paraIndex,
  paragraphId: `paragraph-${paraIndex}`,
  sourceStart: 0,
  sourceEnd: 0,
  text: "",
  lines: lineHeights.map((height, index) => ({
    words: [],
    width: 0,
    contentWidth: 0,
    trailingWhitespaceWidth: 0,
    height,
    ascent: 7,
    descent: 3,
    baseline: 8,
    sourceStart: index,
    sourceEnd: index + 1
  })),
  contentHeight: lineHeights.reduce((total, height) => total + height, 0),
  spacingBefore,
  spacingAfter,
  totalHeight: spacingBefore + lineHeights.reduce((total, height) => total + height, 0) + spacingAfter,
  lineHeight: lineHeights[0] ?? 12,
  layoutKey: `${paraIndex}`,
  revision: 1,
  pageWidth: 100
});

describe("paginateParagraphs", () => {
  it("keeps slice tops continuous across multiple paragraphs on the same page", () => {
    const settings = createLayoutSettings();
    const pages = paginateParagraphs(
      [createParagraphSkeleton(0, [20]), createParagraphSkeleton(1, [10, 10])],
      settings
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].slices).toHaveLength(2);
    expect(pages[0].slices[0].top).toBe(0);
    expect(pages[0].slices[0].height).toBe(30);
    expect(pages[0].slices[1].top).toBe(30);
    expect(pages[0].slices[1].height).toBe(30);
  });

  it("splits paragraphs across pages using paragraph slices", () => {
    const settings = createLayoutSettings();
    const pages = paginateParagraphs(
      [createParagraphSkeleton(0, [20, 20, 20, 20, 20])],
      settings
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].slices[0].lineStart).toBe(0);
    expect(pages[0].slices[0].lineEnd).toBeLessThan(5);
    expect(pages[1].slices[0].lineStart).toBeGreaterThan(0);
    expect(pages[1].slices[0].top).toBe(0);
  });

  it("keeps spacing-before only on the first slice and spacing-after only on the last", () => {
    const settings = createLayoutSettings();
    const pages = paginateParagraphs(
      [createParagraphSkeleton(0, [40, 40, 40])],
      settings
    );

    expect(pages[0].slices[0].includesSpacingBefore).toBe(true);
    expect(pages[0].slices[0].includesSpacingAfter).toBe(false);
    expect(pages[pages.length - 1].slices[0].includesSpacingAfter).toBe(true);
  });

  it("forces oversized lines onto an empty page instead of looping forever", () => {
    const settings = createLayoutSettings();
    const pages = paginateParagraphs(
      [createParagraphSkeleton(0, [200], 4, 6)],
      settings
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].usedHeight).toBeGreaterThan(settings.pageHeight - settings.margins.top - settings.margins.bottom);
  });
});
