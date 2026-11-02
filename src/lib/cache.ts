import type { SavedWord } from "./api";

const KEY = "wordarchive.words.v1";

// A copy of the word list for reading without signal. Cleared on sign-out.
export function readCachedWords(): SavedWord[] | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? (JSON.parse(stored) as SavedWord[]) : null;
  } catch {
    return null;
  }
}

export function cacheWords(words: SavedWord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(words));
  } catch {
    // Storage can be full or blocked. The app still works online without the copy.
  }
}

export function clearCachedWords(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
