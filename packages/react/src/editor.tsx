import type {
  Editor as CoreEditor,
  EditorParagraphBlock,
  EditorState,
  EditorTransaction
} from "@knova/core";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import {
  resolveCaretPlacement,
  resolveIndexFromDocumentPoint,
  resolveIndexFromPagePoint,
  resolveVerticalCaretIndex
} from "./caret";
import { useEditor } from "./use-editor";

export interface EditorProps {
  editor: CoreEditor;
  snapshot?: EditorState;
  onChange?: (state: EditorState, transaction: EditorTransaction) => void;
  onSelectionChange?: (index: number) => void;
  debug?: boolean;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  pageGap?: number;
}

type PointerEventLike = {
  evt?: {
    preventDefault(): void;
  };
  target: {
    getStage(): {
      getPointerPosition(): { x: number; y: number } | null;
    } | null;
  };
};

const DEFAULT_STAGE_WIDTH = 720;
const DEFAULT_PAGE_GAP = 28;
const PAGE_CORNER_RADIUS = 20;
const PAGE_BACKGROUND = "#fffaf3";
const CONTENT_GUIDE = "#c8b49b";
const BODY_TEXT = "#211a13";

const getLineText = (
  line: EditorState["layoutSnapshot"]["paragraphs"][number]["lines"][number]
): string => (line.words.length > 0 ? line.words.map((word) => word.text).join("") : "\u00A0");

const isBoldWeight = (
  fontWeight: EditorParagraphBlock["textStyle"]["fontWeight"]
): boolean => {
  if (typeof fontWeight === "number") {
    return fontWeight >= 600;
  }

  if (typeof fontWeight !== "string") {
    return false;
  }

  const normalizedWeight = fontWeight.toLowerCase();
  const parsedWeight = Number.parseInt(normalizedWeight, 10);

  return normalizedWeight === "bold" || (!Number.isNaN(parsedWeight) && parsedWeight >= 600);
};

const getKonvaFontStyle = (
  textStyle: EditorParagraphBlock["textStyle"]
): "normal" | "bold" | "italic" | "bold italic" => {
  const bold = isBoldWeight(textStyle.fontWeight);
  const italic = textStyle.fontStyle === "italic";

  if (bold && italic) {
    return "bold italic";
  }

  if (bold) {
    return "bold";
  }

  if (italic) {
    return "italic";
  }

  return "normal";
};

const ParagraphSliceCanvas = ({
  paragraph,
  block,
  slice,
  contentWidth
}: {
  paragraph: EditorState["layoutSnapshot"]["paragraphs"][number];
  block: EditorParagraphBlock;
  slice: EditorState["layoutSnapshot"]["pages"][number]["slices"][number];
  contentWidth: number;
}) => {
  const lines = paragraph.lines.slice(slice.lineStart, slice.lineEnd);
  let currentLineTop = slice.includesSpacingBefore ? paragraph.spacingBefore : 0;

  return (
    <Group x={0} y={slice.top}>
      {lines.map((line, index) => {
        const lineTop = currentLineTop;
        currentLineTop += line.height;

        return (
          <Text
            key={`${slice.paraIndex}-${slice.lineStart + index}`}
            x={0}
            y={lineTop}
            width={contentWidth}
            height={line.height}
            text={getLineText(line)}
            align={block.paragraphStyle.textAlign ?? "left"}
            verticalAlign="middle"
            wrap="none"
            ellipsis={false}
            fontFamily={block.textStyle.fontFamily}
            fontSize={block.textStyle.fontSize}
            fontStyle={getKonvaFontStyle(block.textStyle)}
            letterSpacing={block.textStyle.letterSpacing ?? 0}
            fill={block.textStyle.color ?? BODY_TEXT}
            perfectDrawEnabled={false}
            listening={false}
          />
        );
      })}
    </Group>
  );
};

const useMeasuredWidth = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateWidth = () => {
      setWidth(Math.round(node.getBoundingClientRect().width));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return {
    containerRef,
    width
  };
};

