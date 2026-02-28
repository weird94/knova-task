import { LruMap } from "./lru-map";
import { serializeTextStyle } from "./utils";
import type { GlyphMetrics, TextStyle } from "./types";

export interface GlyphMeasurer {
  measureGlyph(char: string, textStyle: TextStyle): GlyphMetrics;
}

export interface FontMeasureCacheOptions {
  maxGlyphsPerFont?: number;
}

export class FontMeasureCache {
  private readonly fonts = new Map<string, LruMap<string, GlyphMetrics>>();
  private fontEpochInternal = 1;

  constructor(
    private readonly measurer: GlyphMeasurer,
    private readonly options: FontMeasureCacheOptions = {}
  ) {}

  get fontEpoch(): number {
    return this.fontEpochInternal;
  }

  getFontKey(textStyle: TextStyle): string {
    return serializeTextStyle({
      ...textStyle,
      letterSpacing: 0
    });
  }

  measureGlyph(char: string, textStyle: TextStyle): GlyphMetrics {
    const fontKey = this.getFontKey(textStyle);
    let fontCache = this.fonts.get(fontKey);

    if (!fontCache) {
      fontCache = new LruMap(this.options.maxGlyphsPerFont ?? 1024);
      this.fonts.set(fontKey, fontCache);
    }

    const cached = fontCache.get(char);

    if (cached) {
      return cached;
    }

    const measured = this.measurer.measureGlyph(char, textStyle);
    fontCache.set(char, measured);

    return measured;
  }

  evictFont(textStyleOrFontKey: TextStyle | string): void {
    const fontKey =
      typeof textStyleOrFontKey === "string"
        ? textStyleOrFontKey
        : this.getFontKey(textStyleOrFontKey);

    if (this.fonts.delete(fontKey)) {
      this.fontEpochInternal += 1;
    }
  }

  clear(): void {
    if (this.fonts.size === 0) {
      return;
    }

    this.fonts.clear();
    this.fontEpochInternal += 1;
  }

  bumpFontEpoch(): void {
    this.fontEpochInternal += 1;
  }
}
