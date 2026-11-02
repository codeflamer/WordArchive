import type { SavedWord } from "./lib/api";
import { savedOn } from "./lib/dates";
import type { Meaning } from "./lib/definitions";
import { needsSpellingCheck, SpellingCheck } from "./SpellingCheck";

type WordPageProps = {
  word: SavedWord;
  lookupFailed: boolean;
  onRetry: () => void;
  onChoose: (suggestion: string) => void;
  onKeep: () => void;
  onBack: () => void;
};

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

function Definitions({ word, lookupFailed, onRetry, onChoose, onKeep }: Omit<WordPageProps, "onBack">) {
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

export function WordPage({ word, lookupFailed, onRetry, onChoose, onKeep, onBack }: WordPageProps) {
  return (
    <article className="word-page">
      <button type="button" className="quiet" onClick={onBack}>Back to words</button>
      <h2 className="word-page-title">{word.base_form ?? word.word}</h2>
      {word.base_form && <p className="source">You typed {word.word}</p>}
      <p className="source">
        {word.book && (
          <>
            <cite>{word.book.title}</cite>,{" "}
          </>
        )}
        saved <time dateTime={word.created_at}>{savedOn.format(new Date(word.created_at))}</time>
      </p>
      {word.sentence ? (
        <blockquote className="word-sentence">{word.sentence}</blockquote>
      ) : (
        <p className="empty">No book sentence saved with this word.</p>
      )}
      <Definitions word={word} lookupFailed={lookupFailed} onRetry={onRetry} onChoose={onChoose} onKeep={onKeep} />
    </article>
  );
}
