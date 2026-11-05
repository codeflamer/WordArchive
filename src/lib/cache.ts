import type { Book, SavedQuote, SavedWord } from "./api";

const WORDS_KEY = "wordarchive.words.v1";
const QUOTES_KEY = "wordarchive.quotes.v1";
const BOOK_KEY = "wordarchive.book.v1";

function read<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked. The app still works online without the copy.
  }
}

// Copies for using the app without signal. Cleared on sign-out.
export const readCachedWords = () => read<SavedWord[]>(WORDS_KEY);
// Entries still waiting to sync live in the outbox, which is their only true record.
export const cacheWords = (words: SavedWord[]) => write(WORDS_KEY, words.filter((word) => !word.sync));

export const readCachedQuotes = () => read<SavedQuote[]>(QUOTES_KEY);
export const cacheQuotes = (quotes: SavedQuote[]) => write(QUOTES_KEY, quotes.filter((quote) => !quote.sync));

// Undefined means no copy is saved, while null means the reader has no current book.
export function readCachedBook(): Book | null | undefined {
  const stored = read<{ book: Book | null }>(BOOK_KEY);
  return stored ? stored.book : undefined;
}
export const cacheBook = (book: Book | null) => write(BOOK_KEY, { book });

// The outbox stays, as it may hold saves that exist nowhere else.
export function clearCachedWords(): void {
  try {
    localStorage.removeItem(WORDS_KEY);
    localStorage.removeItem(QUOTES_KEY);
    localStorage.removeItem(BOOK_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
