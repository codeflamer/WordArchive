import { describe, expect, it } from "vitest";
import type { SavedQuote, SavedWord } from "../src/lib/api";
import { groupWords } from "../src/lib/groups";
import { normalise, search, searchTerms } from "../src/lib/search";

const definitions = { source: "Test", sourceUrl: "https://example.test", meanings: [] };
const word = (text: string, extra: Partial<SavedWord> = {}): SavedWord => ({
  id: `${text}-${extra.created_at ?? ""}`,
  word: text,
  sentence: null,
  created_at: "2026-11-01T10:00:00Z",
  book: null,
  definitions,
  definition_status: "found",
  ...extra,
});
const quote = (body: string, book: SavedQuote["book"] = null): SavedQuote => ({ id: body, body, created_at: "2026-11-01T10:00:00Z", book });
const middlemarch = { title: "Middlemarch", author: "George Eliot" };
const beloved = { title: "Beloved", author: "Toni Morrison" };

const groups = groupWords([
  word("sanction", { sentence: "The council gave its sanction.", book: { title: "Middlemarch" } }),
  word("mitigated", { base_form: "mitigate", book: { title: "Beloved" } }),
  word("naïve"),
]);
const quotes = [quote("It is a truth universally acknowledged.", middlemarch), quote("Definitions belong to the definers.", beloved)];
const books = [
  { id: "b1", ...middlemarch },
  { id: "b2", ...beloved },
];
const run = (query: string) => {
  const results = search(query, groups, quotes, books);
  return { words: results.words.map((group) => group.key), quotes: results.quotes.map((item) => item.body) };
};

describe("searching", () => {
  it("finds a saved word", () => {
    expect(run("sanction")).toEqual({ words: ["sanction"], quotes: [] });
  });

  it("finds a word by the form that was typed, or part of it", () => {
    expect(run("mitigated").words).toEqual(["mitigate"]);
    expect(run("mitig").words).toEqual(["mitigate"]);
  });

  it("finds a phrase inside a quote", () => {
    expect(run("universally acknowledged")).toEqual({ words: [], quotes: ["It is a truth universally acknowledged."] });
  });

  it("finds a phrase inside a word's book sentence", () => {
    expect(run("council gave").words).toEqual(["sanction"]);
  });

  it("finds everything from a book by its title", () => {
    expect(run("middlemarch")).toEqual({ words: ["sanction"], quotes: ["It is a truth universally acknowledged."] });
  });

  it("finds everything from a book by its author, including words", () => {
    expect(run("Toni Morrison")).toEqual({ words: ["mitigate"], quotes: ["Definitions belong to the definers."] });
  });

  it("finds words by author from quotes' books when the books list is missing", () => {
    expect(search("morrison", groups, quotes, []).words.map((group) => group.key)).toEqual(["mitigate"]);
  });

  it("ignores capitals and accents in both directions", () => {
    expect(run("SANCTION").words).toEqual(["sanction"]);
    expect(run("naive").words).toEqual(["naïve"]);
    expect(run("naïve").words).toEqual(["naïve"]);
  });

  it("needs every term to match, in any order", () => {
    expect(run("eliot truth").quotes).toEqual(["It is a truth universally acknowledged."]);
    expect(run("truth eliot").quotes).toEqual(["It is a truth universally acknowledged."]);
    expect(run("truth morrison").quotes).toEqual([]);
  });

  it("finds nothing for text that isn't saved", () => {
    expect(run("zzzznothing")).toEqual({ words: [], quotes: [] });
  });

  it("returns nothing for an empty or blank search", () => {
    expect(run("")).toEqual({ words: [], quotes: [] });
    expect(run("   ")).toEqual({ words: [], quotes: [] });
  });

  it("treats symbols in a search as plain text", () => {
    expect(run("(.*)")).toEqual({ words: [], quotes: [] });
  });

  it("splits a search into normalised terms", () => {
    expect(searchTerms("  Naïve  WORD ")).toEqual(["naive", "word"]);
    expect(normalise("Éclair")).toBe("eclair");
  });
});
