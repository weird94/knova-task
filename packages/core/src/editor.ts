import { FontMeasureCache, type FontMeasureCacheOptions, type GlyphMeasurer } from "./font-measure-cache";
import {
  type EditorDocument,
  type EditorDocumentInput,
  materializeDocumentFromParagraphRecords,
  normalizeEditorDocument,
  toLayoutParagraphInputs
} from "./document-model";
import { LayoutDocumentView } from "./layout-document-view";
import { LayoutEngine } from "./layout-engine";
import type { EditResult, LayoutSnapshot, TextEdit } from "./types";

type Scheduler = (callback: () => void) => void;

export interface InsertMutation {
  type: "insert";
  index: number;
  text: string;
}

export interface DeleteMutation {
  type: "delete";
  index: number;
  count: number;
}

export type EditorMutation = InsertMutation | DeleteMutation;

export interface EditorState {
  version: number;
  text: string;
  caretIndex: number;
  document: EditorDocument;
  layoutSnapshot: LayoutSnapshot;
}

export interface EditorTransaction {
  mutation: EditorMutation;
  changed: boolean;
  editResult: EditResult | null;
  state: EditorState;
}

export type EditorOptions =
  | {
      document: EditorDocumentInput;
      fontCache: FontMeasureCache;
      debug?: boolean;
      scheduler?: Scheduler;
    }
  | {
      document: EditorDocumentInput;
      measurer: GlyphMeasurer;
      fontCacheOptions?: FontMeasureCacheOptions;
      debug?: boolean;
      scheduler?: Scheduler;
    };

export class Editor {
  private documentModel: EditorDocument;
  private readonly layoutDocument: LayoutDocumentView;
  private readonly layoutEngine: LayoutEngine;
  private readonly listeners = new Set<() => void>();
  private stateInternal: EditorState;
  private readonly debug: boolean;

  readonly fontCache: FontMeasureCache;

  constructor(options: EditorOptions) {
    const document = normalizeEditorDocument(options.document);
    const fontCache = this.createFontCacheFromOptions(options);
    const layoutDocument = new LayoutDocumentView(
      toLayoutParagraphInputs(document),
      document.settings
    );
    const layoutEngine = new LayoutEngine({
      document: layoutDocument,
      settings: document.settings,
      fontCache,
      scheduler: options.scheduler
    });
    const layoutSnapshot = layoutEngine.layout();

    this.documentModel = document;
    this.layoutDocument = layoutDocument;
    this.layoutEngine = layoutEngine;
    this.fontCache = fontCache;
    this.debug = options.debug ?? false;
    this.stateInternal = this.buildState(document.version, layoutSnapshot, 0);
  }

  getState = (): EditorState => this.stateInternal;

  getDocument = (): EditorDocument => this.stateInternal.document;

  getLayoutSnapshot = (): LayoutSnapshot => this.stateInternal.layoutSnapshot;

  getText = (): string => this.stateInternal.text;

  getCaretIndex = (): number => this.stateInternal.caretIndex;

