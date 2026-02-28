import type {
  LayoutParagraphInput,
  LayoutParagraphRecord,
  LayoutSettings,
  ParagraphStyle,
  TextStyle
} from "./types";
import {
  normalizeParagraphStyle,
  normalizeTextStyle
} from "./utils";

export interface EditorDocumentInput {
  id?: string;
  version?: number;
  settings: LayoutSettings;
  blocks: EditorParagraphInput[];
}

export interface EditorParagraphInput {
  id?: string;
  type?: "paragraph";
  text: string;
  paragraphStyle?: Partial<ParagraphStyle>;
  textStyle?: Partial<TextStyle>;
}

export interface EditorDocument {
  id: string;
  version: number;
  settings: LayoutSettings;
  blocks: EditorParagraphBlock[];
}

export interface EditorParagraphBlock {
  id: string;
  type: "paragraph";
  text: string;
  paragraphStyle: ParagraphStyle;
  textStyle: TextStyle;
}

const DEFAULT_DOCUMENT_ID = "document-0";

const assertPlainParagraphText = (text: string): void => {
  if (typeof text !== "string") {
    throw new Error("Paragraph text must be a string.");
  }

  if (/[\r\n]/.test(text)) {
    throw new Error("Paragraph text must not contain newline characters.");
  }
};

const normalizeParagraph = (
  paragraph: EditorParagraphInput,
  settings: LayoutSettings,
  index: number
): EditorParagraphBlock => {
  if (paragraph.type && paragraph.type !== "paragraph") {
    throw new Error(`Unsupported block type "${paragraph.type}".`);
  }

  assertPlainParagraphText(paragraph.text);

  return {
    id: paragraph.id ?? `paragraph-${index}`,
    type: "paragraph",
    text: paragraph.text,
    paragraphStyle: normalizeParagraphStyle(
      paragraph.paragraphStyle,
      settings.defaultParagraphStyle
    ),
    textStyle: normalizeTextStyle(paragraph.textStyle, settings.defaultTextStyle)
  };
};

export const normalizeEditorDocument = (
  document: EditorDocumentInput
): EditorDocument => {
  if (!document.settings) {
    throw new Error("Document settings are required.");
  }

  if (!Array.isArray(document.blocks)) {
    throw new Error("Document blocks must be an array.");
  }

  if (
    document.version !== undefined &&
    (!Number.isInteger(document.version) || document.version < 1)
  ) {
    throw new Error("Document version must be a positive integer.");
  }

  const sourceBlocks: EditorParagraphInput[] =
    document.blocks.length > 0 ? document.blocks : [{ type: "paragraph", text: "" }];

  return {
    id: document.id ?? DEFAULT_DOCUMENT_ID,
    version: document.version ?? 1,
    settings: document.settings,
    blocks: sourceBlocks.map((block, index) =>
      normalizeParagraph(block, document.settings, index)
    )
  };
};

export const toLayoutParagraphInputs = (
  document: EditorDocument
): LayoutParagraphInput[] =>
  document.blocks.map((block) => ({
    id: block.id,
    text: block.text,
    paragraphStyle: block.paragraphStyle,
    textStyle: block.textStyle
  }));

export const materializeDocumentFromParagraphRecords = (
  previousDocument: EditorDocument,
  paragraphs: LayoutParagraphRecord[],
  version = previousDocument.version
): EditorDocument => ({
  id: previousDocument.id,
  version,
  settings: previousDocument.settings,
  blocks: paragraphs.map((paragraph) => ({
    id: paragraph.id,
    type: "paragraph",
    text: paragraph.text,
    paragraphStyle: paragraph.paragraphStyle,
    textStyle: paragraph.textStyle
  }))
});
