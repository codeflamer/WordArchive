import { localDay } from "./dates";
import type { OutboxItem } from "./outbox";

export type Row = Record<string, unknown>;

// Every table holding the reader's own data, with the order its rows are read in, so long lists can be read page by page.
export const EXPORT_TABLES = {
  books: ["created_at", "id"],
  words: ["created_at", "id"],
  quotes: ["created_at", "id"],
  word_reviews: ["word_key"],
  word_review_log: ["reviewed_at", "id"],
  reader_settings: ["user_id"],
} as const;

export type ExportTable = keyof typeof EXPORT_TABLES;
export type ExportTables = Record<ExportTable, Row[]>;

export type ExportFile = {
  app: "WordArchive";
  format: 1;
  exportedAt: string;
  counts: { books: number; words: number; wordSaves: number; quotes: number; reviews: number; waitingToSync: number };
  books: Row[];
  words: Row[];
  quotes: Row[];
  reviewSchedule: Row[];
  reviewHistory: Row[];
  settings: Row | null;
  // Saved on this phone without signal and not on the server yet, so the file still has them.
  waitingToSync: OutboxItem[];
};

// The account ID means nothing outside this account, so it's left out, and a restore gives each row to the new account.
function withoutOwner(rows: Row[]): Row[] {
  return rows.map(({ user_id: _owner, ...rest }) => rest);
}

export function buildExport(tables: ExportTables, waiting: OutboxItem[], now: Date): ExportFile {
  const words = withoutOwner(tables.words);
  const entries = new Set(words.map((row) => (row.base_form as string | null) ?? (row.word as string)));
  return {
    app: "WordArchive",
    format: 1,
    exportedAt: now.toISOString(),
    counts: {
      books: tables.books.length,
      words: entries.size,
      wordSaves: words.length,
      quotes: tables.quotes.length,
      reviews: tables.word_review_log.length,
      waitingToSync: waiting.length,
    },
    books: withoutOwner(tables.books),
    words,
    quotes: withoutOwner(tables.quotes),
    reviewSchedule: withoutOwner(tables.word_reviews),
    reviewHistory: withoutOwner(tables.word_review_log),
    settings: withoutOwner(tables.reader_settings)[0] ?? null,
    waitingToSync: waiting,
  };
}

export function exportFileName(now: Date): string {
  return `wordarchive-${localDay(now)}.json`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Uses the same counts the app shows, so they can be checked against the word and quote lists.
export function describeCounts({ counts }: ExportFile): string {
  const parts = [
    plural(counts.words, "word", "words"),
    plural(counts.quotes, "quote", "quotes"),
    plural(counts.books, "book", "books"),
    plural(counts.reviews, "review", "reviews"),
  ];
  const waiting = counts.waitingToSync > 0 ? `, plus ${plural(counts.waitingToSync, "entry", "entries")} waiting to sync` : "";
  return `${parts.join(", ")}${waiting}`;
}
