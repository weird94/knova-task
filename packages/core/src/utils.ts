import type { LayoutSettings, ParagraphStyle, TextStyle } from "./types";

export const DEFAULT_PARAGRAPH_STYLE: Required<ParagraphStyle> = {
  textAlign: "left",
  lineHeight: 1.4,
  spacingBefore: 0,
  spacingAfter: 0
};

export const DEFAULT_TEXT_STYLE: Required<TextStyle> = {
  fontFamily: "sans-serif",
  fontSize: 16,
  fontWeight: 400,
  fontStyle: "normal",
  letterSpacing: 0,
  color: "#000000"
};

export const normalizeParagraphStyle = (
  style?: Partial<ParagraphStyle>,
  defaults?: ParagraphStyle
): ParagraphStyle => ({
  ...DEFAULT_PARAGRAPH_STYLE,
  ...defaults,
  ...style
});

export const normalizeTextStyle = (
  style?: Partial<TextStyle>,
  defaults?: TextStyle
): TextStyle => ({
  ...DEFAULT_TEXT_STYLE,
  ...defaults,
  ...style
});

export const serializeParagraphStyle = (style: ParagraphStyle): string =>
  `${style.textAlign ?? "left"}:${style.lineHeight ?? 1.4}:${style.spacingBefore ?? 0}:${style.spacingAfter ?? 0}`;

export const serializeTextStyle = (style: TextStyle): string =>
  `${style.fontFamily}:${style.fontSize}:${style.fontWeight ?? 400}:${style.fontStyle ?? "normal"}:${style.letterSpacing ?? 0}`;

export const getContentWidth = (settings: LayoutSettings): number =>
  settings.pageWidth - settings.margins.left - settings.margins.right;

export const getContentHeight = (settings: LayoutSettings): number =>
  settings.pageHeight - settings.margins.top - settings.margins.bottom;

export const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
