import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { addWord, defineWord, keepAsTyped, listWords, saveDefinitions, type Book, type SavedWord } from "./lib/api";
import { cacheWords, readCachedWords } from "./lib/cache";
import { savedOn } from "./lib/dates";
import { checkWord } from "./lib/word";
import { needsSpellingCheck, SpellingCheck } from "./SpellingCheck";
import { WordPage } from "./WordPage";

export function Words({ book }: { book: Book | null | undefined }) {
  const [words, setWords] = useState<SavedWord[] | null>(readCachedWords);
  const [openId, setOpenId] = useState<string | null>(null);
  const [failedLookups, setFailedLookups] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lookingUp = useRef(new Set<string>());

  const openWord = words?.find((entry) => entry.id === openId);

  useEffect(() => {
    let current = true;
    listWords().then(
      (list) => {
        if (current) setWords(list);
      },
      () => {
        if (!current) return;
        if (readCachedWords()) setNotice("You're seeing your saved copy, because your words couldn't be refreshed.");
        else setError("Your words didn't load. Check your connection and reopen the app.");
      },
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (words) cacheWords(words);
  }, [words]);

  // A chosen spelling is stored like a base form, so "ephemeral" shows with "You typed ephemral".
  const lookUp = useCallback(async (entry: SavedWord, chosenSpelling?: string) => {
    if (lookingUp.current.has(entry.id)) return;
    lookingUp.current.add(entry.id);
    setFailedLookups((failed) => {
      const next = new Set(failed);
      next.delete(entry.id);
      return next;
    });
    try {
      const result = await defineWord(chosenSpelling ?? entry.word);
      // A chosen spelling the dictionaries can't define leaves the word as it was, with its suggestions.
      if (chosenSpelling && result.status !== "found") throw new Error("No definition for the chosen spelling");
      const definitions = result.status === "found" ? result.definitions : null;
      const baseForm = (result.status === "found" && result.baseForm) || chosenSpelling || null;
      const suggestions = result.status === "not_found" ? (result.suggestions ?? []) : null;
      await saveDefinitions(entry.id, result.status, definitions, baseForm, suggestions);
      setWords((list) =>
        (list ?? []).map((item) =>
          item.id === entry.id
            ? { ...item, definitions, definition_status: result.status, base_form: baseForm, spelling_suggestions: suggestions }
            : item,
        ),
      );
    } catch {
      setFailedLookups((failed) => new Set(failed).add(entry.id));
    } finally {
      lookingUp.current.delete(entry.id);
    }
  }, []);

  const keep = useCallback(async (entry: SavedWord) => {
    setFailedLookups((failed) => {
      const next = new Set(failed);
      next.delete(entry.id);
      return next;
    });
    try {
      await keepAsTyped(entry.id);
      setWords((list) => (list ?? []).map((item) => (item.id === entry.id ? { ...item, kept_as_typed: true } : item)));
    } catch {
      setFailedLookups((failed) => new Set(failed).add(entry.id));
    }
  }, []);

  // Words saved before lookups or suggestions existed, or while a lookup failed, fill in when opened.
  const needsLookup =
    openWord !== undefined &&
    !failedLookups.has(openWord.id) &&
    (openWord.definition_status === null ||
      (openWord.definition_status === "not_found" && !openWord.kept_as_typed && openWord.spelling_suggestions == null));
  useEffect(() => {
    if (needsLookup && openWord) void lookUp(openWord);
  }, [needsLookup, openWord, lookUp]);

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
      void lookUp(word);
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

      {openWord && (
        <WordPage
          word={openWord}
          lookupFailed={failedLookups.has(openWord.id)}
          onRetry={() => void lookUp(openWord)}
          onChoose={(suggestion) => void lookUp(openWord, suggestion)}
          onKeep={() => void keep(openWord)}
          onBack={() => setOpenId(null)}
        />
      )}

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
        {notice && <p className="saved">{notice}</p>}

        {words?.length === 0 && <p className="empty">Your words will appear here. Save the first one you meet in your book.</p>}
        {words && words.length > 0 && (
          <ol className="entries">
            {words.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="headword" onClick={() => setOpenId(entry.id)}>
                  {entry.base_form ?? entry.word}
                </button>
                <time dateTime={entry.created_at}>{savedOn.format(new Date(entry.created_at))}</time>
                {entry.base_form && <span className="source">You typed {entry.word}</span>}
                {entry.definition_status === "not_found" && (
                  <span className="word-flag">{entry.kept_as_typed ? "Not in the dictionary" : "Check this word"}</span>
                )}
                {entry.book && <cite className="source">{entry.book.title}</cite>}
                {needsSpellingCheck(entry) && (
                  <SpellingCheck
                    word={entry}
                    failed={failedLookups.has(entry.id)}
                    onChoose={(suggestion) => void lookUp(entry, suggestion)}
                    onKeep={() => void keep(entry)}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
