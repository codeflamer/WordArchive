import { describe, expect, it } from "vitest";
import { Rating, type Grade } from "ts-fsrs";
import type { SavedWord } from "../src/lib/api";
import { groupWords } from "../src/lib/groups";
import { canReview, comesBackToday, dueWords, isDue, previewWaits, rate, SESSION_LIMIT, splitOnWord, splitSession, waitLabel, type StoredCard, type WordReview } from "../src/lib/review";

const definitions = { source: "Test", sourceUrl: "https://example.test", meanings: [] };
const saved = (word: string, created_at = "2026-11-01T10:00:00Z", extra: Partial<SavedWord> = {}): SavedWord => ({
  id: `${word}-${created_at}`,
  word,
  sentence: null,
  created_at,
  book: null,
  definitions,
  definition_status: "found",
  ...extra,
});
const groupOf = (...rows: SavedWord[]) => groupWords(rows)[0];
const at = (text: string) => new Date(text);

// Stored the way the database gives it back, with dates as text.
const stored = (card: unknown) => JSON.parse(JSON.stringify(card)) as StoredCard;
const reviewOf = (word_key: string, card: StoredCard): WordReview => ({
  word_key,
  card,
  due: new Date(card.due).toISOString(),
  last_review: new Date(card.last_review!).toISOString(),
});
function rateNew(grade: Grade, now: Date) {
  const [due] = dueWords(groupWords([saved("word")]), [], now);
  return stored(rate(due.card, grade, now));
}
const days = (from: StoredCard, now: Date) => (new Date(from.due).getTime() - now.getTime()) / 86400000;

describe("the review schedule", () => {
  const now = at("2026-11-05T12:00:00");

  it("brings a forgotten word back about a minute later, and an easy one days later", () => {
    const forgot = rateNew(Rating.Again, now);
    const easy = rateNew(Rating.Easy, now);
    expect(new Date(forgot.due).getTime() - now.getTime()).toBe(60000);
    expect(days(easy, now)).toBeGreaterThanOrEqual(3);
  });

  it("orders the four ratings from soonest to latest", () => {
    const dues = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((grade) => new Date(rateNew(grade as Grade, now).due).getTime());
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
    expect(new Set(dues).size).toBe(4);
  });

  it("keeps a word in today's session only while it's still being learned", () => {
    const [due] = dueWords(groupWords([saved("word")]), [], now);
    expect(comesBackToday(rate(due.card, Rating.Again, now))).toBe(true);
    expect(comesBackToday(rate(due.card, Rating.Easy, now))).toBe(false);
  });

  it("spaces a remembered word further apart over simulated weeks", () => {
    let card = rateNew(Rating.Good, now);
    let when = now;
    const gaps: number[] = [];
    for (let review = 0; review < 5; review += 1) {
      when = new Date(card.due);
      card = stored(rate(card, Rating.Good, when));
      gaps.push(days(card, when));
    }
    for (let index = 1; index < gaps.length; index += 1) expect(gaps[index]).toBeGreaterThan(gaps[index - 1]);
  });

  it("shortens the gap when a well-known word is forgotten, and it returns the same day", () => {
    let card = rateNew(Rating.Easy, now);
    const when = new Date(card.due);
    card = stored(rate(card, Rating.Again, when));
    expect(new Date(card.due).getTime() - when.getTime()).toBe(60000);
    expect(card.lapses).toBe(1);
  });

  it("gives the same date every time for the same rating", () => {
    expect(rateNew(Rating.Good, now).due).toBe(rateNew(Rating.Good, now).due);
  });

  it("describes the waits shown on the rating buttons", () => {
    const [due] = dueWords(groupWords([saved("word")]), [], now);
    const waits = previewWaits(due.card, now);
    expect(waits[Rating.Again]).toBe("1 min");
    expect(waits[Rating.Easy]).toMatch(/days$/);
    expect(waitLabel(at("2026-11-05T15:00:00"), now)).toBe("3 hr");
    expect(waitLabel(at("2026-11-06T12:00:00"), now)).toBe("1 day");
  });
});

