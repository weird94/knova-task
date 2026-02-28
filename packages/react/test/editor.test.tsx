import { Editor as CoreEditor, type LayoutSettings, type TextStyle } from "@knova/core";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "../src/editor";

afterEach(() => {
  cleanup();
});

const createLayoutSettings = (): LayoutSettings => ({
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

const createEditor = (paragraphs = ["alpha"]) =>
  new CoreEditor({
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

        return { width: char === "\t" ? 16 : 8, ascent: 7, descent: 3 };
      }
    }
  });

describe("react Editor component", () => {
  it("inserts text through the hidden textarea and emits onChange", () => {
    const editor = createEditor(["alpha"]);
    const onChange = vi.fn();
    const rendered = render(<Editor editor={editor} onChange={onChange} autoFocus />);
    const textarea = rendered.getByTestId("hidden-editor-textarea") as HTMLTextAreaElement;

    act(() => {
      fireEvent.focus(textarea);
      fireEvent.input(textarea, {
        target: {
          value: "A"
        }
      });
    });

    expect(editor.getText()).toBe("Aalpha");
    expect(editor.getState().caretIndex).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].text).toBe("Aalpha");
  });

  it("handles backspace through keyboard events", () => {
    const editor = createEditor(["alpha"]);
    const rendered = render(<Editor editor={editor} autoFocus />);
    const textarea = rendered.getByTestId("hidden-editor-textarea") as HTMLTextAreaElement;

    act(() => {
      fireEvent.focus(textarea);
      fireEvent.input(textarea, {
        target: {
          value: "A"
        }
      });
      fireEvent.keyDown(textarea, {
        key: "Backspace"
      });
    });

    expect(editor.getText()).toBe("alpha");
    expect(editor.getState().caretIndex).toBe(0);
  });

  it("moves the caret with arrow keys without mutating the document", () => {
    const editor = createEditor(["alpha beta gamma delta epsilon"]);
    const rendered = render(<Editor editor={editor} autoFocus />);
    const textarea = rendered.getByTestId("hidden-editor-textarea") as HTMLTextAreaElement;
    const before = editor.getText();

    act(() => {
      fireEvent.focus(textarea);
      fireEvent.keyDown(textarea, {
        key: "ArrowDown"
      });
      fireEvent.keyDown(textarea, {
        key: "ArrowRight"
      });
    });

    expect(editor.getText()).toBe(before);
    expect(editor.getState().caretIndex).toBe(1);
  });

  it("focuses the hidden textarea after clicking the page and accepts input", () => {
    const editor = createEditor(["alpha"]);
    const rendered = render(<Editor editor={editor} />);
    const page = rendered.getByTestId("editor-page-0");
    const textarea = rendered.getByTestId("hidden-editor-textarea") as HTMLTextAreaElement;

    act(() => {
      fireEvent.mouseDown(page);
    });

    expect(document.activeElement).toBe(textarea);
    expect(editor.getState().caretIndex).toBe(0);

    act(() => {
      fireEvent.input(textarea, {
        target: {
          value: "A"
        }
      });
    });

    expect(editor.getText()).toBe("Aalpha");
  });
});
