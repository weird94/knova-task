import { describe, expect, it } from "vitest";
import { createDocument } from "./helpers";

describe("LayoutDocumentView", () => {
  it("indexes paragraphs with binary-search friendly newline offsets", () => {
    const document = createDocument([
      { text: "alpha" },
      { text: "beta" },
      { text: "gamma" }
    ]);

    expect(document.text).toBe("alpha\nbeta\ngamma");
    expect(document.paragraphBreakOffsets).toEqual([5, 10]);
    expect(document.findParagraphIndex(0)).toBe(0);
    expect(document.findParagraphIndex(5)).toBe(0);
    expect(document.findParagraphIndex(6)).toBe(1);
    expect(document.findParagraphIndex(document.text.length)).toBe(2);
  });

  it("updates only the edited paragraph for local edits", () => {
    const document = createDocument([{ text: "hello world" }, { text: "second" }]);
    const before = document.getParagraphs().map((paragraph) => paragraph.revision);
    const result = document.applyEdit({
      position: 6,
      deleteCount: 0,
      insertText: "wide "
    });
    const after = document.getParagraphs().map((paragraph) => paragraph.revision);

    expect(result.kind).toBe("local");
    expect(result.dirtyFromParagraph).toBe(0);
    expect(document.getParagraph(0).text).toBe("hello wide world");
    expect(after[0]).toBe(before[0] + 1);
    expect(after[1]).toBe(before[1]);
  });

  it("rebuilds paragraph state from the first affected paragraph on structural edits", () => {
    const document = createDocument([{ text: "hello world" }, { text: "second line" }]);
    const result = document.applyEdit({
      position: 5,
      deleteCount: 1,
      insertText: "\n"
    });

    expect(result.kind).toBe("structural");
    expect(document.getParagraphCount()).toBe(3);
    expect(document.getParagraph(0).text).toBe("hello");
    expect(document.getParagraph(1).text).toBe("world");
    expect(document.getParagraph(2).text).toBe("second line");
  });

  it("merges paragraphs when deleting a newline", () => {
    const document = createDocument([{ text: "first" }, { text: "second" }, { text: "third" }]);
    const result = document.applyEdit({
      position: 5,
      deleteCount: 1,
      insertText: ""
    });

    expect(result.kind).toBe("structural");
    expect(result.dirtyFromParagraph).toBe(0);
    expect(document.getParagraphCount()).toBe(2);
    expect(document.getParagraph(0).text).toBe("firstsecond");
    expect(document.getParagraph(1).text).toBe("third");
  });

  it("splits one paragraph into several paragraphs when multiple newlines are inserted", () => {
    const document = createDocument([{ text: "alpha" }, { text: "omega" }]);
    const result = document.applyEdit({
      position: 2,
      deleteCount: 0,
      insertText: "X\nY\n"
    });

    expect(result.kind).toBe("structural");
    expect(result.dirtyFromParagraph).toBe(0);
    expect(document.getParagraphCount()).toBe(4);
    expect(document.getParagraphs().map((paragraph) => paragraph.text)).toEqual([
      "alX",
      "Y",
      "pha",
      "omega"
    ]);
  });

  it("collapses multiple paragraphs when deleting across paragraph boundaries", () => {
    const document = createDocument([
      { text: "alpha" },
      { text: "beta" },
      { text: "gamma" },
      { text: "delta" }
    ]);
    const deleteStart = document.text.indexOf("\n");
    const deleteCount = document.text.indexOf("delta") - deleteStart;
    const result = document.applyEdit({
      position: deleteStart,
      deleteCount,
      insertText: ""
    });

    expect(result.kind).toBe("structural");
    expect(result.dirtyFromParagraph).toBe(0);
    expect(document.getParagraphCount()).toBe(1);
    expect(document.getParagraphs().map((paragraph) => paragraph.text)).toEqual([
      "alphadelta"
    ]);
  });

  it("bumps paragraph revision and document version when styles are updated", () => {
    const document = createDocument([{ text: "styled" }]);
    const before = document.getParagraph(0);
    const beforeVersion = document.version;

    document.updateParagraphStyles(0, {
      paragraphStyle: {
        spacingAfter: 24
      },
      textStyle: {
        fontSize: 14
      }
    });

    const after = document.getParagraph(0);

    expect(document.version).toBe(beforeVersion + 1);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.paragraphStyle.spacingAfter).toBe(24);
    expect(after.paragraphStyle.lineHeight).toBe(before.paragraphStyle.lineHeight);
    expect(after.textStyle.fontSize).toBe(14);
    expect(after.textStyle.fontFamily).toBe(before.textStyle.fontFamily);
  });
});
