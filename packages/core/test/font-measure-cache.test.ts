import { describe, expect, it } from "vitest";
import { createFontCache } from "./helpers";

describe("FontMeasureCache", () => {
  it("reuses cached glyph metrics for the same font bucket", () => {
    const tracker = { calls: [] as string[] };
    const cache = createFontCache(tracker);
    const style = {
      fontFamily: "Test Sans",
      fontSize: 10,
      fontWeight: 400,
      fontStyle: "normal" as const,
      letterSpacing: 0
    };

    cache.measureGlyph("a", style);
    cache.measureGlyph("a", style);

    expect(tracker.calls).toEqual(["Test Sans:a"]);
  });

  it("evicts least-recently-used glyphs inside a font bucket", () => {
    const tracker = { calls: [] as string[] };
    const cache = createFontCache(tracker);
    const style = {
      fontFamily: "Test Sans",
      fontSize: 10,
      fontWeight: 400,
      fontStyle: "normal" as const,
      letterSpacing: 0
    };

    cache.measureGlyph("a", style);
    cache.measureGlyph("b", style);
    cache.measureGlyph("c", style);
    cache.measureGlyph("d", style);
    cache.measureGlyph("a", style);
    cache.measureGlyph("e", style);
    cache.measureGlyph("b", style);

    expect(tracker.calls).toEqual([
      "Test Sans:a",
      "Test Sans:b",
      "Test Sans:c",
      "Test Sans:d",
      "Test Sans:e",
      "Test Sans:b"
    ]);
  });

  it("bumps the font epoch when a font bucket is evicted", () => {
    const cache = createFontCache();
    const style = {
      fontFamily: "Test Sans",
      fontSize: 10,
      fontWeight: 400,
      fontStyle: "normal" as const,
      letterSpacing: 0
    };

    const before = cache.fontEpoch;

    cache.measureGlyph("a", style);
    cache.evictFont(style);

    expect(cache.fontEpoch).toBe(before + 1);
  });
});
