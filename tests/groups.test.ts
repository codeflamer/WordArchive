import { describe, expect, it } from "vitest";
import type { SavedWord } from "../src/lib/api";
import { groupWords } from "../src/lib/groups";

const row = (id: string, word: string, created: number, extra: Partial<SavedWord> = {}): SavedWord => ({
  id,
  word,
  sentence: null,
  created_at: `2026-11-0${created}T10:00:00Z`,
  book: null,
  definitions: null,
  definition_status: null,
  ...extra,
});
const definitions = { source: "Test", sourceUrl: "https://example.test", meanings: [] };
const ai = (definition: string | null) => ({
  chosenMeaning: definition ? { partOfSpeech: "noun", definition } : null,
  examples: ["One.", "Two.", "Three."],
});

describe("grouping words", () => {
  it("keeps different words apart, newest first", () => {
    const groups = groupWords([row("b", "sanction", 2), row("a", "ephemeral", 1)]);
    expect(groups.map((group) => group.key)).toEqual(["sanction", "ephemeral"]);
  });

  it("handles an empty list", () => {
    expect(groupWords([])).toEqual([]);
  });

  it("merges repeated saves of a word, and keeps every row", () => {
    const groups = groupWords([row("b", "sanction", 2), row("a", "sanction", 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((item) => item.id)).toEqual(["b", "a"]);
    expect(groups[0].latest).toBe("2026-11-02T10:00:00Z");
  });

  it("merges a changed form with its base word, and notes the typed form", () => {
    const groups = groupWords([row("b", "mitigated", 2, { base_form: "mitigate" }), row("a", "mitigate", 1), row("c", "mitigating", 3, { base_form: "mitigate" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("mitigate");
    expect(groups[0].typedForms).toEqual(["mitigated", "mitigating"]);
  });

  it("merges a corrected typo with the correct spelling", () => {
    const groups = groupWords([row("b", "ephemral", 2, { base_form: "ephemeral" }), row("a", "ephemeral", 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].typedForms).toEqual(["ephemral"]);
  });

  it("lists each book once, oldest first", () => {
    const groups = groupWords([
      row("c", "sanction", 3, { book: { title: "Beloved" } }),
      row("b", "sanction", 2, { book: { title: "Middlemarch" } }),
      row("a", "sanction", 1, { book: { title: "Beloved" } }),
      row("d", "sanction", 4),
    ]);
    expect(groups[0].bookTitles).toEqual(["Beloved", "Middlemarch"]);
  });

  it("keeps each sentence with its book and its own meaning, oldest first", () => {
    const groups = groupWords([
      row("b", "sanction", 2, { sentence: "It punished them.", book: { title: "Beloved" }, ai_content: ai("A penalty.") }),
      row("a", "sanction", 1, { sentence: "They approved it.", book: { title: "Middlemarch" }, ai_content: ai("An approval.") }),
    ]);
    expect(groups[0].readings).toEqual([
      { id: "a", sentence: "They approved it.", bookTitle: "Middlemarch", chosenMeaning: { partOfSpeech: "noun", definition: "An approval." } },
      { id: "b", sentence: "It punished them.", bookTitle: "Beloved", chosenMeaning: { partOfSpeech: "noun", definition: "A penalty." } },
    ]);
  });

  it("shows a sentence once when it's repeated from the same book, but not across books", () => {
    const groups = groupWords([
      row("c", "sanction", 3, { sentence: "Same.", book: { title: "B" } }),
      row("b", "sanction", 2, { sentence: "Same.", book: { title: "A" } }),
      row("a", "sanction", 1, { sentence: "Same.", book: { title: "A" } }),
    ]);
    expect(groups[0].readings.map((reading) => reading.id)).toEqual(["a", "c"]);
  });

  it("uses the oldest complete row for shared details", () => {
    const found = { definition_status: "found" as const, definitions };
    const groups = groupWords([
      row("c", "sanction", 3, { ...found, ai_content: ai(null) }),
      row("b", "sanction", 2, { ...found, ai_content: ai(null) }),
      row("a", "sanction", 1, found),
    ]);
    expect(groups[0].word.id).toBe("b");
  });

  it("prefers a defined row over one still waiting", () => {
    const groups = groupWords([row("b", "sanction", 2, { definition_status: "found", definitions }), row("a", "sanction", 1)]);
    expect(groups[0].word.id).toBe("b");
  });

  it("fills gaps in the shared details from other rows", () => {
    const pronunciation = { audio: null, text: "/a/" };
    const groups = groupWords([
      row("b", "sanction", 2, { definition_status: "not_found", ai_content: ai(null), pronunciation }),
      row("a", "sanction", 1, { definition_status: "found", definitions }),
    ]);
    expect(groups[0].word.id).toBe("a");
    expect(groups[0].word.ai_content?.examples).toHaveLength(3);
    expect(groups[0].word.pronunciation).toEqual(pronunciation);
  });
});
