import { describe, expect, it } from "vitest";
import { checkWord } from "../src/lib/word";

describe("checkWord", () => {
  it.each([
    ["ephemeral", "ephemeral"],
    ["  Ephemeral. ", "ephemeral"],
    ["well-being", "well-being"],
    ["o’clock", "o'clock"],
  ])("accepts %s", (input, word) => {
    expect(checkWord(input)).toEqual({ ok: true, word });
  });

  it.each([
    ["", "Type a word to save."],
    ["   ", "Type a word to save."],
    ["two words", "Save one word at a time."],
    ["naïve", "Use English letters only."],
    ["a".repeat(65), "Use English letters only."],
  ])("rejects %j", (input, message) => {
    expect(checkWord(input)).toEqual({ ok: false, message });
  });
});