export const Editor = ({
  editor,
  snapshot,
  onChange,
  onSelectionChange,
  debug = false,
  className,
  style,
  autoFocus = false,
  pageGap = DEFAULT_PAGE_GAP
}: EditorProps) => {
  const internalSnapshot = useEditor(editor);
  const currentSnapshot = snapshot ?? internalSnapshot;
  const { document, layoutSnapshot, text, caretIndex } = currentSnapshot;
  const { settings, blocks } = document;
  const { containerRef, width } = useMeasuredWidth();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preferredCaretXRef = useRef<number | null>(null);
  const [focusRequestToken, setFocusRequestToken] = useState(autoFocus ? 1 : 0);
  const [focused, setFocused] = useState(autoFocus);
  const [caretVisible, setCaretVisible] = useState(autoFocus);
  const stageWidth = Math.max(width, settings.pageWidth, DEFAULT_STAGE_WIDTH);
  const pageX = Math.max(0, (stageWidth - settings.pageWidth) / 2);
  const contentWidth = settings.pageWidth - settings.margins.left - settings.margins.right;
  const contentHeight = settings.pageHeight - settings.margins.top - settings.margins.bottom;
  const stageHeight =
    layoutSnapshot.pages.reduce(
      (total, _page, pageIndex) =>
        total +
        settings.pageHeight +
        (pageIndex === layoutSnapshot.pages.length - 1 ? 0 : pageGap),
      0
    ) || settings.pageHeight;
  const caretPlacement = useMemo(
    () => resolveCaretPlacement(layoutSnapshot, blocks, settings, pageGap, caretIndex),
    [blocks, caretIndex, layoutSnapshot, pageGap, settings]
  );

  const logDebug = (event: string, payload: Record<string, unknown>) => {
    if (!debug) {
      return;
    }

    console.log(`[knova/react][Editor][${event}]`, payload);
  };

  useEffect(() => {
    onSelectionChange?.(caretIndex);
  }, [caretIndex, onSelectionChange]);

  useEffect(() => {
    logDebug("caret-change", {
      caretIndex,
      textLength: text.length,
      caretPlacement
    });
  }, [caretIndex, caretPlacement, text.length]);

  useEffect(() => {
    if (!focused) {
      setCaretVisible(false);
      return;
    }

    setCaretVisible(true);

    const timer = window.setInterval(() => {
      setCaretVisible((visible) => !visible);
    }, 530);

    return () => {
      window.clearInterval(timer);
    };
  }, [focused, caretIndex]);

  useLayoutEffect(() => {
    if (focusRequestToken === 0) {
      return;
    }

    textareaRef.current?.focus({ preventScroll: true });
    logDebug("focus-textarea", {
      focusRequestToken,
      isActiveElement: globalThis.document?.activeElement === textareaRef.current
    });
  }, [focusRequestToken]);

  const requestTextareaFocus = () => {
    setFocusRequestToken((token) => token + 1);
    setCaretVisible(true);
  };

  const applyTransaction = (
    transaction: EditorTransaction,
    preservePreferredX = false
  ) => {
    if (!transaction.changed) {
      return;
    }

    if (!preservePreferredX) {
      preferredCaretXRef.current = null;
    }

    setCaretVisible(true);
    logDebug("apply-transaction", {
      mutation: transaction.mutation,
      nextCaretIndex: transaction.state.caretIndex,
      nextTextLength: transaction.state.text.length
    });
    onChange?.(transaction.state, transaction);
  };

  const handleInsert = (value: string) => {
    const normalizedValue = value.replace(/\r\n?/g, "\n");

    if (normalizedValue === "") {
      return;
    }

    logDebug("insert-request", {
      rawValue: value,
      normalizedValue,
      caretIndex,
      activeElementIsTextarea: globalThis.document?.activeElement === textareaRef.current,
      textBefore: text.slice(Math.max(0, caretIndex - 12), Math.min(text.length, caretIndex + 12))
    });

    const transaction = editor.applyMutation({
      type: "insert",
      index: caretIndex,
      text: value
    });

    applyTransaction(transaction);
  };

  const handleDeleteBackward = () => {
    if (caretIndex === 0) {
      return;
    }

    logDebug("delete-backward-request", {
      caretIndex,
      textBefore: text.slice(Math.max(0, caretIndex - 12), Math.min(text.length, caretIndex + 12))
    });

    const transaction = editor.applyMutation({
      type: "delete",
      index: caretIndex - 1,
      count: 1
    });

    applyTransaction(transaction);
  };

  const handleDeleteForward = () => {
    if (caretIndex >= text.length) {
      return;
    }

    logDebug("delete-forward-request", {
      caretIndex,
      textBefore: text.slice(Math.max(0, caretIndex - 12), Math.min(text.length, caretIndex + 12))
    });

    const transaction = editor.applyMutation({
      type: "delete",
      index: caretIndex,
      count: 1
    });

    applyTransaction(transaction);
  };

  const moveCaretTo = (nextIndex: number, preservePreferredX = false) => {
    if (!preservePreferredX) {
      preferredCaretXRef.current = null;
    }

    logDebug("move-caret", {
      from: caretIndex,
      to: nextIndex,
      preservePreferredX
    });

    editor.setCaretIndex(nextIndex);
    setCaretVisible(true);
  };

  const handleArrowVertical = (direction: -1 | 1) => {
    const nextIndex = resolveVerticalCaretIndex({
      snapshot: layoutSnapshot,
      blocks,
      settings,
      pageGap,
      index: caretIndex,
      direction,
      desiredX: preferredCaretXRef.current ?? caretPlacement?.x
    });

    if (preferredCaretXRef.current === null && caretPlacement) {
      preferredCaretXRef.current = caretPlacement.x;
    }

    moveCaretTo(nextIndex, true);
  };

  const handlePagePointer = (
    pageIndex: number,
    pageTop: number,
    event: PointerEventLike
  ) => {
    event.evt?.preventDefault();

    const pointer = event.target.getStage()?.getPointerPosition();

    if (!pointer) {
      return;
    }

    const resolvedIndex = resolveIndexFromPagePoint({
      localX: pointer.x - pageX,
      localY: pointer.y - pageTop,
      pageIndex,
      settings,
      snapshot: layoutSnapshot,
      blocks
    });

    logDebug("page-pointer", {
      pageIndex,
      pointer,
      pageTop,
      pageX,
      localX: pointer.x - pageX,
      localY: pointer.y - pageTop,
      resolvedIndex,
      previousCaretIndex: caretIndex
    });

    moveCaretTo(resolvedIndex);
    requestTextareaFocus();
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        overflow: "auto",
        ...style
      }}
    >
      <Stage width={stageWidth} height={stageHeight}>
        <Layer>
          {layoutSnapshot.pages.map((page, pageIndex) => {
            const top = pageIndex * (settings.pageHeight + pageGap);

            return (
              <Group key={page.pageIndex}>
                <Rect
                  data-testid={`editor-page-${page.pageIndex}`}
                  x={pageX}
                  y={top}
                  width={settings.pageWidth}
                  height={settings.pageHeight}
                  cornerRadius={PAGE_CORNER_RADIUS}
                  fill={PAGE_BACKGROUND}
                  shadowColor="rgba(61, 39, 18, 0.16)"
                  shadowBlur={22}
                  shadowOffsetY={12}
                  onMouseDown={(event: PointerEventLike) => {
                    handlePagePointer(pageIndex, top, event);
                  }}
                  onTap={(event: PointerEventLike) => {
                    handlePagePointer(pageIndex, top, event);
                  }}
                />

                <Rect
                  x={pageX + settings.margins.left}
                  y={top + settings.margins.top}
                  width={contentWidth}
                  height={contentHeight}
                  cornerRadius={12}
                  stroke={CONTENT_GUIDE}
                  strokeWidth={1}
                  dash={[7, 9]}
                  opacity={0.7}
                  listening={false}
                />

                <Group x={pageX + settings.margins.left} y={top + settings.margins.top}>
                  {page.slices.map((slice, sliceIndex) => (
                    <ParagraphSliceCanvas
                      key={`${page.pageIndex}-${slice.paraIndex}-${slice.lineStart}-${sliceIndex}`}
                      paragraph={layoutSnapshot.paragraphs[slice.paraIndex]}
                      block={blocks[slice.paraIndex]}
                      slice={slice}
                      contentWidth={contentWidth}
                    />
                  ))}
                </Group>

                {focused && caretVisible && caretPlacement?.pageIndex === page.pageIndex ? (
                  <Rect
                    data-testid="editor-caret"
                    x={pageX + settings.margins.left + caretPlacement.x}
                    y={caretPlacement.y}
                    width={2}
                    height={caretPlacement.height}
                    fill={BODY_TEXT}
                    listening={false}
                  />
                ) : null}
              </Group>
            );
          })}
        </Layer>
      </Stage>

      <textarea
        ref={textareaRef}
        data-testid="hidden-editor-textarea"
        aria-hidden="true"
        autoCapitalize="off"
        autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          tabIndex={0}
          rows={1}
        onFocus={() => {
          setFocused(true);
          setCaretVisible(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onInput={(event) => {
          const value = event.currentTarget.value;

          logDebug("textarea-input", {
            value,
            selectionStart: event.currentTarget.selectionStart,
            selectionEnd: event.currentTarget.selectionEnd
          });

          event.currentTarget.value = "";

          handleInsert(value);
        }}
        onPaste={(event) => {
          const value = event.clipboardData.getData("text");

          if (value === "") {
            return;
          }

          event.preventDefault();
          handleInsert(value);
        }}
        onKeyDown={(event) => {
          logDebug("keydown", {
            key: event.key,
            caretIndex,
            activeElementIsTextarea: globalThis.document?.activeElement === textareaRef.current
          });

          switch (event.key) {
            case "ArrowLeft":
              event.preventDefault();
              moveCaretTo(caretIndex - 1);
              return;
            case "ArrowRight":
              event.preventDefault();
              moveCaretTo(caretIndex + 1);
              return;
            case "ArrowUp":
              event.preventDefault();
              handleArrowVertical(-1);
              return;
            case "ArrowDown":
              event.preventDefault();
              handleArrowVertical(1);
              return;
            case "Backspace":
              event.preventDefault();
              handleDeleteBackward();
              return;
            case "Delete":
              event.preventDefault();
              handleDeleteForward();
              return;
            case "Home": {
              event.preventDefault();

              const nextIndex = resolveIndexFromDocumentPoint({
                localX: settings.margins.left,
                documentY: caretPlacement?.y ?? 0,
                settings,
                snapshot: layoutSnapshot,
                blocks,
                pageGap
              });

              moveCaretTo(nextIndex, true);
              return;
            }
            case "End": {
              event.preventDefault();

              const nextIndex = resolveIndexFromDocumentPoint({
                localX: settings.pageWidth,
                documentY:
                  (caretPlacement?.y ?? 0) + (caretPlacement?.height ?? settings.defaultTextStyle.fontSize),
                settings,
                snapshot: layoutSnapshot,
                blocks,
                pageGap
              });

              moveCaretTo(nextIndex, true);
              return;
            }
            default:
              preferredCaretXRef.current = null;
          }
        }}
        style={{
          position: "absolute",
          left:
            caretPlacement === null
              ? -9999
              : pageX + settings.margins.left + caretPlacement.x,
          top: caretPlacement?.y ?? 0,
          width: 1,
          height: Math.max(caretPlacement?.height ?? settings.defaultTextStyle.fontSize, 1),
          padding: 0,
          margin: 0,
          border: 0,
          outline: "none",
          resize: "none",
          overflow: "hidden",
          opacity: 0,
          color: "transparent",
          background: "transparent",
          pointerEvents: "none",
          zIndex: 0
        }}
      />
    </div>
  );
};
