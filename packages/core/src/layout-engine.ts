import { FontMeasureCache } from "./font-measure-cache";
import { LayoutDocumentView } from "./layout-document-view";
import {
  createParagraphLayoutKey,
  layoutParagraph,
  rebaseParagraphSkeleton
} from "./paragraph-layout";
import { paginateParagraphs } from "./paginator";
import { getContentWidth } from "./utils";
import type {
  EditResult,
  LayoutSettings,
  LayoutSnapshot,
  Page,
  ParagraphSkeleton,
  TextEdit
} from "./types";

type Scheduler = (callback: () => void) => void;

export interface LayoutEngineOptions {
  document: LayoutDocumentView;
  settings: LayoutSettings;
  fontCache: FontMeasureCache;
  scheduler?: Scheduler;
}

const defaultScheduler: Scheduler = (callback) => {
  if ("requestAnimationFrame" in globalThis && typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }

  setTimeout(callback, 0);
};

export class LayoutEngine {
  private paragraphCache: ParagraphSkeleton[] = [];
  private pages: Page[] = [];
  private dirtyFromParagraph = 0;
  private scheduled = false;
  private lastSnapshot: LayoutSnapshot | null = null;

  readonly document: LayoutDocumentView;
  readonly settings: LayoutSettings;
  readonly fontCache: FontMeasureCache;
  private readonly scheduler: Scheduler;

  constructor(options: LayoutEngineOptions) {
    this.document = options.document;
    this.settings = options.settings;
    this.fontCache = options.fontCache;
    this.scheduler = options.scheduler ?? defaultScheduler;
  }

  applyEdit(edit: TextEdit): EditResult {
    const result = this.document.applyEdit(edit);
    this.markDirty(result.dirtyFromParagraph);

    return result;
  }

  markDirty(paragraphIndex: number): void {
    this.dirtyFromParagraph = Math.min(this.dirtyFromParagraph, paragraphIndex);
  }

  invalidateAll(): void {
    this.dirtyFromParagraph = 0;
    this.paragraphCache = [];
    this.pages = [];
  }

  scheduleLayout(callback: (snapshot: LayoutSnapshot) => void): boolean {
    if (this.scheduled) {
      return false;
    }

    this.scheduled = true;
    this.scheduler(() => {
      this.scheduled = false;
      callback(this.layout());
    });

    return true;
  }

  layout(): LayoutSnapshot {
    const paragraphCount = this.document.getParagraphCount();
    const contentWidth = getContentWidth(this.settings);
    const paragraphs = this.document.getParagraphs();
    const nextParagraphCache = this.paragraphCache.slice(0, paragraphCount);
    const reflowedParagraphs: number[] = [];
    const reusedParagraphs: number[] = [];

    for (let index = 0; index < paragraphCount; index += 1) {
      const paragraph = paragraphs[index];
      const expectedLayoutKey = createParagraphLayoutKey(
        paragraph.revision,
        contentWidth,
        this.fontCache.fontEpoch,
        paragraph.paragraphStyle,
        paragraph.textStyle
      );
      const cached = nextParagraphCache[index];

      if (index < this.dirtyFromParagraph && cached?.layoutKey === expectedLayoutKey) {
        reusedParagraphs.push(index);
        continue;
      }

      if (
        cached &&
        cached.layoutKey === expectedLayoutKey &&
        cached.text === paragraph.text
      ) {
        nextParagraphCache[index] = rebaseParagraphSkeleton(
          cached,
          paragraph.start,
          paragraph.end
        );
        reusedParagraphs.push(index);
        continue;
      }

      nextParagraphCache[index] = layoutParagraph(
        {
          paragraphId: paragraph.id,
          paraIndex: paragraph.index,
          text: paragraph.text,
          sourceStart: paragraph.start,
          sourceEnd: paragraph.end,
          paragraphStyle: paragraph.paragraphStyle,
          textStyle: paragraph.textStyle,
          revision: paragraph.revision,
          pageWidth: contentWidth,
          fontEpoch: this.fontCache.fontEpoch
        },
        this.fontCache
      );
      reflowedParagraphs.push(index);
    }

    const repaginatedFromPage = this.findDirtyPageStart(nextParagraphCache, this.dirtyFromParagraph);
    const reusedPages = Math.max(repaginatedFromPage, 0);
    const pagePrefix = this.pages.slice(0, repaginatedFromPage);
    const repaginateFromParagraph =
      repaginatedFromPage < this.pages.length
        ? this.pages[repaginatedFromPage].slices[0]?.paraIndex ?? this.dirtyFromParagraph
        : this.dirtyFromParagraph;
    const nextPages = [
      ...pagePrefix,
      ...paginateParagraphs(nextParagraphCache, this.settings, {
        pageIndexStart: repaginatedFromPage,
        paragraphIndexStart: repaginateFromParagraph
      })
    ];

    this.paragraphCache = nextParagraphCache;
    this.pages = nextPages;
    this.dirtyFromParagraph = Number.POSITIVE_INFINITY;

    const snapshot: LayoutSnapshot = {
      version: this.document.version,
      fontEpoch: this.fontCache.fontEpoch,
      paragraphs: [...this.paragraphCache],
      pages: [...this.pages],
      stats: {
        reflowedParagraphs,
        reusedParagraphs,
        repaginatedFromPage,
        reusedPages
      }
    };

    this.lastSnapshot = snapshot;

    return snapshot;
  }

  getSnapshot(): LayoutSnapshot | null {
    return this.lastSnapshot;
  }

  private findDirtyPageStart(
    paragraphs: ParagraphSkeleton[],
    dirtyFromParagraph: number
  ): number {
    if (this.pages.length === 0 || dirtyFromParagraph <= 0) {
      return 0;
    }

    for (let pageIndex = 0; pageIndex < this.pages.length; pageIndex += 1) {
      const page = this.pages[pageIndex];
      const firstParagraphIndex = page.slices[0]?.paraIndex;
      const lastParagraphIndex = page.slices[page.slices.length - 1]?.paraIndex;

      if (firstParagraphIndex === undefined || lastParagraphIndex === undefined) {
        return pageIndex;
      }

      if (firstParagraphIndex <= dirtyFromParagraph && dirtyFromParagraph <= lastParagraphIndex) {
        return pageIndex;
      }
    }

    for (let pageIndex = 0; pageIndex < this.pages.length; pageIndex += 1) {
      const lastParagraphIndex = this.pages[pageIndex].slices[this.pages[pageIndex].slices.length - 1]?.paraIndex;

      if (lastParagraphIndex !== undefined && lastParagraphIndex >= dirtyFromParagraph) {
        return pageIndex;
      }
    }

    return this.pages.length;
  }
}
