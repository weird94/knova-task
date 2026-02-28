import { getContentHeight } from "./utils";
import type {
  LayoutSettings,
  Page,
  ParagraphSkeleton,
  ParagraphSlice
} from "./types";

export interface PaginationOptions {
  pageIndexStart?: number;
  paragraphIndexStart?: number;
}

export const paginateParagraphs = (
  paragraphs: ParagraphSkeleton[],
  settings: LayoutSettings,
  options: PaginationOptions = {}
): Page[] => {
  const pageHeight = settings.pageHeight;
  const contentHeight = getContentHeight(settings);
  const pageIndexStart = options.pageIndexStart ?? 0;
  const paragraphIndexStart = options.paragraphIndexStart ?? 0;
  const pages: Page[] = [];
  let pageIndex = pageIndexStart;
  let usedHeight = 0;
  let currentSlices: ParagraphSlice[] = [];

  const flushPage = (): void => {
    if (currentSlices.length === 0 && usedHeight === 0) {
      return;
    }

    pages.push({
      pageIndex,
      top: pageIndex * pageHeight,
      height: pageHeight,
      contentTop: settings.margins.top,
      contentHeight,
      usedHeight,
      slices: currentSlices
    });
    pageIndex += 1;
    usedHeight = 0;
    currentSlices = [];
  };

  for (let paragraphCursor = paragraphIndexStart; paragraphCursor < paragraphs.length; paragraphCursor += 1) {
    const paragraph = paragraphs[paragraphCursor];
    let lineIndex = 0;
    let sliceLineStart = 0;
    let sliceTop = usedHeight;
    let sliceHeight = 0;
    let includesSpacingBefore = false;

    while (lineIndex < paragraph.lines.length) {
      const isFirstLine = lineIndex === 0;
      const isLastLine = lineIndex === paragraph.lines.length - 1;
      const line = paragraph.lines[lineIndex];
      const leading = isFirstLine ? paragraph.spacingBefore : 0;
      const trailing = isLastLine ? paragraph.spacingAfter : 0;
      const requiredHeight = leading + line.height + trailing;

      if (usedHeight + requiredHeight > contentHeight && usedHeight > 0) {
        if (sliceHeight > 0) {
          currentSlices.push({
            paraIndex: paragraph.paraIndex,
            paragraphId: paragraph.paragraphId,
            lineStart: sliceLineStart,
            lineEnd: lineIndex,
            top: sliceTop,
            height: sliceHeight,
            includesSpacingBefore,
            includesSpacingAfter: false
          });
        }

        flushPage();
        sliceLineStart = lineIndex;
        sliceTop = 0;
        sliceHeight = 0;
        includesSpacingBefore = false;
        continue;
      }

      if (sliceHeight === 0) {
        sliceLineStart = lineIndex;
        sliceTop = usedHeight;
      }

      if (isFirstLine) {
        usedHeight += leading;
        sliceHeight += leading;
        includesSpacingBefore = leading > 0;
      }

      usedHeight += line.height;
      sliceHeight += line.height;

      if (isLastLine) {
        usedHeight += trailing;
        sliceHeight += trailing;
      }

      lineIndex += 1;

      if (isLastLine) {
        currentSlices.push({
          paraIndex: paragraph.paraIndex,
          paragraphId: paragraph.paragraphId,
          lineStart: sliceLineStart,
          lineEnd: lineIndex,
          top: sliceTop,
          height: sliceHeight,
          includesSpacingBefore,
          includesSpacingAfter: trailing > 0
        });
      }
    }
  }

  flushPage();

  return pages;
};
