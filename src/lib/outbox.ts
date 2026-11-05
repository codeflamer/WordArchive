// Saves wait here until the server has them. Each one's ID is set when it's created,
// so sending it twice can't make a duplicate, and being cut off at any moment can't lose it.

export type WordItem = {
  kind: "word";
  id: string;
  word: string;
  bookId: string | null;
  bookTitle: string | null;
  sentence: string | null;
  createdAt: string;
};

export type QuoteItem = {
  kind: "quote";
  id: string;
  body: string;
  bookId: string | null;
  bookTitle: string | null;
  bookAuthor: string | null;
  createdAt: string;
};

export type OutboxItem = WordItem | QuoteItem;

const KEY = "wordarchive.outbox.v1";

// Used only if the phone blocks storage, so saving still works while the app stays open.
let memoryOnly: OutboxItem[] | null = null;

function readAll(): OutboxItem[] {
  if (memoryOnly) return memoryOnly;
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? (JSON.parse(stored) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    memoryOnly = null;
  } catch {
    memoryOnly = items;
  }
}

export function readOutbox<K extends OutboxItem["kind"]>(kind: K): Extract<OutboxItem, { kind: K }>[] {
  return readAll().filter((item): item is Extract<OutboxItem, { kind: K }> => item.kind === kind);
}

export function addToOutbox(item: OutboxItem): void {
  writeAll([...readAll(), item]);
}

export function removeFromOutbox(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id));
}
