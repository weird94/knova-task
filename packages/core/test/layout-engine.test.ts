import { describe, expect, it, vi } from "vitest";
import { LayoutEngine } from "../src/layout-engine";
import { createDocument, createFontCache, createLayoutSettings } from "./helpers";

describe("LayoutEngine", () => {
  it("reuses clean paragraphs on local edits", () => {
    const settings = createLayoutSettings();
    const fontCache = createFontCache();
    const document = createDocument(
      [{ text: "hello world" }, { text: "second paragraph" }, { text: "third paragraph" }],
      settings
    );
    const engine = new LayoutEngine({ document, settings, fontCache });

    const first = engine.layout();

    engine.applyEdit({
      position: 1,
      deleteCount: 0,
      insertText: "!"
    });

    const second = engine.layout();

    expect(first.paragraphs).toHaveLength(3);
    expect(second.stats.reflowedParagraphs).toEqual([0]);
    expect(second.stats.reusedParagraphs).toEqual([1, 2]);
  });

  it("reuses page prefixes when a later paragraph changes", () => {
    const settings = {
      ...createLayoutSettings(),
      pageHeight: 80
    };
    const fontCache = createFontCache();
    const document = createDocument(
      [
        { text: "one two three four five six seven eight nine ten" },
        { text: "eleven twelve thirteen fourteen fifteen sixteen" },
        { text: "seventeen eighteen nineteen twenty twentyone twentytwo" },
        { text: "twentythree twentyfour twentyfive twentysix twentyseven" }
      ],
      settings
    );
    const engine = new LayoutEngine({ document, settings, fontCache });
    const first = engine.layout();
    const dirtyParagraph = 3;
    const expectedDirtyPage = first.pages.findIndex((page) =>
      page.slices.some((slice) => slice.paraIndex === dirtyParagraph)
    );
    const editPosition = document.getParagraph(dirtyParagraph).start + 1;

    engine.applyEdit({
      position: editPosition,
      deleteCount: 0,
      insertText: "!"
    });

    const second = engine.layout();

    expect(expectedDirtyPage).toBeGreaterThan(0);
    expect(second.stats.reflowedParagraphs).toEqual([dirtyParagraph]);
    expect(second.stats.repaginatedFromPage).toBe(expectedDirtyPage);
    expect(second.stats.reusedPages).toBe(expectedDirtyPage);
    expect(second.pages.slice(0, expectedDirtyPage)).toEqual(
      first.pages.slice(0, expectedDirtyPage)
    );
  });

  it("rebuilds and repaginates from the first dirty page on structural edits", () => {
    const settings = {
      ...createLayoutSettings(),
      pageHeight: 70
    };
    const fontCache = createFontCache();
    const document = createDocument(
      [
        { text: "one two three four five six" },
        { text: "seven eight nine ten eleven twelve" },
        { text: "thirteen fourteen fifteen sixteen" }
      ],
      settings
    );
    const engine = new LayoutEngine({ document, settings, fontCache });

    engine.layout();

    engine.applyEdit({
      position: 3,
      deleteCount: 0,
      insertText: "\nextra"
    });

    const snapshot = engine.layout();

    expect(snapshot.stats.reflowedParagraphs[0]).toBe(0);
    expect(snapshot.stats.repaginatedFromPage).toBe(0);
    expect(snapshot.pages.length).toBeGreaterThan(0);
  });

  it("invalidates all paragraphs after the font metrics epoch changes", () => {
    const settings = createLayoutSettings();
    const fontCache = createFontCache();
    const document = createDocument(
      [{ text: "hello world" }, { text: "second paragraph" }, { text: "third paragraph" }],
      settings
    );
    const engine = new LayoutEngine({ document, settings, fontCache });

    engine.layout();
    fontCache.bumpFontEpoch();

    const snapshot = engine.layout();

    expect(snapshot.stats.reflowedParagraphs).toEqual([0, 1, 2]);
    expect(snapshot.stats.reusedParagraphs).toEqual([]);
  });

  it("forces a full reflow after invalidateAll is called", () => {
    const settings = createLayoutSettings();
    const fontCache = createFontCache();
    const document = createDocument(
      [{ text: "alpha beta" }, { text: "gamma delta" }],
      settings
    );
    const engine = new LayoutEngine({ document, settings, fontCache });

    engine.layout();
    engine.invalidateAll();

    const snapshot = engine.layout();

    expect(snapshot.stats.reflowedParagraphs).toEqual([0, 1]);
    expect(snapshot.stats.reusedParagraphs).toEqual([]);
  });

  it("lays out oversized tokens as multiple line fragments without overflowing a single line", () => {
    const settings = {
      ...createLayoutSettings(),
      pageWidth: 44
    };
    const contentWidth = settings.pageWidth - settings.margins.left - settings.margins.right;
    const fontCache = createFontCache();
    const document = createDocument([{ text: "encyclopedia" }], settings);
    const engine = new LayoutEngine({ document, settings, fontCache });

    const snapshot = engine.layout();
    const paragraph = snapshot.paragraphs[0];

    expect(paragraph.lines.length).toBeGreaterThan(1);
    expect(
      paragraph.lines.map((line) => line.words.map((word) => word.text).join("")).join("")
    ).toBe("encyclopedia");
    expect(paragraph.lines.every((line) => line.contentWidth <= contentWidth)).toBe(true);
  });

  it("debounces scheduled layout calls onto a single callback", () => {
    const settings = createLayoutSettings();
    const fontCache = createFontCache();
    const document = createDocument([{ text: "hello world" }], settings);
    const queue: Array<() => void> = [];
    const scheduler = vi.fn((callback: () => void) => {
      queue.push(callback);
    });
    const engine = new LayoutEngine({
      document,
      settings,
      fontCache,
      scheduler
    });
    const callback = vi.fn();

    expect(engine.scheduleLayout(callback)).toBe(true);
    expect(engine.scheduleLayout(callback)).toBe(false);
    expect(scheduler).toHaveBeenCalledTimes(1);

    queue[0]();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
