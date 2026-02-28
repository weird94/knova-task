import type {
  EditorParagraphBlock,
  LayoutSettings,
  LayoutSnapshot,
  Line,
  ParagraphSkeleton,
  ParagraphStyle,
  TextStyle
} from "@knova/core";

export interface CaretPlacement {
  index: number;
  pageIndex: number;
  x: number;
  y: number;
  height: number;
}

type LineBox = {
  pageIndex: number;
  paragraph: ParagraphSkeleton;
  block: EditorParagraphBlock;
  line: Line;
  top: number;
  height: number;
  startIndex: number;
  endIndex: number;
};

const getContentWidth = (settings: LayoutSettings): number =>
  settings.pageWidth - settings.margins.left - settings.margins.right;

const getContentHeight = (settings: LayoutSettings): number =>
  settings.pageHeight - settings.margins.top - settings.margins.bottom;

const getLineStartIndex = (line: Line, paragraph: ParagraphSkeleton): number =>
  line.words.length > 0 ? line.sourceStart : paragraph.sourceStart;

const getLineEndIndex = (line: Line, paragraph: ParagraphSkeleton): number =>
  line.words.length > 0 ? line.sourceEnd : paragraph.sourceStart;

const getAlignmentOffset = (
  line: Line,
  paragraphStyle: ParagraphStyle,
  contentWidth: number
): number => {
  if (paragraphStyle.textAlign === "right") {
    return Math.max(0, contentWidth - line.contentWidth);
  }

  if (paragraphStyle.textAlign === "center") {
    return Math.max(0, (contentWidth - line.contentWidth) / 2);
  }

  return 0;
};

const getLineEndX = (line: Line, letterSpacing: number): number => {
  let x = 0;

  for (const word of line.words) {
    for (let glyphIndex = 0; glyphIndex < word.glyphs.length; glyphIndex += 1) {
      x += word.glyphs[glyphIndex].width;

      if (glyphIndex < word.glyphs.length - 1) {
        x += letterSpacing;
      }
    }
  }

  return x;
};

const getCaretXForIndex = (
  line: Line,
  paragraph: ParagraphSkeleton,
  textStyle: TextStyle,
  index: number
): number => {
  const lineStart = getLineStartIndex(line, paragraph);
  const letterSpacing = textStyle.letterSpacing ?? 0;

  if (index <= lineStart || line.words.length === 0) {
    return 0;
  }

  let x = 0;

  for (const word of line.words) {
    for (let glyphIndex = 0; glyphIndex < word.glyphs.length; glyphIndex += 1) {
      const glyph = word.glyphs[glyphIndex];

      if (index <= glyph.sourceOffset) {
        return x;
      }

      x += glyph.width;

      if (index === glyph.sourceOffset + 1) {
        return x;
      }

      if (glyphIndex < word.glyphs.length - 1) {
        x += letterSpacing;
      }
    }
  }

  return x;
};

const getNearestIndexOnLine = (
  line: Line,
  paragraph: ParagraphSkeleton,
  textStyle: TextStyle,
  x: number
): number => {
  const lineStart = getLineStartIndex(line, paragraph);
  const lineEnd = getLineEndIndex(line, paragraph);
  const letterSpacing = textStyle.letterSpacing ?? 0;
  const lineEndX = getLineEndX(line, letterSpacing);

  if (x <= 0 || line.words.length === 0) {
    return lineStart;
  }

  if (x >= lineEndX) {
    return lineEnd;
  }

  let bestIndex = lineStart;
  let bestDistance = Math.abs(x);
  let currentX = 0;

  for (const word of line.words) {
    for (let glyphIndex = 0; glyphIndex < word.glyphs.length; glyphIndex += 1) {
      const glyph = word.glyphs[glyphIndex];

      currentX += glyph.width;

      const boundaryIndex = glyph.sourceOffset + 1;
      const distance = Math.abs(x - currentX);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = boundaryIndex;
      }

      if (glyphIndex < word.glyphs.length - 1) {
        currentX += letterSpacing;
      }
    }
  }

  return bestIndex;
};

export const getPageTop = (
  pageIndex: number,
  settings: LayoutSettings,
  pageGap: number
): number => pageIndex * (settings.pageHeight + pageGap);

const buildLineBoxes = (
  snapshot: LayoutSnapshot,
  blocks: EditorParagraphBlock[]
): LineBox[] =>
  snapshot.pages.flatMap((page) =>
    page.slices.flatMap((slice) => {
      const paragraph = snapshot.paragraphs[slice.paraIndex];
      const block = blocks[slice.paraIndex];
      const lines = paragraph.lines.slice(slice.lineStart, slice.lineEnd);
      let currentTop = slice.top + (slice.includesSpacingBefore ? paragraph.spacingBefore : 0);

      return lines.map((line) => {
        const top = currentTop;
        currentTop += line.height;

        return {
          pageIndex: page.pageIndex,
          paragraph,
          block,
          line,
          top,
          height: line.height,
          startIndex: getLineStartIndex(line, paragraph),
          endIndex: getLineEndIndex(line, paragraph)
        };
      });
    })
  );