describe("which words are due", () => {
  const group = groupOf(saved("word"));
  const later = (dueText: string, last = "2026-11-02T10:00:00"): WordReview => ({
    word_key: "word",
    card: {} as StoredCard,
    due: at(dueText).toISOString(),
    last_review: at(last).toISOString(),
  });

  it("treats a word never reviewed as due", () => {
    expect(isDue(group, undefined, at("2026-11-05T12:00:00"))).toBe(true);
  });

  it("isn't due the day before, and is due from the start of its day", () => {
    const review = later("2026-11-06T21:00:00");
    expect(isDue(group, review, at("2026-11-05T23:59:00"))).toBe(false);
    expect(isDue(group, review, at("2026-11-06T00:01:00"))).toBe(true);
    expect(isDue(group, review, at("2026-11-09T12:00:00"))).toBe(true);
  });

  it("brings a word back straight away when it's saved again after its last review", () => {
    const repeat = groupOf(saved("word"), saved("word", "2026-11-04T10:00:00Z"));
    expect(isDue(repeat, later("2026-12-01T10:00:00"), at("2026-11-05T12:00:00"))).toBe(true);
  });

  it("stops counting a repeat once the word has been reviewed since", () => {
    const repeat = groupOf(saved("word"), saved("word", "2026-11-04T10:00:00Z"));
    expect(isDue(repeat, later("2026-12-01T10:00:00", "2026-11-05T11:00:00"), at("2026-11-05T12:00:00"))).toBe(false);
  });

  it("includes a word with no AI content, and leaves out one with no definition", () => {
    expect(canReview(groupOf(saved("incomplete", undefined, { ai_content: null })))).toBe(true);
    expect(canReview(groupOf(saved("unknown", undefined, { definitions: null, definition_status: "not_found", kept_as_typed: true })))).toBe(false);
    expect(canReview(groupOf(saved("waiting", undefined, { definitions: null, definition_status: null })))).toBe(false);
  });

  it("lists only due words, one per word however many times it was saved", () => {
    const now = at("2026-11-05T12:00:00");
    const groups = groupWords([saved("fresh"), saved("repeat"), saved("repeat", "2026-11-01T11:00:00Z"), saved("waiting", undefined, { definitions: null, definition_status: null }), saved("later")]);
    const card = rateNew(Rating.Easy, now);
    const list = dueWords(groups, [reviewOf("later", card)], now);
    expect(list.map((due) => due.group.key).sort()).toEqual(["fresh", "repeat"]);
  });

  it("puts the most overdue word first", () => {
    const now = at("2026-11-20T12:00:00");
    const first = rateNew(Rating.Easy, at("2026-11-01T12:00:00"));
    const second = rateNew(Rating.Good, at("2026-11-02T12:00:00"));
    const list = dueWords(groupWords([saved("newer", "2026-10-30T10:00:00Z"), saved("older", "2026-10-30T10:00:00Z")]), [reviewOf("older", second), reviewOf("newer", first)], now);
    expect(list.map((due) => due.group.key)).toEqual(new Date(second.due) < new Date(first.due) ? ["older", "newer"] : ["newer", "older"]);
  });
});

describe("capping a session", () => {
  const names = (count: number) => Array.from({ length: count }, (_, index) => `word${String(index).padStart(2, "0")}`);
  // Oldest first, so word00 is the most overdue.
  const backlog = (count: number) =>
    groupWords(names(count).map((word, index) => saved(word, new Date(Date.UTC(2026, 9, 1 + index)).toISOString())));
  const now = at("2026-11-05T12:00:00");

  it("takes the 10 most overdue words, and holds the rest", () => {
    const { session, later } = splitSession(dueWords(backlog(25), [], now));
    expect(session.map((due) => due.group.key)).toEqual(names(10));
    expect(later.map((due) => due.group.key)).toEqual(names(25).slice(10));
  });

  it("uses the same limit of 10", () => {
    expect(SESSION_LIMIT).toBe(10);
  });

  it("holds nothing back at or under the limit", () => {
    expect(splitSession(dueWords(backlog(10), [], now)).later).toEqual([]);
    expect(splitSession(dueWords(backlog(3), [], now)).session).toHaveLength(3);
    expect(splitSession([])).toEqual({ session: [], later: [] });
  });

  it("works through a backlog in order, with no word twice or left out", () => {
    let rest = dueWords(backlog(25), [], now);
    const sessions: string[][] = [];
    while (rest.length > 0) {
      const { session, later } = splitSession(rest);
      sessions.push(session.map((due) => due.group.key));
      rest = later;
    }
    expect(sessions.map((session) => session.length)).toEqual([10, 10, 5]);
    expect(sessions.flat()).toEqual(names(25));
  });

  it("offers the words left over first on the next day, after the reviewed ones have gone", () => {
    const groups = backlog(25);
    const { session } = splitSession(dueWords(groups, [], now));
    const reviews = session.map((due) => reviewOf(due.group.key, stored(rate(due.card, Rating.Easy, now))));

    const nextDay = splitSession(dueWords(groups, reviews, at("2026-11-06T09:00:00")));
    expect(nextDay.session.map((due) => due.group.key)).toEqual(names(25).slice(10, 20));
    expect(nextDay.later.map((due) => due.group.key)).toEqual(names(25).slice(20));
  });

  it("keeps a backlog after several missed days, and still shows only 10", () => {
    const { session, later } = splitSession(dueWords(backlog(25), [], at("2026-11-20T09:00:00")));
    expect(session).toHaveLength(10);
    expect(later).toHaveLength(15);
  });
});

describe("highlighting the word in its sentence", () => {
  it("finds the word whatever its case, on whole words only", () => {
    expect(splitOnWord("Sanction the sanctions. sanction!", ["sanction"])).toEqual(["", "Sanction", " the sanctions. ", "sanction", "!"]);
  });

  it("finds the form that was typed", () => {
    expect(splitOnWord("They mitigated it.", ["mitigate", "mitigated"])).toEqual(["They ", "mitigated", " it."]);
  });

  it("copes with a form holding special characters", () => {
    expect(splitOnWord("A plain line.", ["a(b"])).toEqual(["A plain line."]);
  });
});
