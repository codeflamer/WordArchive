import { useEffect, useState } from "react";
import { getQuoteOfTheDay, type SavedQuote } from "./lib/api";
import { localDay } from "./lib/dates";

// A bonus after review, so with no quotes or no signal it simply stays away.
export function QuoteOfTheDay() {
  const [quote, setQuote] = useState<SavedQuote | null>(null);

  useEffect(() => {
    let current = true;
    getQuoteOfTheDay(localDay(new Date())).then(
      (found) => {
        if (current) setQuote(found);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);

  if (!quote) return null;
  return (
    <section className="daily-quote" aria-label="Quote of the day">
      <h2 className="ai-heading">Quote of the day</h2>
      <blockquote>{quote.body}</blockquote>
      {quote.book && (
        <p className="source">
          <cite>{quote.book.title}</cite> by {quote.book.author}
        </p>
      )}
    </section>
  );
}
