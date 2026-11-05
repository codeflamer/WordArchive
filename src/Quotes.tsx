import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { addQuote, listQuotes, type Book, type SavedQuote } from "./lib/api";
import { cacheQuotes, readCachedQuotes } from "./lib/cache";
import { addToOutbox, readOutbox, removeFromOutbox, type QuoteItem } from "./lib/outbox";

const toRow = (item: QuoteItem, sync: SavedQuote["sync"]): SavedQuote => ({
  id: item.id,
  body: item.body,
  created_at: item.createdAt,
  book: item.bookTitle ? { title: item.bookTitle, author: item.bookAuthor ?? "" } : null,
  sync,
});

function startingQuotes(): SavedQuote[] | null {
  const waiting = readOutbox("quote").map((item) => toRow(item, "waiting"));
  const cached = readCachedQuotes();
  if (!cached && waiting.length === 0) return null;
  const ids = new Set(waiting.map((quote) => quote.id));
  return [...waiting.reverse(), ...(cached ?? []).filter((quote) => !ids.has(quote.id))];
}

export function Quotes({ book }: { book: Book | null | undefined }) {
  const [quotes, setQuotes] = useState<SavedQuote[] | null>(startingQuotes);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const sending = useRef(false);
  const sendAgain = useRef(false);
  const sentThisVisit = useRef(new Set<string>());

  const send = useCallback(async () => {
    if (sending.current) {
      sendAgain.current = true;
      return;
    }
    sending.current = true;
    try {
      do {
        sendAgain.current = false;
        for (const item of readOutbox("quote")) {
          setQuotes((list) => (list ?? []).map((quote) => (quote.id === item.id ? { ...quote, sync: "sending" } : quote)));
          try {
            const stored = await addQuote(item.body, item.bookId, { id: item.id, createdAt: item.createdAt });
            removeFromOutbox(item.id);
            sentThisVisit.current.add(stored.id);
            setQuotes((list) => (list ?? []).map((quote) => (quote.id === item.id ? stored : quote)));
          } catch {
            setQuotes((list) => (list ?? []).map((quote) => (quote.id === item.id ? { ...quote, sync: "waiting" } : quote)));
          }
        }
      } while (sendAgain.current);
    } finally {
      sending.current = false;
    }
  }, []);

  useEffect(() => {
    let current = true;
    listQuotes().then(
      (list) => {
        if (!current) return;
        const ids = new Set(list.map((quote) => quote.id));
        // Keeps entries the server list may have been fetched too early to include.
        setQuotes((previous) => [
          ...(previous ?? []).filter((quote) => !ids.has(quote.id) && (quote.sync || sentThisVisit.current.has(quote.id))),
          ...list,
        ]);
      },
      () => {
        if (!current) return;
        if (readCachedQuotes() || readOutbox("quote").length > 0) setNotice("You're seeing your saved copy, because your quotes couldn't be refreshed.");
        else setError("Your quotes didn't load. Check your connection and reopen the app.");
      },
    );
    void send();
    const retry = () => void send();
    const retryIfShown = () => {
      if (document.visibilityState === "visible") void send();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retryIfShown);
    return () => {
      current = false;
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retryIfShown);
    };
  }, [send]);

  useEffect(() => {
    if (quotes) cacheQuotes(quotes);
  }, [quotes]);

  function save(event: FormEvent) {
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
    setError("");
    // The quote is saved exactly as entered, so it is never trimmed or changed.
    const item: QuoteItem = {
      kind: "quote",
      id: crypto.randomUUID(),
      body: draft,
      bookId: book?.id ?? null,
      bookTitle: book?.title ?? null,
      bookAuthor: book?.author ?? null,
      createdAt: new Date().toISOString(),
    };
    addToOutbox(item);
    setQuotes((list) => [toRow(item, "sending"), ...(list ?? [])]);
    setDraft("");
    setSaved("Saved quote");
    void send();
  }

  const waitingCount = quotes?.filter((quote) => quote.sync === "waiting").length ?? 0;

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
        <button className="primary">Save quote</button>
        <p className="saved" role="status">{saved}</p>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="saved">{notice}</p>}
      {waitingCount > 0 && (
        <div className="sync-note">
          <p>{waitingCount === 1 ? "1 quote is waiting to sync. It's saved on this phone." : `${waitingCount} quotes are waiting to sync. They're saved on this phone.`}</p>
          <button type="button" className="quiet" onClick={() => void send()}>Sync quotes now</button>
        </div>
      )}

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
              {entry.sync === "waiting" && <p className="sync-flag">Waiting to sync</p>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
