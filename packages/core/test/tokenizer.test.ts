import { describe, expect, it } from "vitest";
import { tokenizeParagraph } from "../src/tokenizer";

describe("tokenizeParagraph", () => {
  it("groups Latin words and attaches trailing spaces", () => {
    const tokens = tokenizeParagraph("hello world ");

    expect(tokens.map((token) => token.text)).toEqual(["hello ", "world "]);
    expect(tokens.map((token) => token.breakAfter)).toEqual([true, true]);
  });

  it("attaches punctuation to the previous word", () => {
    const tokens = tokenizeParagraph("hello, world!");

    expect(tokens.map((token) => token.contentText)).toEqual(["hello,", "world!"]);
    expect(tokens.every((token) => token.breakAfter)).toBe(true);
  });

  it("keeps leading spaces as their own token so width is preserved", () => {
    const tokens = tokenizeParagraph("  hello");

    expect(tokens.map((token) => token.text)).toEqual(["  ", "hello"]);
    expect(tokens[0].contentText).toBe("  ");
  });

  it("keeps tabs as standalone breakable units", () => {
    const tokens = tokenizeParagraph("\thello");

    expect(tokens.map((token) => token.text)).toEqual(["\t", "hello"]);
    expect(tokens[0].breakAfter).toBe(true);
  });
});
