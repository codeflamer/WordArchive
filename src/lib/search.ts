import type { Book, SavedQuote } from "./api";
import type { WordGroup } from "./groups";

// Ignores capitals and accents, so "naive" finds "naïve".
export function normalise(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function searchTerms(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

// Every term has to appear somewhere in the entry, in any order.
function matches(terms: string[], parts: (string | null | undefined)[]): boolean {
  const haystack = normalise(parts.filter(Boolean).join("\n"));
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

export type SearchResults = { words: WordGroup[]; quotes: SavedQuote[] };

export function search(query: string, groups: WordGroup[], quotes: SavedQuote[], books: Book[]): SearchResults {
  const terms = searchTerms(query);
  if (terms.length === 0) return { words: [], quotes: [] };
  // Word rows only carry the book's title, so authors come from the books list,
  // or from quotes' books when that list couldn't load without signal.
  const authorOf = new Map<string, string>();
  for (const quote of quotes) if (quote.book) authorOf.set(quote.book.title, quote.book.author);
  for (const book of books) authorOf.set(book.title, book.author);
  return {
    words: groups.filter((group) =>
      matches(terms, [
        group.key,
        ...group.typedForms,
        ...group.readings.map((reading) => reading.sentence),
        ...group.bookTitles,
        ...group.bookTitles.map((title) => authorOf.get(title)),
      ]),
    ),
    quotes: quotes.filter((quote) => matches(terms, [quote.body, quote.book?.title, quote.book?.author])),
  };
}
