import { createClient, type Session } from "@supabase/supabase-js";

export type Book = { id: string; title: string; author: string };
export type SavedWord = { id: string; word: string; created_at: string; book: { title: string } | null };

const WORD_FIELDS = "id, word, created_at, book:books(title)";
const BOOK_FIELDS = "id, title, author";

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

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  const { data } = client().auth.onAuthStateChange((_event, session) => listener(session));
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

export async function addWord(word: string, bookId: string | null): Promise<SavedWord> {
  const { data, error } = await client()
    .from("words")
    .insert({ word, book_id: bookId })
    .select(WORD_FIELDS)
    .single();
  if (error) throw error;
  return data as unknown as SavedWord;
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
