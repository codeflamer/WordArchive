import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { WordGroup } from "./groups";

// Dates arrive from the database as text. The scheduler accepts either.
export type StoredCard = Omit<Card, "due" | "last_review"> & { due: Date | string; last_review?: Date | string };
export type WordReview = { word_key: string; card: StoredCard; due: string; last_review: string };
export type DueWord = { group: WordGroup; card: StoredCard };

export const RATINGS: { grade: Grade; label: string }[] = [
  { grade: Rating.Again, label: "Forgot" },
  { grade: Rating.Hard, label: "Hard" },
  { grade: Rating.Good, label: "Good" },
  { grade: Rating.Easy, label: "Easy" },
];

// A forgotten word returns about a minute later, until it's remembered. No random spread, so a rating always gives the same date.
const scheduler = fsrs({ enable_fuzz: false, enable_short_term: true, learning_steps: ["1m"], relearning_steps: ["1m"] });

function startOfTomorrow(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

// A word is due for the whole of its day, not from the hour it was last reviewed.
// Saving a word again after its last review means it wasn't remembered, so it comes back straight away.
export function isDue(group: WordGroup, review: WordReview | undefined, now: Date): boolean {
  if (!review) return true;
  if (new Date(group.latest) > new Date(review.last_review)) return true;
  return new Date(review.due) < startOfTomorrow(now);
}

// Needs a definition, or there's nothing to check the reader's recall against. AI content is optional.
export function canReview(group: WordGroup): boolean {
  return group.word.definition_status === "found" && Boolean(group.word.definitions);
}

// Most overdue first. Words never reviewed count from the day they were saved.
export function dueWords(groups: WordGroup[], reviews: WordReview[], now: Date): DueWord[] {
  const byKey = new Map(reviews.map((review) => [review.word_key, review]));
  return groups
    .filter((group) => canReview(group) && isDue(group, byKey.get(group.key), now))
    .map((group) => ({ group, card: byKey.get(group.key)?.card ?? createEmptyCard<Card>(new Date(group.latest)) }))
    .sort((a, b) => new Date(a.card.due).getTime() - new Date(b.card.due).getTime());
}

export function rate(card: StoredCard, grade: Grade, now: Date): Card {
  return scheduler.next(card, now, grade).card;
}

// Still being learned, so it stays in today's session until it's remembered.
export function comesBackToday(card: Card): boolean {
  return card.state === State.Learning || card.state === State.Relearning;
}

export function waitLabel(due: Date, now: Date): string {
  const minutes = Math.round((due.getTime() - now.getTime()) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function previewWaits(card: StoredCard, now: Date): Record<Grade, string> {
  const preview = scheduler.repeat(card, now);
  return {
    [Rating.Again]: waitLabel(preview[Rating.Again].card.due, now),
    [Rating.Hard]: waitLabel(preview[Rating.Hard].card.due, now),
    [Rating.Good]: waitLabel(preview[Rating.Good].card.due, now),
    [Rating.Easy]: waitLabel(preview[Rating.Easy].card.due, now),
  } as Record<Grade, string>;
}

// Splits a sentence around the word, so it can be highlighted wherever it appears. Odd positions are the word.
export function splitOnWord(sentence: string, forms: string[]): string[] {
  const escaped = forms.filter(Boolean).map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return [sentence];
  return sentence.split(new RegExp(`\\b(${escaped.join("|")})\\b`, "gi"));
}
