import { createClient, isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import type { Card } from "ts-fsrs";
import type { AiContent, Definitions, LookupResult, Pronunciation } from "./definitions";
import type { WordReview } from "./review";

export type Book = { id: string; title: string; author: string };
export type DefinitionStatus = "found" | "not_found";
export type SyncState = "sending" | "waiting";
export type NewEntry = { id: string; createdAt: string };

const ALREADY_EXISTS = "23505";
export type SavedWord = {
  id: string;
  word: string;
  base_form?: string | null;
  sentence: string | null;
  created_at: string;
  book: { title: string } | null;
  definitions: Definitions | null;
  definition_status: DefinitionStatus | null;
  spelling_suggestions?: string[] | null;
  kept_as_typed?: boolean;
  ai_content?: AiContent | null;
  pronunciation?: Pronunciation | null;
  // Only on the phone, while the server doesn't have this entry yet.
  sync?: SyncState;
};

export type SavedQuote = {
  id: string;
  body: string;
  created_at: string;
  book: { title: string; author: string } | null;
  sync?: SyncState;
};

const WORD_FIELDS =
  "id, word, base_form, sentence, created_at, definitions, definition_status, spelling_suggestions, kept_as_typed, ai_content, pronunciation, book:books(title)";
const QUOTE_FIELDS = "id, body, created_at, book:books(title, author)";
const BOOK_FIELDS = "id, title, author";
const REVIEW_FIELDS = "word_key, card, due, last_review";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

const supabase = isConfigured ? createClient(url!, key!) : null;

function client() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  return data.session;
}

// True when sign-in couldn't be checked because there's no connection, not because the reader is signed out.
export function isOfflineError(error: unknown): boolean {
  return isAuthRetryableFetchError(error);
}

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  const { data } = client().auth.onAuthStateChange((event, session) => {
    // getSession handles the first check. This event reports no session when offline, which isn't a sign-out.
    if (event !== "INITIAL_SESSION") listener(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut({ scope: "local" });
  if (error) throw error;
}

export async function listWords(): Promise<SavedWord[]> {
  const { data, error } = await client()
    .from("words")
    .select(WORD_FIELDS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as SavedWord[];
}

// If an earlier send got through but its reply was lost, the row already exists, so that one is returned.
export async function addWord(word: string, bookId: string | null, sentence: string | null, entry: NewEntry): Promise<SavedWord> {
  const { data, error } = await client()
    .from("words")
    .insert({ id: entry.id, word, book_id: bookId, sentence, created_at: entry.createdAt })
    .select(WORD_FIELDS)
    .single();
  if (error?.code === ALREADY_EXISTS) {
    const existing = await client().from("words").select(WORD_FIELDS).eq("id", entry.id).single();
    if (existing.error) throw existing.error;
    return existing.data as unknown as SavedWord;
  }
  if (error) throw error;
  return data as unknown as SavedWord;
}

export async function defineWord(word: string): Promise<LookupResult> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const response = await fetch(`/api/define?word=${encodeURIComponent(word)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
  return (await response.json()) as LookupResult;
}

export async function saveDefinitions(
  wordId: string,
  status: DefinitionStatus,
  definitions: Definitions | null,
  baseForm: string | null,
  suggestions: string[] | null,
): Promise<void> {
  const { error } = await client()
    .from("words")
    .update({ definition_status: status, definitions, base_form: baseForm, spelling_suggestions: suggestions })
    .eq("id", wordId);
  if (error) throw error;
}

export async function explainWord(word: string, sentence: string | null, definitions: Definitions): Promise<AiContent> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const response = await fetch("/api/explain", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ word, sentence, definitions }),
  });
  if (!response.ok) throw new Error(`Explain failed: ${response.status}`);
  return (await response.json()) as AiContent;
}

export async function saveAiContent(wordId: string, content: AiContent): Promise<void> {
  const { error } = await client().from("words").update({ ai_content: content }).eq("id", wordId);
  if (error) throw error;
}

export async function pronounceWord(word: string): Promise<Pronunciation> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const response = await fetch(`/api/pronounce?word=${encodeURIComponent(word)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(`Pronunciation failed: ${response.status}`);
  return (await response.json()) as Pronunciation;
}

export async function savePronunciation(wordId: string, pronunciation: Pronunciation): Promise<void> {
  const { error } = await client().from("words").update({ pronunciation }).eq("id", wordId);
  if (error) throw error;
}

export async function keepAsTyped(wordId: string): Promise<void> {
  const { error } = await client().from("words").update({ kept_as_typed: true }).eq("id", wordId);
  if (error) throw error;
}

export async function listReviews(): Promise<WordReview[]> {
  const { data, error } = await client().from("word_reviews").select(REVIEW_FIELDS);
  if (error) throw error;
  return data as unknown as WordReview[];
}

export async function getReview(wordKey: string): Promise<WordReview | null> {
  const { data, error } = await client().from("word_reviews").select(REVIEW_FIELDS).eq("word_key", wordKey).maybeSingle();
  if (error) throw error;
  return data as unknown as WordReview | null;
}

export async function recordReview(wordKey: string, rating: number, card: Card): Promise<void> {
  const { error } = await client().rpc("record_review", { p_word_key: wordKey, p_rating: rating, p_card: card });
  if (error) throw error;
}

export async function listQuotes(): Promise<SavedQuote[]> {
  const { data, error } = await client()
    .from("quotes")
    .select(QUOTE_FIELDS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as SavedQuote[];
}

export async function addQuote(body: string, bookId: string | null, entry: NewEntry): Promise<SavedQuote> {
  const { data, error } = await client()
    .from("quotes")
    .insert({ id: entry.id, body, book_id: bookId, created_at: entry.createdAt })
    .select(QUOTE_FIELDS)
    .single();
  if (error?.code === ALREADY_EXISTS) {
    const existing = await client().from("quotes").select(QUOTE_FIELDS).eq("id", entry.id).single();
    if (existing.error) throw existing.error;
    return existing.data as unknown as SavedQuote;
  }
  if (error) throw error;
  return data as unknown as SavedQuote;
}

export async function listBooks(): Promise<Book[]> {
  const { data, error } = await client()
    .from("books")
    .select(BOOK_FIELDS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addBook(title: string, author: string): Promise<Book> {
  const { data, error } = await client()
    .from("books")
    .insert({ title, author })
    .select(BOOK_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function getCurrentBook(): Promise<Book | null> {
  const { data, error } = await client()
    .from("reader_settings")
    .select(`book:books(${BOOK_FIELDS})`)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as { book: Book | null } | null)?.book ?? null;
}

export async function setCurrentBook(bookId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const { error } = await client()
    .from("reader_settings")
    .upsert({ user_id: session.user.id, current_book_id: bookId });
  if (error) throw error;
}
