export type FontStyle = "normal" | "italic";

export type TextAlign = "left" | "center" | "right" | "justify";

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | string;
  fontStyle?: FontStyle;
  letterSpacing?: number;
  color?: string;
}

export interface ParagraphStyle {
  textAlign?: TextAlign;
  lineHeight?: number;
  spacingBefore?: number;
  spacingAfter?: number;
}

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutSettings {
  pageWidth: number;
  pageHeight: number;
  margins: PageMargins;
  defaultTextStyle: TextStyle;
  defaultParagraphStyle: ParagraphStyle;
}

export interface LayoutParagraphInput {
  id?: string;
  text: string;
  paragraphStyle?: Partial<ParagraphStyle>;
  textStyle?: Partial<TextStyle>;
}

export interface LayoutParagraphRecord {
  id: string;
  index: number;
  start: number;
  end: number;
  text: string;
  paragraphStyle: ParagraphStyle;
  textStyle: TextStyle;
  revision: number;
}

export interface TextEdit {
  position: number;
  deleteCount: number;
  insertText: string;
}

export type EditKind = "local" | "structural";

export interface EditResult {
  kind: EditKind;
  dirtyFromParagraph: number;
  affectedParagraph: number;
  version: number;
  delta: number;
}

export interface GlyphMetrics {
  width: number;
  ascent: number;
  descent: number;
}

export interface Glyph {
  text: string;
  width: number;
  sourceOffset: number;
  ascent: number;
  descent: number;
}

export interface Word {
  text: string;
  contentText: string;
  trailingWhitespaceText: string;
  glyphs: Glyph[];
  width: number;
  contentWidth: number;
  trailingWhitespaceWidth: number;
  breakAfter: boolean;
  sourceStart: number;
  sourceEnd: number;
}

export interface Line {
  words: Word[];
  width: number;
  contentWidth: number;
  trailingWhitespaceWidth: number;
  height: number;
  ascent: number;
  descent: number;
  baseline: number;
  sourceStart: number;
  sourceEnd: number;
}

export interface ParagraphSkeleton {
  paraIndex: number;
  paragraphId: string;
  sourceStart: number;
  sourceEnd: number;
  text: string;
  lines: Line[];
  contentHeight: number;
  spacingBefore: number;
  spacingAfter: number;
  totalHeight: number;
  lineHeight: number;
  layoutKey: string;
  revision: number;
  pageWidth: number;
}

export interface ParagraphSlice {
  paraIndex: number;
  paragraphId: string;
  lineStart: number;
  lineEnd: number;
  top: number;
  height: number;
  includesSpacingBefore: boolean;
  includesSpacingAfter: boolean;
}

export interface Page {
  pageIndex: number;
  top: number;
  height: number;
  contentTop: number;
  contentHeight: number;
  usedHeight: number;
  slices: ParagraphSlice[];
}

export interface LayoutStats {
  reflowedParagraphs: number[];
  reusedParagraphs: number[];
  repaginatedFromPage: number;
  reusedPages: number;
}

export interface LayoutSnapshot {
  version: number;
  fontEpoch: number;
  paragraphs: ParagraphSkeleton[];
  pages: Page[];
  stats: LayoutStats;
}
