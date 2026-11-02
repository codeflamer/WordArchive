export type WordCheck = { ok: true; word: string } | { ok: false; message: string };

const SINGLE_WORD = /^[a-z]+(?:[-'][a-z]+)*$/;

// Dictation adds capitals and full stops, and iPhone keyboards use curly apostrophes.
export function checkWord(input: string): WordCheck {
  const word = input
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^a-z]+|[^a-z]+$/g, "");

  if (!word) return { ok: false, message: "Type a word to save." };
  if (/\s/.test(word)) return { ok: false, message: "Save one word at a time." };
  if (word.length > 64 || !SINGLE_WORD.test(word)) {
    return { ok: false, message: "Use English letters only." };
  }
  return { ok: true, word };
}
