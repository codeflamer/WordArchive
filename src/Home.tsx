import { useEffect, useState } from "react";
import { Books } from "./Books";
import { Export } from "./Export";
import { getCurrentBook, getLastChecked, signOut, type Book } from "./lib/api";
import { cacheBook, readCachedBook } from "./lib/cache";
import { savedOn } from "./lib/dates";
import { opensReview, REVIEW_PATH } from "./lib/link";
import { Quotes } from "./Quotes";
import { ReminderLink } from "./ReminderLink";
import { Review } from "./Review";
import { Search } from "./Search";
import { Words } from "./Words";

type Section = "words" | "quotes" | "review" | "search";

export function Home() {
  const [book, setBook] = useState<Book | null | undefined>(readCachedBook);
  const [choosingBook, setChoosingBook] = useState(false);
  // The daily reminder's link lands straight on the review.
  const [section, setSection] = useState<Section>(() => (opensReview(window.location.pathname) ? "review" : "words"));
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    // Only a status line, so if it can't load it's simply left out.
    getLastChecked().then(
      (time) => current && setLastChecked(time),
      () => {},
    );
    getCurrentBook().then(
      (found) => current && setBook(found),
      () => {
        // With a saved copy of the book, reading and saving carry on without signal.
        if (current && readCachedBook() === undefined) setError("Your current book didn't load. Check your connection and reopen the app.");
      },
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (book !== undefined) cacheBook(book);
  }, [book]);

  // Keeps the address in step with the tab, so reopening after leaving the review starts on the words.
  useEffect(() => {
    const path = section === "review" ? REVIEW_PATH : "/";
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [section]);

  async function leave() {
    setError("");
    try {
      await signOut();
    } catch {
      setError("You weren't signed out. Check your connection and try again.");
    }
  }

  return (
    <>
      {choosingBook && (
        <Books
          currentId={book?.id ?? null}
          onChosen={(chosen) => {
            setBook(chosen);
            setChoosingBook(false);
          }}
          onBack={() => setChoosingBook(false)}
        />
      )}
      {/* Stays mounted behind the books screen and between tabs, so nothing typed is lost. */}
      <main className="page" hidden={choosingBook}>
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

        <nav className="tabs" aria-label="Sections">
          <button type="button" aria-current={section === "words" ? "page" : undefined} onClick={() => setSection("words")}>
            Words
          </button>
          <button type="button" aria-current={section === "quotes" ? "page" : undefined} onClick={() => setSection("quotes")}>
            Quotes
          </button>
          <button type="button" aria-current={section === "review" ? "page" : undefined} onClick={() => setSection("review")}>
            Review
          </button>
          <button type="button" aria-current={section === "search" ? "page" : undefined} onClick={() => setSection("search")}>
            Search
          </button>
        </nav>

        {error && <p className="error" role="alert">{error}</p>}

        <div hidden={section !== "words"}>
          <Words book={book} />
        </div>
        <div hidden={section !== "quotes"}>
          <Quotes book={book} />
        </div>
        {/* Opens fresh each time, so it includes words saved since the last visit. */}
        {section === "review" && (
          <>
            <Review />
            <ReminderLink />
          </>
        )}
        {/* Also opens fresh, so new saves are searchable straight away. */}
        {section === "search" && <Search />}

        <Export />
        <button className="quiet leave" onClick={leave}>Sign out</button>
        {lastChecked && <p className="last-checked">Database last checked {savedOn.format(new Date(lastChecked))}</p>}
      </main>
    </>
  );
}
