export type Definition = { definition: string; example?: string };
export type Meaning = { partOfSpeech: string; definitions: Definition[] };
export type Definitions = {
  source: string;
  sourceUrl: string;
  meanings: Meaning[];
  // Meanings of the typed word itself, when it was saved under a base form. "bored" also means weary, not just "past of bore".
  typedMeanings?: Meaning[];
};

// Examples the dictionary itself gives, used when AI can't write any. There may be fewer than 3, or none.
export function dictionaryExamples(definitions: Definitions | null | undefined, limit = 3): string[] {
  const groups = [...(definitions?.meanings ?? []), ...(definitions?.typedMeanings ?? [])];
  const examples = groups.flatMap((meaning) => meaning.definitions.map((item) => item.example ?? "")).filter(Boolean);
  return [...new Set(examples)].slice(0, limit);
}

// Either part can be missing. Words with no recording are read aloud by the phone's own voice.
export type Pronunciation = { audio: string | null; text: string | null };

// Written by AI, so the app always labels it. A chosen meaning needs a book sentence to choose from.
export type AiContent = {
  chosenMeaning: { partOfSpeech: string; definition: string } | null;
  examples: string[];
};

export type LookupResult =
  | { status: "found"; definitions: Definitions; baseForm?: string }
  | { status: "not_found"; suggestions?: string[] };
