import { describe, expect, it, vi } from "vitest";
import { Editor } from "../src/editor";
import { createLayoutSettings, createMonospaceMeasurer } from "./helpers";

const createEditor = (paragraphs = ["alpha", "beta"]) =>
  new Editor({
    document: {
      settings: createLayoutSettings(),
      blocks: paragraphs.map((text, index) => ({
        id: `paragraph-${index}`,
        text
      }))
    },
    measurer: createMonospaceMeasurer()
  });

describe("Editor", () => {
  it("builds initial document and layout state synchronously", () => {
    const editor = createEditor(["alpha", "beta", "gamma"]);
    const state = editor.getState();

    expect(state.text).toBe("alpha\nbeta\ngamma");
    expect(state.version).toBe(1);
    expect(state.caretIndex).toBe(0);
    expect(state.document.blocks).toHaveLength(3);
    expect(state.document.blocks).toHaveLength(state.layoutSnapshot.paragraphs.length);
    expect(editor.getDocument()).toBe(state.document);
    expect(editor.getLayoutSnapshot()).toBe(state.layoutSnapshot);
  });

  it("applies intra-paragraph inserts without changing paragraph ids", () => {
    const editor = createEditor();
    const transaction = editor.applyMutation({
      type: "insert",
      index: 2,
      text: "ZZ"
    });

    expect(transaction.changed).toBe(true);
    expect(transaction.editResult?.kind).toBe("local");
    expect(transaction.state.text).toBe("alZZpha\nbeta");
    expect(transaction.state.document.blocks.map((block) => block.id)).toEqual([
      "paragraph-0",
      "paragraph-1"
    ]);
    expect(transaction.state.version).toBe(2);
    expect(transaction.state.caretIndex).toBe(4);
    expect(transaction.state).toBe(editor.getState());
  });

  it("splits paragraphs on newline insertion and preserves the first paragraph id", () => {
    const editor = createEditor(["alpha", "omega"]);
    const transaction = editor.applyMutation({
      type: "insert",
      index: 2,
      text: "\n"
    });

    expect(transaction.editResult?.kind).toBe("structural");
    expect(transaction.state.document.blocks.map((block) => block.id)).toEqual([
      "paragraph-0",
      "paragraph-2",
      "paragraph-1"
    ]);
    expect(transaction.state.document.blocks.map((block) => block.text)).toEqual([
      "al",
      "pha",
      "omega"
    ]);
  });

  it("supports inserting multiple paragraphs and normalizes CRLF to newlines", () => {
    const editor = createEditor(["alpha", "omega"]);
    const transaction = editor.applyMutation({
      type: "insert",
      index: 2,
      text: "X\r\nY\r"
    });

    expect(transaction.state.document.blocks.map((block) => block.text)).toEqual([
      "alX",
      "Y",
      "pha",
      "omega"
    ]);
  });

  it("treats empty insertions as a no-op", () => {
    const editor = createEditor();
    const listener = vi.fn();

    editor.subscribe(listener);

    const transaction = editor.applyMutation({
      type: "insert",
      index: 1,
      text: ""
    });

    expect(transaction.changed).toBe(false);
    expect(transaction.editResult).toBeNull();
    expect(transaction.state).toBe(editor.getState());
    expect(transaction.state.version).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("updates caret index through a dedicated core setter", () => {
    const editor = createEditor(["alpha"]);
    const listener = vi.fn();

    editor.subscribe(listener);

    const state = editor.setCaretIndex(3);

    expect(state.caretIndex).toBe(3);
    expect(editor.getCaretIndex()).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("deletes inside a paragraph without changing ids", () => {
    const editor = createEditor(["alpha", "beta"]);
    const transaction = editor.applyMutation({
      type: "delete",
      index: 1,
      count: 2
    });

    expect(transaction.state.text).toBe("aha\nbeta");
    expect(transaction.state.document.blocks.map((block) => block.id)).toEqual([
      "paragraph-0",
      "paragraph-1"
    ]);
  });

  it("merges paragraphs when deleting a single newline", () => {
    const editor = createEditor(["alpha", "beta", "gamma"]);
    const transaction = editor.applyMutation({
      type: "delete",
      index: 5,
      count: 1
    });

    expect(transaction.editResult?.kind).toBe("structural");
    expect(transaction.state.document.blocks.map((block) => block.id)).toEqual([
      "paragraph-0",
      "paragraph-2"
    ]);
    expect(transaction.state.document.blocks.map((block) => block.text)).toEqual([
      "alphabeta",
      "gamma"
    ]);
  });

  it("collapses multiple paragraphs when deleting across paragraph boundaries", () => {
    const editor = createEditor(["alpha", "beta", "gamma", "delta"]);
    const deleteStart = editor.getText().indexOf("\n");
    const deleteCount = editor.getText().indexOf("delta") - deleteStart;
    const transaction = editor.applyMutation({
      type: "delete",
      index: deleteStart,
      count: deleteCount
    });

    expect(transaction.state.document.blocks.map((block) => block.id)).toEqual([
      "paragraph-0"
    ]);
    expect(transaction.state.document.blocks.map((block) => block.text)).toEqual([
      "alphadelta"
    ]);
  });

  it("treats zero-count deletes as a no-op", () => {
    const editor = createEditor();
    const listener = vi.fn();

    editor.subscribe(listener);

    const transaction = editor.applyMutation({
      type: "delete",
      index: 1,
      count: 0
    });

    expect(transaction.changed).toBe(false);
    expect(transaction.editResult).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("moves the caret to the delete start after a delete mutation", () => {
    const editor = createEditor(["alpha"]);

    editor.setCaretIndex(4);

    const transaction = editor.applyMutation({
      type: "delete",
      index: 1,
      count: 2
    });

    expect(transaction.state.caretIndex).toBe(1);
  });

  it("throws on out-of-range deletes", () => {
    const editor = createEditor();

    expect(() =>
      editor.applyMutation({
        type: "delete",
        index: 100,
        count: 1
      })
    ).toThrow(RangeError);
  });

  it("notifies subscribers exactly once for a valid mutation", () => {
    const editor = createEditor();
    const listener = vi.fn();

    editor.subscribe(listener);
    editor.applyMutation({
      type: "insert",
      index: 1,
      text: "!"
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("recomputes layout after font epoch changes and notifies subscribers", () => {
    const editor = createEditor();
    const listener = vi.fn();
    const before = editor.getState().layoutSnapshot.fontEpoch;

    editor.subscribe(listener);
    editor.fontCache.bumpFontEpoch();

    const state = editor.recomputeLayout();

    expect(state.layoutSnapshot.fontEpoch).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(state.version).toBe(editor.getState().version);
  });
});
