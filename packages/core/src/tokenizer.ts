import type { Word } from "./types";

type TokenSeed = {
  contentText: string;
  trailingWhitespaceText: string;
  breakAfter: boolean;
  sourceStart: number;
  sourceEnd: number;
};

const WORD_REGEX = /[A-Za-z0-9]/;
const PUNCTUATION_REGEX = /[.,!?;:'")\]]/;

const isWordChar = (char: string): boolean => WORD_REGEX.test(char);
const isPunctuation = (char: string): boolean => PUNCTUATION_REGEX.test(char);

const createTokenSeed = (
  contentText: string,
  trailingWhitespaceText: string,
  breakAfter: boolean,
  sourceStart: number,
  sourceEnd: number
): TokenSeed => ({
  contentText,
  trailingWhitespaceText,
  breakAfter,
  sourceStart,
  sourceEnd
});

export const tokenizeParagraph = (text: string, sourceStart = 0): Array<Omit<Word, "glyphs" | "width" | "contentWidth" | "trailingWhitespaceWidth">> => {
  const seeds: TokenSeed[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === "\t") {
      seeds.push(createTokenSeed("\t", "", true, sourceStart + index, sourceStart + index + 1));
      index += 1;
      continue;
    }

    if (char === " ") {
      const start = index;

      while (index < text.length && text[index] === " ") {
        index += 1;
      }

      seeds.push(
        createTokenSeed(
          text.slice(start, index),
          "",
          true,
          sourceStart + start,
          sourceStart + index
        )
      );
      continue;
    }

    if (isWordChar(char)) {
      const start = index;

      while (index < text.length && isWordChar(text[index])) {
        index += 1;
      }

      while (index < text.length && isPunctuation(text[index])) {
        index += 1;
      }

      const contentEnd = index;

      while (index < text.length && text[index] === " ") {
        index += 1;
      }

      const trailingWhitespaceText = text.slice(contentEnd, index);
      const contentText = text.slice(start, contentEnd);

      seeds.push(
        createTokenSeed(
          contentText,
          trailingWhitespaceText,
          trailingWhitespaceText.length > 0 || /[.,!?;:]/.test(contentText[contentText.length - 1] ?? ""),
          sourceStart + start,
          sourceStart + index
        )
      );
      continue;
    }

    if (isPunctuation(char)) {
      const start = index;

      while (index < text.length && isPunctuation(text[index])) {
        index += 1;
      }

      while (index < text.length && text[index] === " ") {
        index += 1;
      }

      const contentText = text.slice(start, index).trimEnd();
      const trailingWhitespaceText = text.slice(start + contentText.length, index);

      seeds.push(
        createTokenSeed(
          contentText,
          trailingWhitespaceText,
          true,
          sourceStart + start,
          sourceStart + index
        )
      );
      continue;
    }

    seeds.push(createTokenSeed(char, "", true, sourceStart + index, sourceStart + index + 1));
    index += 1;
  }

  return seeds.map((seed) => ({
    text: `${seed.contentText}${seed.trailingWhitespaceText}`,
    contentText: seed.contentText,
    trailingWhitespaceText: seed.trailingWhitespaceText,
    breakAfter: seed.breakAfter,
    sourceStart: seed.sourceStart,
    sourceEnd: seed.sourceEnd
  }));
};
