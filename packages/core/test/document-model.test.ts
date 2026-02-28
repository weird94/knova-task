import { describe, expect, it } from "vitest";
import {
  materializeDocumentFromParagraphRecords,
  normalizeEditorDocument,
  toLayoutParagraphInputs
} from "../src/document-model";
import { createDocument, createLayoutSettings } from "./helpers";

describe("document-model", () => {
  it("normalizes an empty document into a single empty paragraph", () => {
    const settings = createLayoutSettings();
    const document = normalizeEditorDocument({
      settings,
      blocks: []
    });

    expect(document.id).toBe("document-0");
    expect(document.version).toBe(1);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({
      id: "paragraph-0",
      type: "paragraph",
      text: ""
    });
  });

  it("assigns paragraph ids and normalizes styles", () => {
    const settings = createLayoutSettings();
    const document = normalizeEditorDocument({
      id: "doc-1",
      version: 3,
      settings,
      blocks: [
        {
          text: "alpha",
          paragraphStyle: {
            spacingAfter: 24
          },
          textStyle: {
            fontSize: 18
          }
        }
      ]
    });

    expect(document).toMatchObject({
      id: "doc-1",
      version: 3
    });
    expect(document.blocks[0].id).toBe("paragraph-0");
    expect(document.blocks[0].paragraphStyle.spacingAfter).toBe(24);
    expect(document.blocks[0].paragraphStyle.lineHeight).toBe(
      settings.defaultParagraphStyle.lineHeight
    );
    expect(document.blocks[0].textStyle.fontSize).toBe(18);
    expect(document.blocks[0].textStyle.fontFamily).toBe(
      settings.defaultTextStyle.fontFamily
    );
  });

  it("rejects paragraph text containing newlines", () => {
    const settings = createLayoutSettings();

    expect(() =>
      normalizeEditorDocument({
        settings,
        blocks: [{ text: "alpha\nbeta" }]
      })
    ).toThrow("Paragraph text must not contain newline characters.");
  });

  it("converts normalized blocks into layout paragraph inputs", () => {
    const settings = createLayoutSettings();
    const document = normalizeEditorDocument({
      settings,
      blocks: [{ id: "intro", text: "hello" }]
    });

    expect(toLayoutParagraphInputs(document)).toEqual([
      {
        id: "intro",
        text: "hello",
        paragraphStyle: document.blocks[0].paragraphStyle,
        textStyle: document.blocks[0].textStyle
      }
    ]);
  });

  it("materializes a document from paragraph records while preserving settings", () => {
    const settings = createLayoutSettings();
    const previous = normalizeEditorDocument({
      id: "doc-1",
      version: 2,
      settings,
      blocks: [
        { id: "alpha", text: "alpha" },
        { id: "beta", text: "beta" }
      ]
    });
    const layoutDocument = createDocument(toLayoutParagraphInputs(previous), settings);
    const next = materializeDocumentFromParagraphRecords(
      previous,
      layoutDocument.getParagraphs(),
      4
    );

    expect(next.id).toBe("doc-1");
    expect(next.version).toBe(4);
    expect(next.settings).toBe(settings);
    expect(next.blocks.map((block) => block.id)).toEqual(["alpha", "beta"]);
  });
});
