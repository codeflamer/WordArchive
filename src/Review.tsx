import { useEffect, useState } from "react";
import type { Grade } from "ts-fsrs";
import { listReviews, listWords, recordReview } from "./lib/api";
import { groupWords } from "./lib/groups";
import { comesBackToday, dueWords, previewWaits, rate, RATINGS, SESSION_LIMIT, splitOnWord, splitSession, type DueWord } from "./lib/review";
import { QuoteOfTheDay } from "./QuoteOfTheDay";
import { MeaningList } from "./WordPage";

function Sentence({ text, forms }: { text: string; forms: string[] }) {
  return (
    <blockquote className="word-sentence">
      {splitOnWord(text, forms).map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part))}
    </blockquote>
  );
}

function Answer({ due }: { due: DueWord }) {
  const { word, readings } = due.group;
  const meaning = readings.at(-1)?.chosenMeaning ?? word.ai_content?.chosenMeaning;
  return (
    <>
      {meaning && (
        <section className="ai-help" aria-label="Written by AI">
          <p className="ai-label">Written by AI, so check it against the definitions</p>
          <h3 className="ai-heading">In your sentence, it means</h3>
          <p className="ai-meaning">
            <em>{meaning.partOfSpeech}.</em> {meaning.definition}
          </p>
        </section>
      )}
      {word.definitions && (
        <section className="definitions" aria-label="Definitions">
          <MeaningList meanings={word.definitions.meanings} />
          <p className="attribution">
            Source: <a href={word.definitions.sourceUrl} target="_blank" rel="noreferrer">{word.definitions.source}</a>, CC BY-SA
          </p>
        </section>
      )}
    </>
  );
}

export function Review() {
  const [queue, setQueue] = useState<DueWord[] | null>(null);
  const [later, setLater] = useState<DueWord[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([listWords(), listReviews()]).then(
      ([words, reviews]) => {
        if (!current) return;
        const { session, later: rest } = splitSession(dueWords(groupWords(words), reviews, new Date()));
        setQueue(session);
        setLater(rest);
      },
      () => {
        if (current) setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, []);

  async function answer(due: DueWord, grade: Grade) {
    setSaving(true);
    setSaveFailed(false);
    const card = rate(due.card, grade, new Date());
    try {
      await recordReview(due.group.key, grade, card);
      setReviewed((words) => new Set(words).add(due.group.key));
      // Words still being learned go to the back, so the others come first.
      setQueue((words) => [...(words ?? []).slice(1), ...(comesBackToday(card) ? [{ group: due.group, card }] : [])]);
      setFlipped(false);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function startNextSession() {
    const { session, later: rest } = splitSession(later);
    setQueue(session);
    setLater(rest);
    setReviewed(new Set());
  }

  if (loadFailed) return <p className="error" role="alert">Your review didn't load. Check your connection and try again.</p>;
  if (!queue) return <p className="empty" role="status">Finding your due words…</p>;

  const due = queue[0];
  if (!due) {
    return (
      <>
        {reviewed.size > 0 ? (
          <div className="review-done">
            <p className="empty" role="status">
              Review finished. You went through {reviewed.size} {reviewed.size === 1 ? "word" : "words"}.
              {later.length > 0 && ` ${later.length} more ${later.length === 1 ? "is" : "are"} due and will wait for your next session.`}
            </p>
            {later.length > 0 && (
              <button type="button" className="quiet" onClick={startNextSession}>
                Review {Math.min(later.length, SESSION_LIMIT)} more now
              </button>
            )}
          </div>
        ) : (
          <p className="empty" role="status">No words are due. Words you save will appear here.</p>
        )}
        <QuoteOfTheDay />
      </>
    );
  }

  const { group } = due;
  const reading = group.readings.at(-1);
  const waits = flipped ? previewWaits(due.card, new Date()) : null;

  return (
    <article className="review" aria-label="Review card">
      <p className="review-left" role="status">
        {queue.length} left in this session{later.length > 0 && `, ${later.length} more for later`}
      </p>
      <h2 className="word-page-title">{group.key}</h2>
      {reading ? (
        <figure className="word-reading">
          <Sentence text={reading.sentence} forms={[group.key, ...group.typedForms]} />
          {reading.bookTitle && <figcaption><cite className="source">{reading.bookTitle}</cite></figcaption>}
        </figure>
      ) : (
        <p className="empty">No book sentence saved with this word.</p>
      )}

      {waits ? (
        <>
          <Answer due={due} />
          <div className="ratings" role="group" aria-label="How well did you know it?">
            {RATINGS.map(({ grade, label }) => (
              <button
                key={grade}
                type="button"
                className="rating"
                disabled={saving}
                aria-label={`${label}, next review in ${waits[grade]}`}
                onClick={() => void answer(due, grade)}
              >
                {label}
                <span className="rating-wait">{waits[grade]}</span>
              </button>
            ))}
          </div>
          {saveFailed && <p className="error" role="alert">Your rating wasn't saved. Check your connection and try again.</p>}
        </>
      ) : (
        <button type="button" className="primary" onClick={() => setFlipped(true)}>Show meaning</button>
      )}
    </article>
  );
}
