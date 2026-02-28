import { Editor, type LayoutSettings, type TextStyle } from "@knova/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditor } from "../src/use-editor";

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

        return { width: char === "\t" ? 16 : 8, ascent: 7, descent: 3 };
      }
    }
  });

const EditorView = ({
  editor,
  onRender
}: {
  editor: Editor;
  onRender?: (state: { text: string; caretIndex: number }) => void;
}) => {
  const state = useEditor(editor);

  onRender?.({
    text: state.text,
    caretIndex: state.caretIndex
  });

  return (
    <div data-testid="editor-text" data-caret-index={state.caretIndex}>
      {state.text}
    </div>
  );
};

describe("useEditor", () => {
  it("reads the initial editor state", () => {
    const editor = createEditor(["alpha", "beta"]);

    render(<EditorView editor={editor} />);

    expect(screen.getByTestId("editor-text").textContent).toBe("alpha\nbeta");
  });

  it("re-renders when the editor state changes", () => {
    const editor = createEditor(["alpha"]);

    render(<EditorView editor={editor} />);

    act(() => {
      editor.applyMutation({
        type: "insert",
        index: 5,
        text: "!"
      });
    });

    expect(screen.getByTestId("editor-text").textContent).toBe("alpha!");
  });

  it("does not re-render for no-op mutations", () => {
    const editor = createEditor(["alpha"]);
    const onRender = vi.fn();

    render(<EditorView editor={editor} onRender={onRender} />);

    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      editor.applyMutation({
        type: "insert",
        index: 0,
        text: ""
      });
    });

    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("re-renders when only the caret index changes", () => {
    const editor = createEditor(["alpha"]);

    render(<EditorView editor={editor} />);

    act(() => {
      editor.setCaretIndex(3);
    });

    expect(screen.getByTestId("editor-text").getAttribute("data-caret-index")).toBe("3");
  });

  it("unsubscribes on unmount", () => {
    const editor = createEditor(["alpha"]);
    const originalSubscribe = editor.subscribe;
    const unsubscribe = vi.fn();

    editor.subscribe = ((listener: () => void) => {
      const cleanup = originalSubscribe(listener);

      return () => {
        unsubscribe();
        cleanup();
      };
    }) as typeof editor.subscribe;

    const rendered = render(<EditorView editor={editor} />);

    rendered.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("switches subscriptions when a different editor instance is provided", () => {
    const first = createEditor(["alpha"]);
    const second = createEditor(["omega"]);
    const rendered = render(<EditorView editor={first} />);

    expect(screen.getByTestId("editor-text").textContent).toBe("alpha");

    rendered.rerender(<EditorView editor={second} />);

    expect(screen.getByTestId("editor-text").textContent).toBe("omega");

    act(() => {
      first.applyMutation({
        type: "insert",
        index: 5,
        text: "!"
      });
    });

    expect(screen.getByTestId("editor-text").textContent).toBe("omega");
  });
});
