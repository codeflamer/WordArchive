export type Definition = { definition: string; example?: string };
export type Meaning = { partOfSpeech: string; definitions: Definition[] };
export type Definitions = {
  source: string;
  sourceUrl: string;
  meanings: Meaning[];
  // Meanings of the typed word itself, when it was saved under a base form. "bored" also means weary, not just "past of bore".
  typedMeanings?: Meaning[];
};

// Written by AI, so the app always labels it. A chosen meaning needs a book sentence to choose from.
export type AiContent = {
  chosenMeaning: { partOfSpeech: string; definition: string } | null;
  examples: string[];
};

export type LookupResult =
  | { status: "found"; definitions: Definitions; baseForm?: string }
  | { status: "not_found"; suggestions?: string[] };
