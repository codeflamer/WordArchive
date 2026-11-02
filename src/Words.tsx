import { useEffect, useRef, useState, type FormEvent } from "react";
import { Books } from "./Books";
import { addWord, getCurrentBook, listWords, signOut, type Book, type SavedWord } from "./lib/api";
import { checkWord } from "./lib/word";

const savedOn = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export function Words() {
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [choosingBook, setChoosingBook] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    listWords().then(
      (list) => current && setWords(list),
      () => current && setError("Your words didn't load. Check your connection and reopen the app."),
    );
    getCurrentBook().then(
      (found) => current && setBook(found),
      () => current && setError("Your current book didn't load. Check your connection and reopen the app."),
    );
    return () => {
      current = false;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    const check = checkWord(draft);
    setSaved("");
    if (!check.ok) {
      setError(check.message);
      return;
    }
    // Don't save against "no book" while the current book is still unknown.
    if (book === undefined) {
      setError("Your current book hasn't loaded yet. Check your connection and try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const word = await addWord(check.word, book?.id ?? null);
      setWords((list) => [word, ...(list ?? [])]);
      setDraft("");
      setSaved(`Saved ${word.word}`);
    } catch {
      setError("The word wasn't saved. Check your connection and try again.");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  async function leave() {
    setError("");
    try {
      await signOut();
    } catch {
      setError("You weren't signed out. Check your connection and try again.");
    }
  }

  if (choosingBook) {
    return (
      <Books
        currentId={book?.id ?? null}
        onChosen={(chosen) => {
          setBook(chosen);
          setChoosingBook(false);
        }}
        onBack={() => setChoosingBook(false)}
      />
    );
  }

  return (
    <main className="page">
      {words && (
        <div className="ribbon" aria-label={`${words.length} ${words.length === 1 ? "word" : "words"} saved`}>
          {words.length}
        </div>
      )}
      <h1 className="title">WordArchive</h1>

      {book !== undefined && (
        <div className="reading">
          {book ? (
            <p>
              Reading <cite>{book.title}</cite> by {book.author}
            </p>
          ) : (
            <p>No book chosen yet</p>
          )}
          <button type="button" className="quiet" onClick={() => setChoosingBook(true)}>
            {book ? "Change book" : "Choose a book"}
          </button>
        </div>
      )}

      <form className="capture" onSubmit={save}>
        <label htmlFor="word">New word</label>
        <input
          id="word"
          ref={input}
          className="capture-field"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="primary" disabled={busy}>Save word</button>
        <p className="saved" role="status">{saved}</p>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {words?.length === 0 && <p className="empty">Your words will appear here. Save the first one you meet in your book.</p>}
      {words && words.length > 0 && (
        <ol className="entries">
          {words.map((entry) => (
            <li key={entry.id}>
              <span className="headword">{entry.word}</span>
              <time dateTime={entry.created_at}>{savedOn.format(new Date(entry.created_at))}</time>
              {entry.book && <cite className="source">{entry.book.title}</cite>}
            </li>
          ))}
        </ol>
      )}

      <button className="quiet leave" onClick={leave}>Sign out</button>
    </main>
  );
}
