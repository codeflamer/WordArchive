import type { SavedWord } from "./lib/api";
import { savedOn } from "./lib/dates";

export function WordPage({ word, onBack }: { word: SavedWord; onBack: () => void }) {
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
    </article>
  );
}
