import {
  Editor as CoreEditor,
  type EditorDocumentInput,
  type EditorState,
  type LayoutParagraphInput,
  type LayoutSettings,
  type TextStyle
} from "@knova/core";
import { Editor } from "@knova/react";
import { useEffect, useState } from "react";
import { initialJson } from "./demo-data";

type DemoPayload = {
  settings: LayoutSettings;
  paragraphs: LayoutParagraphInput[];
};

type ParsedState =
  | {
      ok: true;
      editor: CoreEditor;
    }
  | {
      ok: false;
      error: string;
    };

type PersistedEditorState = {
  version: 1;
  caretIndex: number;
  payload: DemoPayload;
};

const STORAGE_KEY = "knova:web:editor-state";

const createCanvasTextMeasurer = () => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available in this browser.");
  }

  return {
    measureGlyph(char: string, textStyle: TextStyle) {
      const fontWeight = textStyle.fontWeight ?? 400;
      const fontStyle = textStyle.fontStyle ?? "normal";
      context.font = `${fontStyle} ${fontWeight} ${textStyle.fontSize}px ${textStyle.fontFamily}`;

      const metrics = context.measureText(char);
      const ascent =
        metrics.fontBoundingBoxAscent ||
        metrics.actualBoundingBoxAscent ||
        textStyle.fontSize * 0.8;
      const descent =
        metrics.fontBoundingBoxDescent ||
        metrics.actualBoundingBoxDescent ||
        textStyle.fontSize * 0.2;

      return {
        width: metrics.width,
        ascent,
        descent
      };
    }
  };
};

const toEditorDocument = (payload: DemoPayload): EditorDocumentInput => ({
  settings: payload.settings,
  blocks: payload.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    text: paragraph.text,
    paragraphStyle: paragraph.paragraphStyle,
    textStyle: paragraph.textStyle
  }))
});

const toDemoPayload = (state: EditorState): DemoPayload => ({
  settings: state.document.settings,
  paragraphs: state.document.blocks.map((block) => ({
    id: block.id,
    text: block.text,
    paragraphStyle: block.paragraphStyle,
    textStyle: block.textStyle
  }))
});

const readPersistedState = (): PersistedEditorState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as PersistedEditorState;

    if (parsed.version !== 1 || typeof parsed.caretIndex !== "number" || !parsed.payload) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const persistEditorState = (state: EditorState): void => {
  if (typeof window === "undefined") {
    return;
  }

  const persistedState: PersistedEditorState = {
    version: 1,
    caretIndex: state.caretIndex,
    payload: toDemoPayload(state)
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
};

const parseInitialState = (): ParsedState => {
  try {
    const persistedState = readPersistedState();
    const payload = persistedState?.payload ?? (JSON.parse(initialJson) as DemoPayload);
    const editor = new CoreEditor({
      document: toEditorDocument(payload),
      measurer: createCanvasTextMeasurer(),
      debug: true
    });

    if (persistedState) {
      editor.setCaretIndex(persistedState.caretIndex);
    }

    return {
      ok: true,
      editor
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown parse error."
    };
  }
};

export default function App() {
  const [state] = useState<ParsedState>(() => parseInitialState());

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    persistEditorState(state.editor.getState());

    return state.editor.subscribe(() => {
      persistEditorState(state.editor.getState());
    });
  }, [state]);

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Layout Demo</p>
        <h1>Canvas editor only.</h1>
        <p className="hero-copy">
          The app keeps a single in-memory core editor instance and saves its
          document plus caret to local storage in real time, so refresh restores
          the latest local session.
        </p>
      </section>

      <section className="workspace">
        <section className="panel panel-right">
          {state.ok ? (
            <Editor
              editor={state.editor}
              autoFocus
              debug
              className="preview-viewport"
              style={{ minHeight: "80vh" }}
            />
          ) : (
            <div className="error-card">
              <pre>{state.error}</pre>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
