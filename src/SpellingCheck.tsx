import type { SavedWord } from "./lib/api";

type SpellingCheckProps = {
  word: SavedWord;
  failed: boolean;
  onChoose: (suggestion: string) => void;
  onKeep: () => void;
};

export function needsSpellingCheck(word: SavedWord): boolean {
  return word.definition_status === "not_found" && !word.kept_as_typed;
}

export function SpellingCheck({ word, failed, onChoose, onKeep }: SpellingCheckProps) {
  const suggestions = word.spelling_suggestions ?? [];
  return (
    <div className="spelling">
      {suggestions.length > 0 && (
        <div className="suggestions">
          <span>Did you mean</span>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="suggestion" onClick={() => onChoose(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="quiet" onClick={onKeep} aria-label={`Keep ${word.word} as typed`}>
        Keep as typed
      </button>
      {failed && <p className="spelling-error" role="alert">That didn't save. Check your connection and try again.</p>}
    </div>
  );
}
