import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  addWord,
  defineWord,
  explainWord,
  keepAsTyped,
  listWords,
  pronounceWord,
  saveAiContent,
  saveDefinitions,
  savePronunciation,
  type Book,
  type SavedWord,
} from "./lib/api";
import { cacheWords, readCachedWords } from "./lib/cache";
import { savedOn } from "./lib/dates";
import { groupWords } from "./lib/groups";
import { checkWord } from "./lib/word";
import { needsSpellingCheck, SpellingCheck } from "./SpellingCheck";
import { WordPage } from "./WordPage";

export function Words({ book }: { book: Book | null | undefined }) {
  const [words, setWords] = useState<SavedWord[] | null>(readCachedWords);
  const [openId, setOpenId] = useState<string | null>(null);
  const [failedLookups, setFailedLookups] = useState<ReadonlySet<string>>(new Set());
  const [aiTried, setAiTried] = useState<ReadonlySet<string>>(new Set());
  const [aiFailed, setAiFailed] = useState<ReadonlySet<string>>(new Set());
  const [pronunciationTried, setPronunciationTried] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lookingUp = useRef(new Set<string>());
  const explaining = useRef(new Set<string>());

  const groups = useMemo(() => groupWords(words ?? []), [words]);
  // Found by row, so the page stays open when a chosen spelling changes which group the word belongs to.
  const openGroup = groups.find((group) => group.rows.some((row) => row.id === openId));
  const openWord = openGroup?.word;

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

  // Runs after the definitions are saved, so an AI failure can't affect them.
  const explain = useCallback(async (entry: SavedWord) => {
    if (explaining.current.has(entry.id) || !entry.definitions) return;
    explaining.current.add(entry.id);
    setAiTried((tried) => new Set(tried).add(entry.id));
    setAiFailed((failed) => {
      const next = new Set(failed);
      next.delete(entry.id);
      return next;
    });
    try {
      const content = await explainWord(entry.base_form ?? entry.word, entry.sentence, entry.definitions);
      await saveAiContent(entry.id, content);
      setWords((list) => (list ?? []).map((item) => (item.id === entry.id ? { ...item, ai_content: content } : item)));
    } catch {
      setAiFailed((failed) => new Set(failed).add(entry.id));
    } finally {
      explaining.current.delete(entry.id);
    }
  }, []);

  // A chosen spelling is stored like a base form, so "ephemeral" shows with "You typed ephemral".
  // Other saves of the same word change with it, or a corrected typo would split back into two entries.
  const lookUp = useCallback(async (entry: SavedWord, chosenSpelling?: string, others: SavedWord[] = []) => {
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
      if (result.status === "found") void explain({ ...entry, definitions, base_form: baseForm });
      const saved = await Promise.allSettled(others.map((other) => saveDefinitions(other.id, result.status, definitions, baseForm, suggestions)));
      const updated = new Set(others.filter((_, index) => saved.at(index)?.status === "fulfilled").map((other) => other.id));
      setWords((list) =>
        (list ?? []).map((item) =>
          updated.has(item.id)
            ? { ...item, definitions, definition_status: result.status, base_form: baseForm, spelling_suggestions: suggestions }
            : item,
        ),
      );
      if (result.status === "found") {
        for (const other of others) {
          if (other.sentence && updated.has(other.id)) void explain({ ...other, definitions, base_form: baseForm });
        }
      }
    } catch {
      setFailedLookups((failed) => new Set(failed).add(entry.id));
    } finally {
      lookingUp.current.delete(entry.id);
    }
  }, [explain]);

  // A repeat reuses what's already saved, so only a new sentence needs AI.
  const reuse = useCallback(async (entry: SavedWord, source: SavedWord) => {
    try {
      const status = source.definition_status ?? "not_found";
      const baseForm = source.base_form ?? null;
      const suggestions = source.spelling_suggestions ?? null;
      await saveDefinitions(entry.id, status, source.definitions, baseForm, suggestions);
      setWords((list) =>
        (list ?? []).map((item) =>
          item.id === entry.id
            ? { ...item, definitions: source.definitions, definition_status: status, base_form: baseForm, spelling_suggestions: suggestions }
            : item,
        ),
      );
      if (status === "found" && entry.sentence) void explain({ ...entry, definitions: source.definitions, base_form: baseForm });
    } catch {
      setFailedLookups((failed) => new Set(failed).add(entry.id));
    }
  }, [explain]);

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

  // Words defined before AI existed get their examples when opened, once per visit.
  const needsAi =
    openWord !== undefined && openWord.definition_status === "found" && !openWord.ai_content && !aiTried.has(openWord.id);
  useEffect(() => {
    if (needsAi && openWord) void explain(openWord);
  }, [needsAi, openWord, explain]);

  // A repeat whose copy of the saved details failed picks them up when the word is next opened.
  const repeatsNeedingDetails = openGroup && openWord?.definition_status
    ? openGroup.rows.filter((row) => row.definition_status === null && !failedLookups.has(row.id))
    : [];
  const repeatIds = repeatsNeedingDetails.map((row) => row.id).join(" ");
  useEffect(() => {
    if (repeatIds && openWord) repeatsNeedingDetails.forEach((row) => void reuse(row, openWord));
    // Runs when the list of rows changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatIds, reuse]);

  // Each sentence gets its own meaning, as one word can mean different things in different books.
  const sentencesNeedingAi = (openGroup?.rows ?? []).filter(
    (row) => row.definition_status === "found" && row.sentence && !row.ai_content && !aiTried.has(row.id),
  );
  const sentenceIds = sentencesNeedingAi.map((row) => row.id).join(" ");
  useEffect(() => {
    if (sentenceIds) sentencesNeedingAi.forEach((row) => void explain(row));
    // Runs when the list of rows changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentenceIds, explain]);

  // Fetched on opening, so a recording is ready when play is tapped. A failure just leaves the phone's own voice.
  const needsPronunciation =
    openWord !== undefined && openWord.definition_status === "found" && !openWord.pronunciation && !pronunciationTried.has(openWord.id);
  const pronouncingId = needsPronunciation ? openWord.id : null;
  const pronouncingWord = needsPronunciation ? (openWord.base_form ?? openWord.word) : null;
  useEffect(() => {
    if (!pronouncingId || !pronouncingWord) return;
    setPronunciationTried((tried) => new Set(tried).add(pronouncingId));
    pronounceWord(pronouncingWord)
      .then(async (pronunciation) => {
        await savePronunciation(pronouncingId, pronunciation);
        setWords((list) => (list ?? []).map((item) => (item.id === pronouncingId ? { ...item, pronunciation } : item)));
      })
      .catch(() => {});
  }, [pronouncingId, pronouncingWord]);

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
      const existing = groups.find((group) => group.key === check.word || group.rows.some((row) => row.word === check.word));
      const word = await addWord(check.word, book?.id ?? null, sentence.trim() || null);
      setWords((list) => [word, ...(list ?? [])]);
      setDraft("");
      setSentence("");
      if (existing && existing.word.definition_status !== null) {
        setSaved(`Added to ${existing.key}`);
        void reuse(word, existing.word);
      } else {
        setSaved(`Saved ${word.word}`);
        void lookUp(word);
      }
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
        <div className="ribbon" aria-label={`${groups.length} ${groups.length === 1 ? "word" : "words"} saved`}>
          {groups.length}
        </div>
      )}

      {openGroup && openWord && (
        <WordPage
          word={openWord}
          bookTitles={openGroup.bookTitles}
          typedForms={openGroup.typedForms}
          readings={openGroup.readings}
          lookupFailed={failedLookups.has(openWord.id)}
          aiFailed={aiFailed.has(openWord.id)}
          onRetryAi={() => void explain(openWord)}
          onRetry={() => void lookUp(openWord)}
          onChoose={(suggestion) => void lookUp(openWord, suggestion, openGroup.rows.filter((row) => row.id !== openWord.id))}
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
        {groups.length > 0 && (
          <ol className="entries">
            {groups.map(({ key, word: entry, rows, bookTitles, typedForms, latest }) => (
              <li key={key}>
                <button type="button" className="headword" onClick={() => setOpenId(entry.id)}>
                  {key}
                </button>
                <time dateTime={latest}>{savedOn.format(new Date(latest))}</time>
                {typedForms.length > 0 && <span className="source">You typed {typedForms.join(", ")}</span>}
                {entry.definition_status === "not_found" && (
                  <span className="word-flag">{entry.kept_as_typed ? "Not in the dictionary" : "Check this word"}</span>
                )}
                {entry.definition_status === "found" && !entry.ai_content && (aiFailed.has(entry.id) || !aiTried.has(entry.id)) && (
                  <span className="word-flag">Incomplete</span>
                )}
                {bookTitles.length > 0 && <cite className="source">{bookTitles.join(", ")}</cite>}
                {needsSpellingCheck(entry) && (
                  <SpellingCheck
                    word={entry}
                    failed={failedLookups.has(entry.id)}
                    onChoose={(suggestion) => void lookUp(entry, suggestion, rows.filter((row) => row.id !== entry.id))}
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