export const resolveCaretPlacement = (
  snapshot: LayoutSnapshot,
  blocks: EditorParagraphBlock[],
  settings: LayoutSettings,
  pageGap: number,
  index: number
): CaretPlacement | null => {
  const lineBoxes = buildLineBoxes(snapshot, blocks);

  if (lineBoxes.length === 0) {
    return null;
  }

  const clampedIndex = Math.max(
    0,
    Math.min(index, snapshot.paragraphs[snapshot.paragraphs.length - 1]?.sourceEnd ?? 0)
  );
  let targetLine = lineBoxes.find(
    (lineBox) => clampedIndex >= lineBox.startIndex && clampedIndex <= lineBox.endIndex
  );

  if (!targetLine) {
    targetLine =
      clampedIndex <= lineBoxes[0].startIndex
        ? lineBoxes[0]
        : lineBoxes[lineBoxes.length - 1];
  }

  const contentWidth = getContentWidth(settings);
  const alignOffset = getAlignmentOffset(
    targetLine.line,
    targetLine.block.paragraphStyle,
    contentWidth
  );
  const pageTop = getPageTop(targetLine.pageIndex, settings, pageGap);

  return {
    index: clampedIndex,
    pageIndex: targetLine.pageIndex,
    x:
      alignOffset +
      getCaretXForIndex(
        targetLine.line,
        targetLine.paragraph,
        targetLine.block.textStyle,
        clampedIndex
      ),
    y: pageTop + settings.margins.top + targetLine.top,
    height: targetLine.height
  };
};

export const resolveIndexFromPagePoint = ({
  localX,
  localY,
  pageIndex,
  settings,
  snapshot,
  blocks
}: {
  localX: number;
  localY: number;
  pageIndex: number;
  settings: LayoutSettings;
  snapshot: LayoutSnapshot;
  blocks: EditorParagraphBlock[];
}): number => {
  const page = snapshot.pages[pageIndex];

  if (!page) {
    return 0;
  }

  const contentWidth = getContentWidth(settings);
  const contentHeight = getContentHeight(settings);
  const contentX = Math.min(Math.max(localX - settings.margins.left, 0), contentWidth);
  const contentY = Math.min(Math.max(localY - settings.margins.top, 0), contentHeight);
  const lineBoxes = buildLineBoxes(snapshot, blocks).filter(
    (lineBox) => lineBox.pageIndex === pageIndex
  );

  if (lineBoxes.length === 0) {
    return 0;
  }

  let targetLine = lineBoxes[0];

  if (contentY <= lineBoxes[0].top) {
    targetLine = lineBoxes[0];
  } else {
    const lastLine = lineBoxes[lineBoxes.length - 1];

    if (contentY >= lastLine.top + lastLine.height) {
      targetLine = lastLine;
    } else {
      for (let index = 0; index < lineBoxes.length; index += 1) {
        const current = lineBoxes[index];
        const currentBottom = current.top + current.height;
        const next = lineBoxes[index + 1];

        if (contentY >= current.top && contentY <= currentBottom) {
          targetLine = current;
          break;
        }

        if (next && contentY > currentBottom && contentY < next.top) {
          targetLine =
            contentY - currentBottom <= next.top - contentY ? current : next;
          break;
        }
      }
    }
  }

  const alignOffset = getAlignmentOffset(
    targetLine.line,
    targetLine.block.paragraphStyle,
    contentWidth
  );

  return getNearestIndexOnLine(
    targetLine.line,
    targetLine.paragraph,
    targetLine.block.textStyle,
    contentX - alignOffset
  );
};

export const resolveIndexFromDocumentPoint = ({
  localX,
  documentY,
  settings,
  snapshot,
  blocks,
  pageGap
}: {
  localX: number;
  documentY: number;
  settings: LayoutSettings;
  snapshot: LayoutSnapshot;
  blocks: EditorParagraphBlock[];
  pageGap: number;
}): number => {
  if (snapshot.pages.length === 0) {
    return 0;
  }

  const pageSpan = settings.pageHeight + pageGap;
  const maxY = getPageTop(snapshot.pages.length - 1, settings, pageGap) + settings.pageHeight;
  const clampedY = Math.min(Math.max(documentY, 0), maxY);
  const pageIndex = Math.min(
    Math.max(Math.floor(clampedY / pageSpan), 0),
    snapshot.pages.length - 1
  );

  return resolveIndexFromPagePoint({
    localX,
    localY: clampedY - getPageTop(pageIndex, settings, pageGap),
    pageIndex,
    settings,
    snapshot,
    blocks
  });
};

export const resolveVerticalCaretIndex = ({
  snapshot,
  blocks,
  settings,
  pageGap,
  index,
  direction,
  desiredX
}: {
  snapshot: LayoutSnapshot;
  blocks: EditorParagraphBlock[];
  settings: LayoutSettings;
  pageGap: number;
  index: number;
  direction: -1 | 1;
  desiredX?: number;
}): number => {
  const placement = resolveCaretPlacement(snapshot, blocks, settings, pageGap, index);

  if (!placement) {
    return index;
  }

  return resolveIndexFromDocumentPoint({
    localX: settings.margins.left + (desiredX ?? placement.x),
    documentY: direction < 0 ? placement.y - 1 : placement.y + placement.height + 1,
    settings,
    snapshot,
    blocks,
    pageGap
  });
};
