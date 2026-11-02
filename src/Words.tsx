import { useEffect, useRef, useState, type FormEvent } from "react";
import { addWord, listWords, type Book, type SavedWord } from "./lib/api";
import { savedOn } from "./lib/dates";
import { checkWord } from "./lib/word";
import { WordPage } from "./WordPage";

export function Words({ book }: { book: Book | null | undefined }) {
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const openWord = words?.find((entry) => entry.id === openId);

  useEffect(() => {
    let current = true;
    listWords().then(
      (list) => current && setWords(list),
      () => current && setError("Your words didn't load. Check your connection and reopen the app."),
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
      const word = await addWord(check.word, book?.id ?? null, sentence.trim() || null);
      setWords((list) => [word, ...(list ?? [])]);
      setDraft("");
      setSentence("");
      setSaved(`Saved ${word.word}`);
    } catch {
      setError("The word wasn't saved. Check your connection and try again.");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <>
      {words && (
        <div className="ribbon" aria-label={`${words.length} ${words.length === 1 ? "word" : "words"} saved`}>
          {words.length}
        </div>
      )}

      {openWord && <WordPage word={openWord} onBack={() => setOpenId(null)} />}

      {/* Stays mounted behind a word's page, so nothing typed is lost. */}
      <div hidden={Boolean(openWord)}>
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
          <label htmlFor="sentence">Sentence from the book (optional)</label>
          <textarea
            id="sentence"
            className="sentence-field"
            rows={2}
            autoCapitalize="sentences"
            autoCorrect="off"
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
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
                <button type="button" className="headword" onClick={() => setOpenId(entry.id)}>
                  {entry.word}
                </button>
                <time dateTime={entry.created_at}>{savedOn.format(new Date(entry.created_at))}</time>
                {entry.book && <cite className="source">{entry.book.title}</cite>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
