import { useEffect, useState } from "react";
import { Books } from "./Books";
import { getCurrentBook, signOut, type Book } from "./lib/api";
import { Quotes } from "./Quotes";
import { Words } from "./Words";

type Section = "words" | "quotes";

export function Home() {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [choosingBook, setChoosingBook] = useState(false);
  const [section, setSection] = useState<Section>("words");
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    getCurrentBook().then(
      (found) => current && setBook(found),
      () => current && setError("Your current book didn't load. Check your connection and reopen the app."),
    );
    return () => {
      current = false;
    };
  }, []);

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
        </nav>

        {error && <p className="error" role="alert">{error}</p>}

        <div hidden={section !== "words"}>
          <Words book={book} />
        </div>
        <div hidden={section !== "quotes"}>
          <Quotes book={book} />
        </div>

        <button className="quiet leave" onClick={leave}>Sign out</button>
      </main>
    </>
  );
}
