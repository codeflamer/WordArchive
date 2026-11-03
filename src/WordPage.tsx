import { useState } from "react";
import type { SavedWord } from "./lib/api";
import { playWord } from "./lib/speak";
import { savedOn } from "./lib/dates";
import { dictionaryExamples, type Meaning } from "./lib/definitions";
import type { Reading } from "./lib/groups";
import { needsSpellingCheck, SpellingCheck } from "./SpellingCheck";

type WordPageProps = {
  word: SavedWord;
  bookTitles: string[];
  typedForms: string[];
  readings: Reading[];
  lookupFailed: boolean;
  aiFailed: boolean;
  onRetryAi: () => void;
  onRetry: () => void;
  onChoose: (suggestion: string) => void;
  onKeep: () => void;
  onBack: () => void;
};

function Pronounce({ word }: { word: SavedWord }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const shown = word.base_form ?? word.word;

  async function play() {
    setFailed(false);
    setPlaying(true);
    const result = await playWord(shown, word.pronunciation?.audio);
    setPlaying(false);
    setFailed(result === "failed");
  }

  return (
    <div className="pronounce">
      {word.pronunciation?.text && <span className="phonetic">{word.pronunciation.text}</span>}
      <button type="button" className="play" disabled={playing} aria-label={`Play pronunciation of ${shown}`} onClick={() => void play()}>
        {playing ? "Playing…" : "Play pronunciation"}
      </button>
      {failed && (
        <p className="play-error" role="alert">
          The sound didn't play. Check your connection and your volume, then try again.
        </p>
      )}
    </div>
  );
}

function ChosenMeanings({ readings, fallback }: { readings: Reading[]; fallback: Reading["chosenMeaning"] }) {
  if (readings.length > 1) {
    const chosen = readings.filter((reading) => reading.chosenMeaning);
    if (chosen.length === 0) return null;
    return (
      <div>
        <h3 className="ai-heading">In your sentences, it means</h3>
        <ul className="ai-readings">
          {chosen.map((reading) => (
            <li key={reading.id}>
              <span className="ai-quote">“{reading.sentence}”</span>
              <span className="ai-meaning">
                <em>{reading.chosenMeaning?.partOfSpeech}.</em> {reading.chosenMeaning?.definition}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const meaning = readings[0]?.chosenMeaning ?? fallback;
  if (!meaning) return null;
  return (
    <div>
      <h3 className="ai-heading">In your sentence, it means</h3>
      <p className="ai-meaning">
        <em>{meaning.partOfSpeech}.</em> {meaning.definition}
      </p>
    </div>
  );
}

function AiHelp({ word, readings, aiFailed, onRetryAi }: { word: SavedWord; readings: Reading[]; aiFailed: boolean; onRetryAi: () => void }) {
  const content = word.ai_content;
  if (!content && !aiFailed) return <p className="empty" role="status">Writing examples…</p>;
  if (!content) {
    const examples = dictionaryExamples(word.definitions);
    return (
      <section className="ai-missing" aria-label="Incomplete">
        <p className="word-flag">Incomplete</p>
        <p className="ai-label">AI examples aren't available right now. Your word and its definitions are saved.</p>
        <button type="button" className="play" onClick={onRetryAi}>Try AI again</button>
        {examples.length > 0 ? (
          <div>
            <h3 className="ai-heading">Examples from the dictionary</h3>
            <ol>
              {examples.map((example, index) => (
                <li key={index}>{example}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="ai-label">The dictionary has no examples for this word.</p>
        )}
      </section>
    );
  }
  return (
    <section className="ai-help" aria-label="Written by AI">
      <p className="ai-label">Written by AI, so check it against the definitions</p>
      <ChosenMeanings readings={readings} fallback={content.chosenMeaning} />
      <div>
        <h3 className="ai-heading">3 examples</h3>
        <ol>
          {content.examples.map((example, index) => (
            <li key={index}>{example}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function MeaningList({ meanings }: { meanings: Meaning[] }) {
  return (
    <>
      {meanings.map((meaning, index) => (
        <div key={`${meaning.partOfSpeech}-${index}`}>
          <h3 className="part-of-speech">{meaning.partOfSpeech}</h3>
          <ol>
            {meaning.definitions.map((item, itemIndex) => (
              <li key={itemIndex}>
                {item.definition}
                {item.example && <p className="example">{item.example}</p>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}

function Definitions({ word, lookupFailed, onRetry, onChoose, onKeep }: Pick<WordPageProps, "word" | "lookupFailed" | "onRetry" | "onChoose" | "onKeep">) {
  if (word.definition_status === "found" && word.definitions) {
    const { meanings, typedMeanings, source, sourceUrl } = word.definitions;
    return (
      <section className="definitions" aria-label="Definitions">
        <MeaningList meanings={meanings} />
        {typedMeanings && (
          <>
            <h3 className="typed-heading">Meanings of “{word.word}” itself</h3>
            <MeaningList meanings={typedMeanings} />
          </>
        )}
        <p className="attribution">
          Source: <a href={sourceUrl} target="_blank" rel="noreferrer">{source}</a>, CC BY-SA
        </p>
      </section>
    );
  }
  if (word.definition_status === "not_found") {
    return (
      <>
        <p className="empty">No dictionary definition found for this word.</p>
        {needsSpellingCheck(word) && <SpellingCheck word={word} failed={lookupFailed} onChoose={onChoose} onKeep={onKeep} />}
      </>
    );
  }
  if (lookupFailed) {
    return (
      <div className="lookup-failed">
        <p role="alert">The definition didn't load. Check your connection and try again.</p>
        <button type="button" className="primary" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  return <p className="empty" role="status">Looking up this word…</p>;
}

export function WordPage({ word, bookTitles, typedForms, readings, lookupFailed, aiFailed, onRetryAi, onRetry, onChoose, onKeep, onBack }: WordPageProps) {
  return (
    <article className="word-page">
      <button type="button" className="quiet" onClick={onBack}>Back to words</button>
      <h2 className="word-page-title">{word.base_form ?? word.word}</h2>
      <Pronounce key={word.id} word={word} />
      {typedForms.length > 0 && <p className="source">You typed {typedForms.join(", ")}</p>}
      <p className="source">
        {bookTitles.length > 0 && (
          <>
            <cite>{bookTitles.join(", ")}</cite>,{" "}
          </>
        )}
        first saved <time dateTime={word.created_at}>{savedOn.format(new Date(word.created_at))}</time>
      </p>
      {readings.length > 0 ? (
        readings.map((reading) => (
          <figure className="word-reading" key={reading.id}>
            <blockquote className="word-sentence">{reading.sentence}</blockquote>
            {bookTitles.length > 1 && reading.bookTitle && <figcaption><cite className="source">{reading.bookTitle}</cite></figcaption>}
          </figure>
        ))
      ) : (
        <p className="empty">No book sentence saved with this word.</p>
      )}
      {word.definition_status === "found" && <AiHelp word={word} readings={readings} aiFailed={aiFailed} onRetryAi={onRetryAi} />}
      <Definitions word={word} lookupFailed={lookupFailed} onRetry={onRetry} onChoose={onChoose} onKeep={onKeep} />
    </article>
  );
}
