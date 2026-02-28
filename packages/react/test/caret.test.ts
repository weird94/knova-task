import { Editor, type LayoutSettings, type TextStyle } from "@knova/core";
import { describe, expect, it } from "vitest";
import {
  resolveCaretPlacement,
  resolveIndexFromPagePoint,
  resolveVerticalCaretIndex
} from "../src/caret";

const createLayoutSettings = (): LayoutSettings => ({
  pageWidth: 120,
  pageHeight: 80,
  margins: {
    top: 8,
    right: 8,
    bottom: 8,
    left: 8
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
    spacingBefore: 2,
    spacingAfter: 4,
    textAlign: "left"
  }
});

const createEditor = (paragraphs = ["alpha beta gamma delta", "omega sigma"]) =>
  new Editor({
    document: {
      settings: createLayoutSettings(),
      blocks: paragraphs.map((text, index) => ({
        id: `paragraph-${index}`,
        text
      }))
    },
    measurer: {
      measureGlyph(char: string, _textStyle: TextStyle) {
        if (char === " ") {
          return { width: 4, ascent: 7, descent: 3 };
        }

        return { width: 8, ascent: 7, descent: 3 };
      }
    }
  });

describe("react caret geometry", () => {
  it("resolves caret placement for a document index", () => {
    const editor = createEditor();
    const state = editor.getState();
    const placement = resolveCaretPlacement(
      state.layoutSnapshot,
      state.document.blocks,
      state.document.settings,
      28,
      3
    );

    expect(placement).not.toBeNull();
    expect(placement?.index).toBe(3);
    expect(placement?.pageIndex).toBe(0);
    expect(placement?.x).toBeGreaterThan(0);
    expect(placement?.height).toBeGreaterThan(0);
  });

  it("maps a click inside the first page back to an insertion index", () => {
    const editor = createEditor();
    const state = editor.getState();
    const index = resolveIndexFromPagePoint({
      localX: state.document.settings.margins.left + 1,
      localY: state.document.settings.margins.top + 2,
      pageIndex: 0,
      settings: state.document.settings,
      snapshot: state.layoutSnapshot,
      blocks: state.document.blocks
    });

    expect(index).toBe(0);
  });

  it("moves vertically between laid out lines", () => {
    const editor = createEditor(["alpha beta gamma delta epsilon zeta eta theta"]);
    const state = editor.getState();
    const nextIndex = resolveVerticalCaretIndex({
      snapshot: state.layoutSnapshot,
      blocks: state.document.blocks,
      settings: state.document.settings,
      pageGap: 28,
      index: 2,
      direction: 1
    });

    expect(nextIndex).toBeGreaterThan(2);
  });

  it("maps clicks on continuation fragments back to the correct global index", () => {
    const editor = createEditor(["abcdefghijklmnopqrstuvwxyz1234567890"]);
    const state = editor.getState();
    const paragraph = state.layoutSnapshot.paragraphs[0];
    const secondLine = paragraph.lines[1];
    const index = resolveIndexFromPagePoint({
      localX: state.document.settings.margins.left + 1,
      localY:
        state.document.settings.margins.top +
        paragraph.spacingBefore +
        paragraph.lines[0].height +
        1,
      pageIndex: 0,
      settings: state.document.settings,
      snapshot: state.layoutSnapshot,
      blocks: state.document.blocks
    });

    expect(secondLine).toBeDefined();
    expect(index).toBe(secondLine.sourceStart);
  });
});
