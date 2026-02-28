import { FontMeasureCache, type GlyphMeasurer } from "../src/font-measure-cache";
import type {
  LayoutParagraphInput,
  LayoutSettings,
  TextStyle
} from "../src/types";
import { LayoutDocumentView } from "../src/layout-document-view";

export const createLayoutSettings = (): LayoutSettings => ({
  pageWidth: 160,
  pageHeight: 120,
  margins: {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10
  },
  defaultTextStyle: {
    fontFamily: "Test Sans",
    fontSize: 10,
    fontWeight: 400,
    fontStyle: "normal",
    letterSpacing: 0
  },
  defaultParagraphStyle: {
    lineHeight: 1.2,
    spacingBefore: 4,
    spacingAfter: 6,
    textAlign: "left"
  }
});

export const createMonospaceMeasurer = (
  tracker?: { calls: string[] }
): GlyphMeasurer => ({
  measureGlyph(char: string, textStyle: TextStyle) {
    tracker?.calls.push(`${textStyle.fontFamily}:${char}`);

    if (char === " ") {
      return { width: 4, ascent: 7, descent: 3 };
    }

    return { width: char === "\t" ? 16 : 8, ascent: 7, descent: 3 };
  }
});

export const createFontCache = (tracker?: { calls: string[] }): FontMeasureCache =>
  new FontMeasureCache(createMonospaceMeasurer(tracker), {
    maxGlyphsPerFont: 4
  });

export const createDocument = (
  paragraphs: LayoutParagraphInput[],
  settings = createLayoutSettings()
): LayoutDocumentView => new LayoutDocumentView(paragraphs, settings);
