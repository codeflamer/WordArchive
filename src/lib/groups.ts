import type { SavedWord } from "./api";
import type { AiContent } from "./definitions";

export type Reading = {
  id: string;
  sentence: string;
  bookTitle: string | null;
  chosenMeaning: AiContent["chosenMeaning"];
};

export type WordGroup = {
  key: string;
  // The row used for shared details like definitions, filled in from other rows where it has gaps.
  word: SavedWord;
  rows: SavedWord[];
  bookTitles: string[];
  typedForms: string[];
  latest: string;
  readings: Reading[];
};

export const groupKey = (word: SavedWord) => word.base_form ?? word.word;

function chooseLead(rowsOldestFirst: SavedWord[]): SavedWord {
  return (
    rowsOldestFirst.find((row) => row.definition_status === "found" && row.ai_content) ??
    rowsOldestFirst.find((row) => row.definition_status === "found") ??
    rowsOldestFirst.find((row) => row.definition_status !== null) ??
    rowsOldestFirst[0]
  );
}

// Each save stays as its own row, so nothing is lost. Only the display merges them. Words come newest first, and so do the groups.
export function groupWords(words: SavedWord[]): WordGroup[] {
  const byKey = new Map<string, SavedWord[]>();
  for (const word of words) {
    const rows = byKey.get(groupKey(word));
    if (rows) rows.push(word);
    else byKey.set(groupKey(word), [word]);
  }

  return [...byKey].map(([key, rows]) => {
    const oldestFirst = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lead = chooseLead(oldestFirst);
    const seen = new Set<string>();
    const readings: Reading[] = [];
    for (const row of oldestFirst) {
      const identity = `${row.sentence ?? ""}\n${row.book?.title ?? ""}`;
      if (!row.sentence || seen.has(identity)) continue;
      seen.add(identity);
      readings.push({
        id: row.id,
        sentence: row.sentence,
        bookTitle: row.book?.title ?? null,
        chosenMeaning: row.ai_content?.chosenMeaning ?? null,
      });
    }
    return {
      key,
      word: {
        ...lead,
        ai_content: lead.ai_content ?? oldestFirst.find((row) => row.ai_content)?.ai_content ?? null,
        pronunciation: lead.pronunciation ?? oldestFirst.find((row) => row.pronunciation)?.pronunciation ?? null,
      },
      rows,
      bookTitles: [...new Set(oldestFirst.flatMap((row) => (row.book ? [row.book.title] : [])))],
      typedForms: [...new Set(oldestFirst.map((row) => row.word))].filter((form) => form !== key),
      latest: oldestFirst.at(-1)?.created_at ?? lead.created_at,
      readings,
    };
  });
}
