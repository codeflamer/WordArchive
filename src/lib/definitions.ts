export type Definition = { definition: string; example?: string };
export type Meaning = { partOfSpeech: string; definitions: Definition[] };
export type Definitions = { source: string; sourceUrl: string; meanings: Meaning[] };

export type LookupResult = { status: "found"; definitions: Definitions } | { status: "not_found" };
