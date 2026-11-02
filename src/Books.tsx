import { useEffect, useState, type FormEvent } from "react";
import { addBook, listBooks, setCurrentBook, type Book } from "./lib/api";

type BooksProps = {
  currentId: string | null;
  onChosen: (book: Book) => void;
  onBack: () => void;
};

export function Books({ currentId, onChosen, onBack }: BooksProps) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    listBooks().then(
      (list) => current && setBooks(list),
      () => current && setError("Your books didn't load. Check your connection and try again."),
    );
    return () => {
      current = false;
    };
  }, []);

  async function choose(book: Book) {
    setBusy(true);
    setError("");
    try {
      await setCurrentBook(book.id);
      onChosen(book);
    } catch {
      setError("Your current book didn't change. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanAuthor = author.trim();
    if (!cleanTitle || !cleanAuthor) {
      setError("Enter the book's title and author.");
      return;
    }
    setBusy(true);
    setError("");
    let book: Book;
    try {
      book = await addBook(cleanTitle, cleanAuthor);
    } catch {
      setError("The book wasn't added. Check your connection and try again.");
      setBusy(false);
      return;
    }
    setBooks((list) => [book, ...(list ?? [])]);
    setTitle("");
    setAuthor("");
    await choose(book);
  }

  return (
    <main className="page">
      <h1 className="title">Your books</h1>
      <button type="button" className="quiet" onClick={onBack}>Back to words</button>

      {books && books.length > 0 && (
        <ul className="books">
          {books.map((book) => (
            <li key={book.id}>
              <button
                type="button"
                className="book"
                disabled={busy}
                aria-current={book.id === currentId ? "true" : undefined}
                onClick={() => choose(book)}
              >
                <span className="book-title">{book.title}</span>
                <span className="book-author">{book.author}</span>
                {book.id === currentId && <span className="book-current">Reading now</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="stack add-book" onSubmit={add}>
        <h2 className="section">Add a book</h2>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          className="field"
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor="author">Author</label>
        <input
          id="author"
          className="field"
          autoComplete="off"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
        />
        <button className="primary" disabled={busy}>Add book</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
