import { useEffect, useMemo, useState } from "react";
import { listBooks, listQuotes, listWords, type Book, type SavedQuote, type SavedWord } from "./lib/api";
import { cacheQuotes, cacheWords, readCachedQuotes, readCachedWords } from "./lib/cache";
import { savedOn } from "./lib/dates";
import { groupWords } from "./lib/groups";
import { readOutbox } from "./lib/outbox";
import { search } from "./lib/search";

// Saves still waiting to sync are searchable too, as they're the reader's latest entries.
function waitingWords(): SavedWord[] {
  return readOutbox("word").map((item) => ({
    id: item.id,
    word: item.word,
    sentence: item.sentence,
    created_at: item.createdAt,
    book: item.bookTitle ? { title: item.bookTitle } : null,
    definitions: null,
    definition_status: null,
  }));
}

function waitingQuotes(): SavedQuote[] {
  return readOutbox("quote").map((item) => ({
    id: item.id,
    body: item.body,
    created_at: item.createdAt,
    book: item.bookTitle ? { title: item.bookTitle, author: item.bookAuthor ?? "" } : null,
  }));
}

function withWaiting<T extends { id: string }>(waiting: T[], saved: T[]): T[] {
  const ids = new Set(waiting.map((entry) => entry.id));
  return [...waiting.reverse(), ...saved.filter((entry) => !ids.has(entry.id))];
}

export function Search() {
  const [query, setQuery] = useState("");
  const [words, setWords] = useState<SavedWord[]>(() => withWaiting(waitingWords(), readCachedWords() ?? []));
  const [quotes, setQuotes] = useState<SavedQuote[]>(() => withWaiting(waitingQuotes(), readCachedQuotes() ?? []));
  const [books, setBooks] = useState<Book[]>([]);
  const [usingCopy, setUsingCopy] = useState(false);

  useEffect(() => {
    let current = true;
    // Each list refreshes on its own, so one failing still leaves the others up to date.
    // Fresh lists are saved to the phone too, so the next search without signal finds them.
    listWords().then(
      (list) => {
        // Not after the screen has closed, as sign-out may have just cleared the copy.
        if (!current) return;
        cacheWords(list);
        setWords(withWaiting(waitingWords(), list));
      },
      () => current && setUsingCopy(true),
    );
    listQuotes().then(
      (list) => {
        // Not after the screen has closed, as sign-out may have just cleared the copy.
        if (!current) return;
        cacheQuotes(list);
        setQuotes(withWaiting(waitingQuotes(), list));
      },
      () => current && setUsingCopy(true),
    );
    listBooks().then(
      (list) => current && setBooks(list),
      () => current && setUsingCopy(true),
    );
    return () => {
      current = false;
    };
  }, []);

  const groups = useMemo(() => groupWords(words), [words]);
  const results = useMemo(() => search(query, groups, quotes, books), [query, groups, quotes, books]);
  const searching = query.trim().length > 0;
  const found = results.words.length + results.quotes.length;

  return (
    <section className="search" aria-label="Search">
      <label htmlFor="search">Search words, sentences, quotes, books and authors</label>
      <input
        id="search"
        className="field"
        type="search"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {usingCopy && <p className="saved">Searching the copy saved on this phone, as some lists couldn't be refreshed.</p>}

      {searching && (
        <p className="saved" role="status">
          {found === 0 ? `Nothing found for “${query.trim()}”.` : `${found} ${found === 1 ? "result" : "results"}`}
        </p>
      )}

      {results.words.length > 0 && (
        <div>
          <h2 className="section">Words</h2>
          <ol className="entries">
            {results.words.map((group) => (
              <li key={group.key}>
                <span className="headword">{group.key}</span>
                <time dateTime={group.latest}>{savedOn.format(new Date(group.latest))}</time>
                {group.typedForms.length > 0 && <span className="source">You typed {group.typedForms.join(", ")}</span>}
                {group.word.definitions?.meanings[0]?.definitions[0] && (
                  <span className="search-meaning">{group.word.definitions.meanings[0].definitions[0].definition}</span>
                )}
                {group.readings.map((reading) => (
                  <span className="search-sentence" key={reading.id}>{reading.sentence}</span>
                ))}
                {group.bookTitles.length > 0 && <cite className="source">{group.bookTitles.join(", ")}</cite>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {results.quotes.length > 0 && (
        <div>
          <h2 className="section">Quotes</h2>
          <ol className="quotes">
            {results.quotes.map((quote) => (
              <li key={quote.id}>
                <blockquote>{quote.body}</blockquote>
                {quote.book && (
                  <p className="source">
                    <cite>{quote.book.title}</cite> by {quote.book.author}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