  setCaretIndex = (index: number): EditorState => {
    if (!Number.isInteger(index)) {
      throw new RangeError("Caret index must be an integer.");
    }

    const nextCaretIndex = this.clampCaretIndex(index, this.stateInternal.text.length);

    if (nextCaretIndex === this.stateInternal.caretIndex) {
      return this.stateInternal;
    }

    this.stateInternal = {
      ...this.stateInternal,
      caretIndex: nextCaretIndex
    };
    this.notify();

    return this.stateInternal;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  applyMutation = (mutation: EditorMutation): EditorTransaction => {
    this.validateMutation(mutation);
    this.logMutation("before", mutation, this.stateInternal.text);

    const textEdit = this.toTextEdit(mutation);

    if (!textEdit) {
      this.logMutation("noop", mutation, this.stateInternal.text);
      return {
        mutation,
        changed: false,
        editResult: null,
        state: this.stateInternal
      };
    }

    const editResult = this.layoutEngine.applyEdit(textEdit);
    const nextCaretIndex = this.resolveNextCaretIndex(mutation);
    const nextState = this.buildState(
      this.documentModel.version + 1,
      this.layoutEngine.layout(),
      nextCaretIndex
    );

    this.stateInternal = nextState;
    this.documentModel = nextState.document;
    this.notify();
    this.logMutation("after", mutation, nextState.text);

    return {
      mutation,
      changed: true,
      editResult,
      state: nextState
    };
  };

  recomputeLayout = (): EditorState => {
    const nextState = this.buildState(
      this.documentModel.version,
      this.layoutEngine.layout(),
      this.stateInternal.caretIndex
    );

    this.stateInternal = nextState;
    this.documentModel = nextState.document;
    this.notify();

    return nextState;
  };

  private createFontCacheFromOptions(options: EditorOptions): FontMeasureCache {
    if ("fontCache" in options) {
      return options.fontCache;
    }

    return new FontMeasureCache(options.measurer, options.fontCacheOptions);
  }

  private buildState(
    version: number,
    layoutSnapshot: LayoutSnapshot,
    caretIndex: number
  ): EditorState {
    const document = materializeDocumentFromParagraphRecords(
      this.documentModel,
      this.layoutDocument.getParagraphs(),
      version
    );
    const text = this.layoutDocument.text;

    return {
      version: document.version,
      text,
      caretIndex: this.clampCaretIndex(caretIndex, text.length),
      document,
      layoutSnapshot
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private clampCaretIndex(index: number, textLength: number): number {
    return Math.max(0, Math.min(index, textLength));
  }

  private resolveNextCaretIndex(mutation: EditorMutation): number {
    if (mutation.type === "insert") {
      return mutation.index + this.normalizeInsertedText(mutation.text).length;
    }

    return mutation.index;
  }

  private logMutation(
    phase: "before" | "noop" | "after",
    mutation: EditorMutation,
    text: string
  ): void {
    if (!this.debug) {
      return;
    }

    const position = mutation.index;
    const start = Math.max(0, position - 12);
    const end = Math.min(text.length, position + 12);
    const context = text.slice(start, end);

    console.log(`[knova/core][Editor.applyMutation][${phase}]`, {
      mutation,
      textLength: text.length,
      contextStart: start,
      contextEnd: end,
      context
    });
  }

  private toTextEdit(mutation: EditorMutation): TextEdit | null {
    if (mutation.type === "insert") {
      const insertText = this.normalizeInsertedText(mutation.text);

      if (insertText === "") {
        return null;
      }

      return {
        position: mutation.index,
        deleteCount: 0,
        insertText
      };
    }

    if (mutation.count === 0) {
      return null;
    }

    return {
      position: mutation.index,
      deleteCount: mutation.count,
      insertText: ""
    };
  }

  private normalizeInsertedText(text: string): string {
    return text.replace(/\r\n?/g, "\n");
  }

  private validateMutation(mutation: EditorMutation): void {
    if (!Number.isInteger(mutation.index)) {
      throw new RangeError("Mutation index must be an integer.");
    }

    if (mutation.index < 0 || mutation.index > this.layoutDocument.text.length) {
      throw new RangeError("Mutation index is out of bounds.");
    }

    if (mutation.type === "insert") {
      if (typeof mutation.text !== "string") {
        throw new Error("Insert mutation text must be a string.");
      }

      return;
    }

    if (!Number.isInteger(mutation.count)) {
      throw new RangeError("Delete mutation count must be an integer.");
    }

    if (mutation.count < 0) {
      throw new RangeError("Delete mutation count must be non-negative.");
    }

    if (mutation.index + mutation.count > this.layoutDocument.text.length) {
      throw new RangeError("Delete mutation range is out of bounds.");
    }
  }
}
