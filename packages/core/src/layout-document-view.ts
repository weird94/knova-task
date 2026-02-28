import {
  normalizeParagraphStyle,
  normalizeTextStyle
} from "./utils";
import type {
  EditResult,
  LayoutParagraphInput,
  LayoutParagraphRecord,
  LayoutSettings,
  ParagraphStyle,
  TextEdit,
  TextStyle
} from "./types";

type ParagraphState = {
  id: string;
  paragraphStyle: ParagraphStyle;
  textStyle: TextStyle;
  revision: number;
};

const getNewlineOffsets = (text: string): number[] => {
  const offsets: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index);
    }
  }

  return offsets;
};

const getInsertedNewlineOffsets = (text: string, start: number): number[] => {
  const offsets: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(start + index);
    }
  }

  return offsets;
};

const countNewlines = (text: string): number => getNewlineOffsets(text).length;

export class LayoutDocumentView {
  private textBuffer: string;
  private paragraphBreakOffsetsInternal: number[];
  private paragraphStates: ParagraphState[];
  private versionInternal = 1;
  private nextParagraphId = 0;

  constructor(
    paragraphs: LayoutParagraphInput[],
    private readonly settings: LayoutSettings
  ) {
    const normalizedParagraphs = paragraphs.length > 0 ? paragraphs : [{ text: "" }];

    this.textBuffer = normalizedParagraphs.map((paragraph) => paragraph.text).join("\n");
    this.paragraphBreakOffsetsInternal = getNewlineOffsets(this.textBuffer);
    this.paragraphStates = normalizedParagraphs.map((paragraph, index) => ({
      id: paragraph.id ?? this.createParagraphId(index),
      paragraphStyle: normalizeParagraphStyle(
        paragraph.paragraphStyle,
        settings.defaultParagraphStyle
      ),
      textStyle: normalizeTextStyle(paragraph.textStyle, settings.defaultTextStyle),
      revision: 1
    }));
    this.nextParagraphId = this.paragraphStates.length;
  }

  get version(): number {
    return this.versionInternal;
  }

  get text(): string {
    return this.textBuffer;
  }

  get paragraphBreakOffsets(): number[] {
    return [...this.paragraphBreakOffsetsInternal];
  }

  getParagraphCount(): number {
    return this.paragraphStates.length;
  }

  getParagraph(index: number): LayoutParagraphRecord {
    const state = this.paragraphStates[index];

    if (!state) {
      throw new Error(`Paragraph index ${index} is out of bounds.`);
    }

    const start = index === 0 ? 0 : this.paragraphBreakOffsetsInternal[index - 1] + 1;
    const end =
      index >= this.paragraphBreakOffsetsInternal.length
        ? this.textBuffer.length
        : this.paragraphBreakOffsetsInternal[index];

    return {
      id: state.id,
      index,
      start,
      end,
      text: this.textBuffer.slice(start, end),
      paragraphStyle: state.paragraphStyle,
      textStyle: state.textStyle,
      revision: state.revision
    };
  }

  getParagraphs(): LayoutParagraphRecord[] {
    return Array.from({ length: this.getParagraphCount() }, (_, index) =>
      this.getParagraph(index)
    );
  }

  findParagraphIndex(position: number): number {
    const clampedPosition = Math.max(0, Math.min(position, this.textBuffer.length));
    let low = 0;
    let high = this.paragraphBreakOffsetsInternal.length;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);

      if (this.paragraphBreakOffsetsInternal[middle] < clampedPosition) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  }

  applyEdit(edit: TextEdit): EditResult {
    const { position, deleteCount, insertText } = edit;

    if (position < 0 || position > this.textBuffer.length) {
      throw new Error(`Edit position ${position} is out of bounds.`);
    }

    if (deleteCount < 0 || position + deleteCount > this.textBuffer.length) {
      throw new Error(`Edit deleteCount ${deleteCount} is invalid.`);
    }

    const dirtyFromParagraph = this.findParagraphIndex(position);
    const deletedText = this.textBuffer.slice(position, position + deleteCount);
    const deletedBreakCount = countNewlines(deletedText);
    const insertedBreakOffsets = getInsertedNewlineOffsets(insertText, position);
    const insertedBreakCount = insertedBreakOffsets.length;
    const delta = insertText.length - deleteCount;

    this.textBuffer =
      this.textBuffer.slice(0, position) +
      insertText +
      this.textBuffer.slice(position + deleteCount);

    const shiftedBreakOffsets: number[] = [];

    for (const offset of this.paragraphBreakOffsetsInternal) {
      if (offset < position) {
        shiftedBreakOffsets.push(offset);
        continue;
      }

      if (offset < position + deleteCount) {
        continue;
      }

      shiftedBreakOffsets.push(offset + delta);
    }

    this.paragraphBreakOffsetsInternal = [...shiftedBreakOffsets, ...insertedBreakOffsets].sort(
      (left, right) => left - right
    );

    this.versionInternal += 1;

    const structural = deletedBreakCount > 0 || insertedBreakCount > 0;

    if (!structural) {
      const state = this.paragraphStates[dirtyFromParagraph];

      state.revision += 1;

      return {
        kind: "local",
        dirtyFromParagraph,
        affectedParagraph: dirtyFromParagraph,
        version: this.versionInternal,
        delta
      };
    }

    const baseState =
      this.paragraphStates[dirtyFromParagraph] ??
      ({
        id: this.createParagraphId(this.nextParagraphId),
        paragraphStyle: normalizeParagraphStyle(undefined, this.settings.defaultParagraphStyle),
        textStyle: normalizeTextStyle(undefined, this.settings.defaultTextStyle),
        revision: 1
      } satisfies ParagraphState);
    const prefix = this.paragraphStates.slice(0, dirtyFromParagraph);
    const suffix = this.paragraphStates.slice(dirtyFromParagraph + deletedBreakCount + 1);
    const replacementCount = insertedBreakCount + 1;
    const replacement: ParagraphState[] = Array.from(
      { length: replacementCount },
      (_, index) => ({
        id: index === 0 ? baseState.id : this.createParagraphId(this.nextParagraphId + index - 1),
        paragraphStyle: { ...baseState.paragraphStyle },
        textStyle: { ...baseState.textStyle },
        revision: this.versionInternal
      })
    );

    this.nextParagraphId += Math.max(0, replacementCount - 1);
    this.paragraphStates = [...prefix, ...replacement, ...suffix];

    return {
      kind: "structural",
      dirtyFromParagraph,
      affectedParagraph: dirtyFromParagraph,
      version: this.versionInternal,
      delta
    };
  }

  updateParagraphStyles(
    paragraphIndex: number,
    patch: {
      paragraphStyle?: Partial<ParagraphStyle>;
      textStyle?: Partial<TextStyle>;
    }
  ): void {
    const state = this.paragraphStates[paragraphIndex];

    if (!state) {
      throw new Error(`Paragraph index ${paragraphIndex} is out of bounds.`);
    }

    if (patch.paragraphStyle) {
      state.paragraphStyle = normalizeParagraphStyle(
        patch.paragraphStyle,
        state.paragraphStyle
      );
    }

    if (patch.textStyle) {
      state.textStyle = normalizeTextStyle(patch.textStyle, state.textStyle);
    }

    state.revision += 1;
    this.versionInternal += 1;
  }

  private createParagraphId(seed: number): string {
    return `paragraph-${seed}`;
  }
}
