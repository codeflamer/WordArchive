import type { SavedWord } from "./lib/api";
import { savedOn } from "./lib/dates";

type WordPageProps = {
  word: SavedWord;
  lookupFailed: boolean;
  onRetry: () => void;
  onBack: () => void;
};

function Definitions({ word, lookupFailed, onRetry }: Omit<WordPageProps, "onBack">) {
  if (word.definition_status === "found" && word.definitions) {
    return (
      <section className="definitions" aria-label="Definitions">
        {word.definitions.meanings.map((meaning, index) => (
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
        <p className="attribution">
          Source: <a href={word.definitions.sourceUrl} target="_blank" rel="noreferrer">{word.definitions.source}</a>, CC BY-SA
        </p>
      </section>
    );
  }
  if (word.definition_status === "not_found") {
    return <p className="empty">No dictionary definition found for this word.</p>;
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

export function WordPage({ word, lookupFailed, onRetry, onBack }: WordPageProps) {
  return (
    <article className="word-page">
      <button type="button" className="quiet" onClick={onBack}>Back to words</button>
      <h2 className="word-page-title">{word.word}</h2>
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
      <Definitions word={word} lookupFailed={lookupFailed} onRetry={onRetry} />
    </article>
  );
}
