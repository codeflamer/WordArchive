import { useEffect, useState, type FormEvent } from "react";
import { addQuote, listQuotes, type Book, type SavedQuote } from "./lib/api";

export function Quotes({ book }: { book: Book | null | undefined }) {
  const [quotes, setQuotes] = useState<SavedQuote[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let current = true;
    listQuotes().then(
      (list) => current && setQuotes(list),
      () => current && setError("Your quotes didn't load. Check your connection and reopen the app."),
    );
    return () => {
      current = false;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved("");
    if (!draft.trim()) {
      setError("Type or dictate a quote to save.");
      return;
    }
    if (book === undefined) {
      setError("Your current book hasn't loaded yet. Check your connection and try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The quote is saved exactly as entered, so it is never trimmed or changed.
      const quote = await addQuote(draft, book?.id ?? null);
      setQuotes((list) => [quote, ...(list ?? [])]);
      setDraft("");
      setSaved("Saved quote");
    } catch {
      setError("The quote wasn't saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {quotes && (
        <div className="ribbon" aria-label={`${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"} saved`}>
          {quotes.length}
        </div>
      )}

      <form className="capture" onSubmit={save}>
        <label htmlFor="quote">New quote</label>
        <textarea
          id="quote"
          className="quote-field"
          rows={4}
          autoCapitalize="sentences"
          autoCorrect="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="primary" disabled={busy}>Save quote</button>
        <p className="saved" role="status">{saved}</p>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {quotes?.length === 0 && <p className="empty">Your quotes will appear here. Type one, or tap the keyboard's mic to dictate it.</p>}
      {quotes && quotes.length > 0 && (
        <ol className="quotes">
          {quotes.map((entry) => (
            <li key={entry.id}>
              <blockquote>{entry.body}</blockquote>
              {entry.book && (
                <p className="source">
                  <cite>{entry.book.title}</cite> by {entry.book.author}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
