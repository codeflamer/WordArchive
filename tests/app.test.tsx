import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import * as api from "../src/lib/api";
import { playWord } from "../src/lib/speak";

vi.mock("../src/lib/api", () => ({
  isConfigured: true,
  getSession: vi.fn(),
  onSessionChange: vi.fn(() => () => {}),
  signIn: vi.fn(),
  signOut: vi.fn(),
  listWords: vi.fn(),
  addWord: vi.fn(),
  listBooks: vi.fn(),
  addBook: vi.fn(),
  getCurrentBook: vi.fn(),
  setCurrentBook: vi.fn(),
  listQuotes: vi.fn(),
  addQuote: vi.fn(),
  defineWord: vi.fn(),
  saveDefinitions: vi.fn(),
  keepAsTyped: vi.fn(),
  explainWord: vi.fn(),
  saveAiContent: vi.fn(),
  pronounceWord: vi.fn(),
  savePronunciation: vi.fn(),
  getLastChecked: vi.fn(),
  isOfflineError: vi.fn(),
  listReviews: vi.fn(),
  getReview: vi.fn(),
  recordReview: vi.fn(),
  getQuoteOfTheDay: vi.fn(),
}));

vi.mock("../src/lib/speak", () => ({ playWord: vi.fn() }));

const mocked = vi.mocked(api);
const session = { access_token: "token" } as Awaited<ReturnType<typeof api.getSession>>;
const middlemarch = { id: "b1", title: "Middlemarch", author: "George Eliot" };
const beloved = { id: "b2", title: "Beloved", author: "Toni Morrison" };
const entry = (word: string, title?: string, sentence: string | null = null) => ({
  id: word,
  word,
  sentence,
  created_at: "2026-11-02T10:00:00Z",
  book: title ? { title } : null,
  definitions: null,
  definition_status: null,
});
const definitions = {
  source: "Wiktionary",
  sourceUrl: "https://en.wiktionary.org/wiki/sanction",
  meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "An approval.", example: "With sanction." }] }],
};

const aiContent = { chosenMeaning: null, examples: ["First AI line.", "Second AI line.", "Third AI line."] };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocked.onSessionChange.mockReturnValue(() => {});
  mocked.isOfflineError.mockReturnValue(false);
  mocked.defineWord.mockResolvedValue({ status: "not_found" });
  mocked.saveDefinitions.mockResolvedValue();
  mocked.explainWord.mockResolvedValue(aiContent);
  mocked.saveAiContent.mockResolvedValue();
  mocked.pronounceWord.mockResolvedValue({ audio: null, text: null });
  mocked.savePronunciation.mockResolvedValue();
  mocked.getLastChecked.mockResolvedValue(null);
  vi.mocked(playWord).mockResolvedValue("played");
  mocked.getCurrentBook.mockResolvedValue(null);
  mocked.listBooks.mockResolvedValue([]);
  mocked.listQuotes.mockResolvedValue([]);
  mocked.listReviews.mockResolvedValue([]);
  mocked.getReview.mockResolvedValue(null);
  mocked.recordReview.mockResolvedValue();
  mocked.getQuoteOfTheDay.mockResolvedValue(null);
});

describe("quote of the day", () => {
  const quote = {
    id: "q1",
    body: "It is a truth,\nuniversally acknowledged.",
    created_at: "2026-11-02T10:00:00Z",
    book: { title: "Pride and Prejudice", author: "Jane Austen" },
  };
  const dueWord = { ...entry("sanction"), definitions, definition_status: "found" as const };

  async function openReview(words: (typeof dueWord)[] = []) {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue(words);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Review" }));
    return user;
  }

  it("waits until the review is finished, then shows the quote with its book and author", async () => {
    mocked.getQuoteOfTheDay.mockResolvedValue(quote);
    const user = await openReview([dueWord]);
    await user.click(await screen.findByRole("button", { name: "Show meaning" }));
    expect(screen.queryByLabelText("Quote of the day")).not.toBeInTheDocument();
    expect(mocked.getQuoteOfTheDay).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Easy/ }));
    const shown = await screen.findByLabelText("Quote of the day");
    expect(shown.querySelector("blockquote")?.textContent).toBe(quote.body);
    expect(within(shown).getByText("Pride and Prejudice")).toBeInTheDocument();
    expect(shown).toHaveTextContent("by Jane Austen");
  });

  it("shows on a day with nothing due, using the reader's own date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 23, 30));
    mocked.getQuoteOfTheDay.mockResolvedValue(quote);
    await openReview();
    expect(await screen.findByLabelText("Quote of the day")).toBeInTheDocument();
    expect(mocked.getQuoteOfTheDay).toHaveBeenCalledWith("2026-11-05");
    vi.useRealTimers();
  });

  it("shows beside the offer to review more, when a capped session ends", async () => {
    mocked.getQuoteOfTheDay.mockResolvedValue(quote);
    const words = Array.from({ length: 11 }, (_, index) => ({ ...dueWord, id: `word${index}`, word: `word${String.fromCharCode(97 + index)}` }));
    const user = await openReview(words);
    for (let index = 0; index < 10; index += 1) {
      await user.click(await screen.findByRole("button", { name: "Show meaning" }));
      await user.click(screen.getByRole("button", { name: /^Easy/ }));
    }
    expect(await screen.findByLabelText("Quote of the day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review 1 more now" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review 1 more now" }));
    expect(await screen.findByRole("button", { name: "Show meaning" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Quote of the day")).not.toBeInTheDocument();
  });

  it("stays away with no quotes, or when it can't load", async () => {
    await openReview();
    await screen.findByText("No words are due. Words you save will appear here.");
    await waitFor(() => expect(mocked.getQuoteOfTheDay).toHaveBeenCalled());
    expect(screen.queryByLabelText("Quote of the day")).not.toBeInTheDocument();
    cleanup();
    mocked.getQuoteOfTheDay.mockRejectedValue(new Error("offline"));
    await openReview();
    await screen.findByText("No words are due. Words you save will appear here.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quote of the day")).not.toBeInTheDocument();
  });
});

describe("reviewing due words", () => {
  const ready = (word: string, sentence: string | null = null, extra: object = {}) => ({
    ...entry(word, "Middlemarch", sentence),
    definitions,
    definition_status: "found" as const,
    ...extra,
  });

  async function openReview(words: ReturnType<typeof ready>[]) {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue(words);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Review" }));
    return user;
  }

  it("shows the word in its book sentence, and the meaning only after flipping", async () => {
    const user = await openReview([ready("sanction", "The sanction was lifted.")]);
    const card = await screen.findByRole("article", { name: "Review card" });
    expect(within(card).getByRole("heading", { name: "sanction" })).toBeInTheDocument();
    expect(within(card).getByText("sanction", { selector: "mark" })).toBeInTheDocument();
    expect(within(card).getByText("Middlemarch")).toBeInTheDocument();
    expect(screen.queryByText("An approval.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show meaning" }));
    expect(screen.getByText("An approval.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Forgot, next review in 1 min/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Easy, next review in \d+ days/ })).toBeInTheDocument();
  });

  it("labels an AI meaning, and still reviews a word without one", async () => {
    const chosen = { chosenMeaning: { partOfSpeech: "noun", definition: "A penalty." }, examples: [] };
    const user = await openReview([ready("sanction", "A line.", { ai_content: chosen })]);
    await user.click(await screen.findByRole("button", { name: "Show meaning" }));
    expect(screen.getByLabelText("Written by AI")).toHaveTextContent("A penalty.");
    cleanup();
    const again = await openReview([ready("plain")]);
    await again.click(await screen.findByRole("button", { name: "Show meaning" }));
    expect(screen.queryByLabelText("Written by AI")).not.toBeInTheDocument();
    expect(screen.getByText("An approval.")).toBeInTheDocument();
  });

  it("saves the rating and moves on, repeating a forgotten word until it's remembered", async () => {
    const user = await openReview([ready("first"), ready("second")]);
    const heading = async () => (await screen.findByRole("article", { name: "Review card" })).querySelector("h2")?.textContent;
    const shown = await heading();
    const other = shown === "first" ? "second" : "first";

    await user.click(screen.getByRole("button", { name: "Show meaning" }));
    await user.click(screen.getByRole("button", { name: /^Forgot/ }));
    await waitFor(async () => expect(await heading()).toBe(other));
    expect(mocked.recordReview).toHaveBeenCalledWith(shown, 1, expect.objectContaining({ reps: 1 }));

    await user.click(screen.getByRole("button", { name: "Show meaning" }));
    await user.click(screen.getByRole("button", { name: /^Easy/ }));
    await waitFor(async () => expect(await heading()).toBe(shown));

    await user.click(screen.getByRole("button", { name: "Show meaning" }));
    await user.click(screen.getByRole("button", { name: /^Good/ }));
    expect(await screen.findByText("Review finished. You went through 2 words.")).toBeInTheDocument();
    expect(mocked.recordReview).toHaveBeenCalledTimes(3);
  });

  describe("with more due than one session holds", () => {
    const backlog = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...ready(`word${index}`),
        created_at: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
      }));

    async function rateCards(user: ReturnType<typeof userEvent.setup>, count: number, rating = /^Easy/) {
      for (let done = 0; done < count; done += 1) {
        await user.click(await screen.findByRole("button", { name: "Show meaning" }));
        await user.click(screen.getByRole("button", { name: rating }));
        await waitFor(() => expect(mocked.recordReview).toHaveBeenCalled());
        await screen.findByText(/left in this session|Review finished/);
      }
    }

    it("starts with the 10 most overdue words, and shows the session's progress", async () => {
      await openReview(backlog(25));
      expect(await screen.findByText("10 left in this session, 15 more for later")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "word0" })).toBeInTheDocument();
    });

    it("stops at 10, says how many wait, and only saved those 10", async () => {
      const user = await openReview(backlog(25));
      await rateCards(user, 10);
      expect(await screen.findByText("Review finished. You went through 10 words. 15 more are due and will wait for your next session.")).toBeInTheDocument();
      expect(screen.queryByRole("article", { name: "Review card" })).not.toBeInTheDocument();
      expect(mocked.recordReview).toHaveBeenCalledTimes(10);
      expect(mocked.recordReview.mock.calls.map((call) => call[0])).toEqual(Array.from({ length: 10 }, (_, index) => `word${index}`));
    });

    it("carries on with the next words only if asked", async () => {
      const user = await openReview(backlog(12));
      await rateCards(user, 10);
      await screen.findByText(/2 more are due/);
      await user.click(screen.getByRole("button", { name: "Review 2 more now" }));
      expect(await screen.findByText("2 left in this session")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "word10" })).toBeInTheDocument();
      await rateCards(user, 2);
      expect(await screen.findByText("Review finished. You went through 2 words.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /more now/ })).not.toBeInTheDocument();
      expect(mocked.recordReview).toHaveBeenCalledTimes(12);
    });

    it("offers at most 10 more at a time", async () => {
      const user = await openReview(backlog(25));
      await rateCards(user, 10);
      await user.click(await screen.findByRole("button", { name: "Review 10 more now" }));
      expect(await screen.findByText("10 left in this session, 5 more for later")).toBeInTheDocument();
    });

    it("repeats a forgotten word without pulling in another from later", async () => {
      const user = await openReview(backlog(11));
      await rateCards(user, 1, /^Forgot/);
      expect(await screen.findByText("10 left in this session, 1 more for later")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "word1" })).toBeInTheDocument();
    });

    it("says nothing about later when everything fits", async () => {
      await openReview(backlog(10));
      expect(await screen.findByText("10 left in this session")).toBeInTheDocument();
    });
  });

  it("leaves out words with no definition, and says when nothing is due", async () => {
    await openReview([ready("unknown", null, { definitions: null, definition_status: "not_found", kept_as_typed: true })]);
    expect(await screen.findByText("No words are due. Words you save will appear here.")).toBeInTheDocument();
  });

  it("keeps the card when a rating fails to save, so it can be tried again", async () => {
    mocked.recordReview.mockRejectedValueOnce(new Error("offline"));
    const user = await openReview([ready("sanction")]);
    await user.click(await screen.findByRole("button", { name: "Show meaning" }));
    await user.click(screen.getByRole("button", { name: /^Easy/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your rating wasn't saved.");
    await user.click(screen.getByRole("button", { name: /^Easy/ }));
    expect(await screen.findByText("Review finished. You went through 1 word.")).toBeInTheDocument();
  });

  it("says so when the review can't load", async () => {
    mocked.listReviews.mockRejectedValue(new Error("offline"));
    await openReview([ready("sanction")]);
    expect(await screen.findByText("Your review didn't load. Check your connection and try again.")).toBeInTheDocument();
  });

  it("shows the next review date on the word's page", async () => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([{ ...ready("sanction"), ai_content: aiContent }]);
    mocked.getReview.mockResolvedValue({
      word_key: "sanction",
      card: {} as never,
      due: "2099-03-10T12:00:00Z",
      last_review: "2099-03-01T12:00:00Z",
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(await screen.findByText(/^Next review .*2099/)).toBeInTheDocument();
    expect(mocked.getReview).toHaveBeenCalledWith("sanction");
  });
});

const savedQuote = (body: string, book: { title: string; author: string } | null = null) => ({
  id: body,
  body,
  created_at: "2026-11-02T10:00:00Z",
  book,
});

describe("definitions", () => {
  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
  });

  async function saveWord(user: ReturnType<typeof userEvent.setup>, word: string) {
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), `${word}{Enter}`);
  }

  it("looks up and stores definitions automatically after saving", async () => {
    mocked.addWord.mockResolvedValue(entry("sanction"));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    const user = userEvent.setup();
    await saveWord(user, "sanction");

    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("sanction", "found", definitions, null, null));
    expect(mocked.defineWord).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(await screen.findByText("An approval.")).toBeVisible();
    expect(screen.getByText("With sanction.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Wiktionary" })).toHaveAttribute("href", definitions.sourceUrl);
    expect(mocked.defineWord).toHaveBeenCalledTimes(1);
  });

  it("shows stored definitions with no new lookup", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("sanction"), definitions, definition_status: "found" }]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(screen.getByText("An approval.")).toBeVisible();
    expect(mocked.defineWord).not.toHaveBeenCalled();
  });

  it("looks up an older word when it's opened", async () => {
    mocked.listWords.mockResolvedValue([entry("older")]);
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "older" }));
    expect(await screen.findByText("An approval.")).toBeVisible();
    expect(mocked.saveDefinitions).toHaveBeenCalledWith("older", "found", definitions, null, null);
  });

  it("says when no definition exists, and remembers that", async () => {
    mocked.listWords.mockResolvedValue([entry("zzzznotaword")]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "zzzznotaword" }));
    expect(await screen.findByText("No dictionary definition found for this word.")).toBeVisible();
    expect(mocked.saveDefinitions).toHaveBeenCalledWith("zzzznotaword", "not_found", null, null, []);
  });

  it("shows the base form and what was typed, in the list and on the word's page", async () => {
    const withTyped = { ...definitions, typedMeanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "Weary." }] }] };
    mocked.addWord.mockResolvedValue(entry("bored"));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions: withTyped, baseForm: "bore" });
    const user = userEvent.setup();
    await saveWord(user, "bored");

    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("bored", "found", withTyped, "bore", null));
    await user.click(await screen.findByRole("button", { name: "bore" }));
    expect(screen.getByRole("heading", { name: "bore" })).toBeVisible();
    expect(screen.getAllByText("You typed bored").some((item) => item.checkVisibility?.() !== false)).toBe(true);
    expect(screen.getByRole("heading", { name: /Meanings of .bored. itself/ })).toBeVisible();
    expect(screen.getByText("Weary.")).toBeVisible();
    expect(screen.getByText("An approval.")).toBeVisible();
  });

  it("doesn't show a typed note when the word is already a base form", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("sanction"), definitions, definition_status: "found" }]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(screen.queryByText(/You typed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /itself/ })).not.toBeInTheDocument();
  });

  it("keeps working with a saved copy from before base forms existed", async () => {
    const { base_form: _unused, ...oldEntry } = { ...entry("sanction"), base_form: null, definitions, definition_status: "found" as const };
    localStorage.setItem("wordarchive.words.v1", JSON.stringify([oldEntry]));
    mocked.listWords.mockRejectedValue(new Error("offline"));
    render(<App />);
    expect(await screen.findByRole("button", { name: "sanction" })).toBeVisible();
  });

  it("keeps the word when a lookup fails, and offers another try", async () => {
    mocked.addWord.mockResolvedValue(entry("sanction"));
    mocked.defineWord.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    await saveWord(user, "sanction");
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The definition didn't load");
    expect(mocked.defineWord).toHaveBeenCalledTimes(1);

    mocked.defineWord.mockResolvedValueOnce({ status: "found", definitions });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("An approval.")).toBeVisible();
  });

  it("offers another try when the definitions can't be stored", async () => {
    mocked.addWord.mockResolvedValue(entry("sanction"));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    mocked.saveDefinitions.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    await saveWord(user, "sanction");
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
  });
});

describe("AI meaning and examples", () => {
  const chosen = { chosenMeaning: { partOfSpeech: "noun", definition: "A penalty." }, examples: aiContent.examples };

  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
  });

  async function saveAndOpen(user: ReturnType<typeof userEvent.setup>, sentence: string) {
    mocked.addWord.mockResolvedValue(entry("sanction", undefined, sentence));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "sanction");
    await user.type(screen.getByLabelText("Sentence from the book (optional)"), sentence);
    await user.click(screen.getByRole("button", { name: "Save word" }));
    await user.click(await screen.findByRole("button", { name: "sanction" }));
  }

  it("asks AI after the definitions are saved, using the book sentence", async () => {
    const order: string[] = [];
    mocked.saveDefinitions.mockImplementation(async () => void order.push("definitions"));
    mocked.explainWord.mockImplementation(async () => {
      order.push("ai");
      return chosen;
    });
    const user = userEvent.setup();
    await saveAndOpen(user, "The sanction hurt.");

    await waitFor(() => expect(mocked.saveAiContent).toHaveBeenCalledWith("sanction", chosen));
    expect(order).toEqual(["definitions", "ai"]);
    expect(mocked.explainWord).toHaveBeenCalledWith("sanction", "The sanction hurt.", definitions);
    expect(mocked.explainWord).toHaveBeenCalledTimes(1);
  });

  it("shows the chosen meaning and exactly 3 examples, labelled as AI", async () => {
    mocked.explainWord.mockResolvedValue(chosen);
    const user = userEvent.setup();
    await saveAndOpen(user, "The sanction hurt.");

    const help = await screen.findByRole("region", { name: "Written by AI" });
    expect(within(help).getByText(/Written by AI/)).toBeVisible();
    expect(within(help).getByText("In your sentence, it means")).toBeVisible();
    expect(within(help).getByText(/A penalty\./)).toBeVisible();
    expect(within(help).getAllByRole("listitem")).toHaveLength(3);
  });

  it("leaves out the chosen meaning when AI didn't choose one", async () => {
    const user = userEvent.setup();
    await saveAndOpen(user, "A line.");
    const help = await screen.findByRole("region", { name: "Written by AI" });
    expect(within(help).queryByText("In your sentence, it means")).not.toBeInTheDocument();
    expect(within(help).getByText("First AI line.")).toBeVisible();
  });

  it("uses the base form when asking AI", async () => {
    mocked.addWord.mockResolvedValue(entry("bored"));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions, baseForm: "bore" });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "bored{Enter}");
    await waitFor(() => expect(mocked.explainWord).toHaveBeenCalledWith("bore", null, definitions));
  });

  it("keeps the definitions when AI fails, and doesn't keep retrying", async () => {
    mocked.explainWord.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    await saveAndOpen(user, "A line.");
    expect(await screen.findByText(/AI examples aren't available right now/)).toBeVisible();
    expect(screen.getByText("An approval.")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocked.explainWord).toHaveBeenCalledTimes(1);
    expect(mocked.saveAiContent).not.toHaveBeenCalled();
  });

  it("fills in an older word when it's opened, without a new dictionary lookup", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("older"), definitions, definition_status: "found" }]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "older" }));
    expect(await screen.findByText("First AI line.")).toBeVisible();
    expect(mocked.defineWord).not.toHaveBeenCalled();
  });

  it("doesn't ask AI again for a word that already has its content", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("done"), definitions, definition_status: "found", ai_content: aiContent }]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "done" }));
    expect(screen.getByText("First AI line.")).toBeVisible();
    expect(mocked.explainWord).not.toHaveBeenCalled();
  });

  it("doesn't ask AI about a word that wasn't found", async () => {
    mocked.addWord.mockResolvedValue(entry("zzzznotaword"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "zzzznotaword{Enter}");
    await screen.findByText("Check this word");
    expect(mocked.explainWord).not.toHaveBeenCalled();
  });
});

describe("searching", () => {
  const saved = [
    { ...entry("sanction", "Middlemarch", "The council gave its sanction."), definitions, definition_status: "found" as const },
    { ...entry("lucid", "Beloved"), definitions, definition_status: "found" as const },
  ];
  const quotesSaved = [savedQuote("It is a truth universally acknowledged.", middlemarch), savedQuote("Definitions belong to the definers.", beloved)];

  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue(saved);
    mocked.listQuotes.mockResolvedValue(quotesSaved);
    mocked.listBooks.mockResolvedValue([middlemarch, beloved]);
  });

  async function openSearch() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Search" }));
    const box = await screen.findByLabelText("Search words, sentences, quotes, books and authors");
    await waitFor(() => expect(mocked.listBooks).toHaveBeenCalled());
    return { user, box };
  }

  it("finds a saved word, showing its meaning and sentence", async () => {
    const { user, box } = await openSearch();
    await user.type(box, "sanction");
    const area = screen.getByRole("region", { name: "Search" });
    expect(await within(area).findByText("1 result")).toBeInTheDocument();
    expect(within(area).getByText("sanction")).toBeVisible();
    expect(within(area).getByText("An approval.")).toBeVisible();
    expect(within(area).getByText("The council gave its sanction.")).toBeVisible();
  });

  it("finds a phrase inside a quote", async () => {
    const { user, box } = await openSearch();
    await user.type(box, "universally");
    const area = screen.getByRole("region", { name: "Search" });
    expect(await within(area).findByText("It is a truth universally acknowledged.")).toBeVisible();
    expect(within(area).queryByText("Definitions belong to the definers.")).not.toBeInTheDocument();
  });

  it("finds words and quotes by book title and by author", async () => {
    const { user, box } = await openSearch();
    await user.type(box, "Middlemarch");
    const area = screen.getByRole("region", { name: "Search" });
    expect(await within(area).findByText("2 results")).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "Morrison");
    expect(await within(area).findByText("lucid")).toBeVisible();
    expect(within(area).getByText("Definitions belong to the definers.")).toBeVisible();
  });

  it("says when nothing matches", async () => {
    const { user, box } = await openSearch();
    await user.type(box, "zzzznothing");
    expect(await screen.findByText("Nothing found for “zzzznothing”.")).toBeInTheDocument();
  });

  it("shows nothing until something is typed", async () => {
    await openSearch();
    expect(screen.queryByText(/result|Nothing found/)).not.toBeInTheDocument();
  });

  it("searches the saved copy and waiting saves without signal", async () => {
    localStorage.setItem("wordarchive.words.v1", JSON.stringify(saved));
    localStorage.setItem("wordarchive.outbox.v1", JSON.stringify([{ kind: "quote", id: "q1", body: "A line saved offline.", bookId: null, bookTitle: null, bookAuthor: null, createdAt: "2026-11-05T10:00:00Z" }]));
    mocked.listWords.mockRejectedValue(new Error("offline"));
    mocked.listQuotes.mockRejectedValue(new Error("offline"));
    mocked.listBooks.mockRejectedValue(new Error("offline"));
    // With no signal, sending waiting saves fails too, so they stay waiting.
    mocked.addQuote.mockRejectedValue(new Error("offline"));
    mocked.addWord.mockRejectedValue(new Error("offline"));
    const { user, box } = await openSearch();
    expect(await screen.findByText(/Searching the copy saved on this phone/)).toBeInTheDocument();
    await user.type(box, "offline");
    const area = screen.getByRole("region", { name: "Search" });
    expect(await within(area).findByText("A line saved offline.")).toBeVisible();
    await user.clear(box);
    await user.type(box, "lucid");
    expect(await screen.findByText("1 result")).toBeInTheDocument();
  });

  it("saves the lists it refreshes, so a later search without signal finds them", async () => {
    // The Quotes tab loads first and sees an older, empty list; search then gets the newer one.
    mocked.listQuotes.mockResolvedValueOnce([]);
    await openSearch();
    await waitFor(() => expect(localStorage.getItem("wordarchive.quotes.v1")).toContain("universally acknowledged"));
    expect(localStorage.getItem("wordarchive.words.v1")).toContain("sanction");
  });
});

describe("the database status line", () => {
  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
  });

  it("shows when the database was last checked", async () => {
    mocked.getLastChecked.mockResolvedValue("2026-11-05T12:00:00Z");
    render(<App />);
    expect(await screen.findByText(/Database last checked .*2026/)).toBeVisible();
  });

  it("leaves the line out when there's no run yet, or it can't load", async () => {
    render(<App />);
    await screen.findByText("No book chosen yet");
    expect(screen.queryByText(/Database last checked/)).not.toBeInTheDocument();
    cleanup();

    mocked.getLastChecked.mockRejectedValue(new Error("offline"));
    render(<App />);
    await screen.findByText("No book chosen yet");
    expect(screen.queryByText(/Database last checked/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("saving without signal", () => {
  const OUTBOX = "wordarchive.outbox.v1";
  const offline = new Error("offline");
  const middlemarchCopy = JSON.stringify({ book: middlemarch });
  const stored = (word: string, id: string) => ({ ...entry(word), id });

  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockRejectedValue(offline);
    mocked.listQuotes.mockRejectedValue(offline);
    mocked.getCurrentBook.mockRejectedValue(offline);
    mocked.addWord.mockRejectedValue(offline);
    mocked.addQuote.mockRejectedValue(offline);
    localStorage.setItem("wordarchive.book.v1", middlemarchCopy);
  });

  const waitingItems = () => JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as { id: string; word?: string; body?: string; kind: string }[];

  async function saveOffline(user: ReturnType<typeof userEvent.setup>, word = "ephemeral", line?: string) {
    await screen.findByText(/by George Eliot/);
    await user.type(screen.getByLabelText("New word"), word);
    if (line) await user.type(screen.getByLabelText("Sentence from the book (optional)"), line);
    await user.click(screen.getByRole("button", { name: "Save word" }));
    await screen.findByText("Waiting to sync");
  }

  it("keeps working from the saved book, with no error", async () => {
    render(<App />);
    expect(await screen.findByText(/by George Eliot/)).toBeVisible();
    expect(screen.queryByText(/current book didn't load/)).not.toBeInTheDocument();
  });

  it("saves a word on the phone, clears the box, and marks it waiting", async () => {
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user, "ephemeral", "A line.");

    expect(screen.getByRole("button", { name: "ephemeral" })).toBeVisible();
    expect(screen.getByLabelText("New word")).toHaveValue("");
    expect(screen.getByLabelText("Sentence from the book (optional)")).toHaveValue("");
    expect(screen.getByText("1 word is waiting to sync. It's saved on this phone.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(waitingItems()).toMatchObject([{ kind: "word", word: "ephemeral", sentence: "A line.", bookId: "b1", bookTitle: "Middlemarch" }]);
    expect(mocked.defineWord).not.toHaveBeenCalled();
  });

  it("still shows a waiting word after the app is closed and reopened", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await saveOffline(user);
    unmount();

    render(<App />);
    expect(await screen.findByRole("button", { name: "ephemeral" })).toBeVisible();
    expect(await screen.findByText("Waiting to sync")).toBeVisible();
    expect(screen.getByLabelText("1 word saved")).toBeInTheDocument();
    expect(waitingItems()).toHaveLength(1);
  });

  it("explains on the word's page that the definition is waiting", async () => {
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user);
    await user.click(screen.getByRole("button", { name: "ephemeral" }));
    expect(screen.getByText("The definition will appear once this word has synced.")).toBeVisible();
    expect(mocked.defineWord).not.toHaveBeenCalled();
  });

  it("sends the word when signal returns, then looks it up, with no duplicate", async () => {
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user);
    const { id } = waitingItems()[0];
    const firstEntry = mocked.addWord.mock.calls[0][3];

    mocked.addWord.mockResolvedValue(stored("ephemeral", id));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    await act(async () => void window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith(id, "found", definitions, null, null));
    expect(mocked.addWord).toHaveBeenLastCalledWith("ephemeral", "b1", null, firstEntry);
    expect(firstEntry.id).toBe(id);
    expect(waitingItems()).toEqual([]);
    expect(screen.queryByText("Waiting to sync")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "ephemeral" })).toHaveLength(1);
  });

  it("sends waiting words on reopening with signal", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await saveOffline(user);
    const { id } = waitingItems()[0];
    unmount();

    mocked.listWords.mockResolvedValue([]);
    mocked.addWord.mockResolvedValue(stored("ephemeral", id));
    render(<App />);
    await waitFor(() => expect(waitingItems()).toEqual([]));
    expect(await screen.findByRole("button", { name: "ephemeral" })).toBeVisible();
    await waitFor(() => expect(mocked.defineWord).toHaveBeenCalledWith("ephemeral"));
  });

  it("doesn't show a word twice if the server list already includes it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await saveOffline(user);
    const { id } = waitingItems()[0];
    unmount();

    mocked.listWords.mockResolvedValue([stored("ephemeral", id)]);
    mocked.addWord.mockResolvedValue(stored("ephemeral", id));
    render(<App />);
    await waitFor(() => expect(waitingItems()).toEqual([]));
    expect(screen.getAllByRole("button", { name: "ephemeral" })).toHaveLength(1);
    expect(screen.getByLabelText("1 word saved")).toBeInTheDocument();
  });

  it("keeps a word just sent when an older server list arrives afterwards", async () => {
    let finishList: (list: api.SavedWord[]) => void = () => {};
    mocked.listWords.mockReturnValue(new Promise((resolve) => (finishList = resolve)));
    mocked.addWord.mockImplementation(async (word, _book, _line, details) => stored(word, details.id));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/by George Eliot/);
    await user.type(screen.getByLabelText("New word"), "ephemeral{Enter}");
    await waitFor(() => expect(waitingItems()).toEqual([]));

    await act(async () => finishList([]));
    expect(screen.getByRole("button", { name: "ephemeral" })).toBeVisible();
  });

  it("retries with the button, and keeps waiting if it fails again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user);
    await user.click(screen.getByRole("button", { name: "Sync words now" }));
    await waitFor(() => expect(mocked.addWord).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Waiting to sync")).toBeVisible();
    expect(waitingItems()).toHaveLength(1);
  });

  it("sends several in the order they were saved, and carries on past a failure", async () => {
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user, "first");
    await user.type(screen.getByLabelText("New word"), "second{Enter}");
    await screen.findByText("2 words are waiting to sync. They're saved on this phone.");
    const [first, second] = waitingItems();

    mocked.addWord.mockReset();
    mocked.addWord.mockRejectedValueOnce(offline);
    mocked.addWord.mockResolvedValueOnce(stored("second", second.id));
    await user.click(screen.getByRole("button", { name: "Sync words now" }));

    await waitFor(() => expect(waitingItems().map((item) => item.id)).toEqual([first.id]));
    expect(mocked.addWord.mock.calls.map((call) => call[0])).toEqual(["first", "second"]);
  });

  it("merges an offline repeat straight away, and reuses saved details when it syncs", async () => {
    const existing = { ...stored("sanction", "a"), definitions, definition_status: "found" as const, ai_content: aiContent, created_at: "2026-11-01T10:00:00Z" };
    localStorage.setItem("wordarchive.words.v1", JSON.stringify([existing]));
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user, "sanction");
    expect(screen.getAllByRole("button", { name: "sanction" })).toHaveLength(1);
    expect(screen.getByLabelText("1 word saved")).toBeInTheDocument();

    const { id } = waitingItems()[0];
    mocked.addWord.mockResolvedValue(stored("sanction", id));
    await act(async () => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith(id, "found", definitions, null, null));
    expect(mocked.defineWord).not.toHaveBeenCalled();
  });

  it("saves a quote on the phone, exactly as entered, and sends it later", async () => {
    const quote = `  "Line," she said,\nexactly.  `;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/by George Eliot/);
    await user.click(screen.getByRole("button", { name: "Quotes" }));
    screen.getByLabelText("New quote").focus();
    await user.paste(quote);
    await user.click(screen.getByRole("button", { name: "Save quote" }));

    expect(await screen.findByText("1 quote is waiting to sync. It's saved on this phone.")).toBeVisible();
    expect(document.querySelector(".quotes blockquote")?.textContent).toBe(quote);
    expect(screen.getByLabelText("New quote")).toHaveValue("");
    const { id, body } = waitingItems()[0];
    expect(body).toBe(quote);

    mocked.addQuote.mockResolvedValue({ id, body: quote, created_at: "2026-11-05T10:00:00Z", book: middlemarch });
    await act(async () => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(waitingItems()).toEqual([]));
    expect(mocked.addQuote.mock.lastCall?.slice(0, 2)).toEqual([quote, "b1"]);
    expect(screen.queryByText("Waiting to sync")).not.toBeInTheDocument();
  });

  it("shows saved quotes and a waiting quote after reopening without signal", async () => {
    localStorage.setItem("wordarchive.quotes.v1", JSON.stringify([savedQuote("An older line", middlemarch)]));
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(await screen.findByRole("button", { name: "Quotes" }));
    await user.type(screen.getByLabelText("New quote"), "A new line");
    await user.click(screen.getByRole("button", { name: "Save quote" }));
    await screen.findByText("Waiting to sync");
    unmount();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Quotes" }));
    expect(screen.getByText("A new line")).toBeVisible();
    expect(screen.getByText("An older line")).toBeVisible();
    expect(screen.getByLabelText("2 quotes saved")).toBeInTheDocument();
  });

  it("keeps unsent saves through a sign-out, but removes the saved copies", async () => {
    let notify: (value: Awaited<ReturnType<typeof api.getSession>>) => void = () => {};
    mocked.onSessionChange.mockImplementation((listener) => {
      notify = listener;
      return () => {};
    });
    const user = userEvent.setup();
    render(<App />);
    await saveOffline(user);
    await act(async () => notify(null));
    expect(await screen.findByLabelText("Password")).toBeVisible();
    expect(screen.queryByText("ephemeral")).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("wordarchive.book.v1")).toBeNull());
    expect(waitingItems()).toHaveLength(1);
  });
});

describe("repeated words", () => {
  const foundRow = (id: string, extra = {}) => ({
    ...entry("sanction"),
    id,
    definitions,
    definition_status: "found" as const,
    ai_content: aiContent,
    ...extra,
  });

  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
  });

  async function saveRepeat(user: ReturnType<typeof userEvent.setup>, line?: string) {
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "sanction");
    if (line) await user.type(screen.getByLabelText("Sentence from the book (optional)"), line);
    await user.click(screen.getByRole("button", { name: "Save word" }));
  }

  it("shows existing repeats as one entry, and counts it once", async () => {
    mocked.listWords.mockResolvedValue([foundRow("b"), foundRow("a")]);
    render(<App />);
    expect(await screen.findAllByRole("button", { name: "sanction" })).toHaveLength(1);
    expect(screen.getByLabelText("1 word saved")).toBeInTheDocument();
  });

  it("adds a repeat to the entry, reusing the definitions with no new lookup", async () => {
    mocked.listWords.mockResolvedValue([foundRow("a", { created_at: "2026-11-01T10:00:00Z" })]);
    mocked.addWord.mockResolvedValue({ ...entry("sanction"), id: "b", book: { title: "Beloved" } });
    const user = userEvent.setup();
    render(<App />);
    await saveRepeat(user);

    expect(await screen.findByRole("status", { name: "" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((item) => item.textContent === "Added to sanction")).toBe(true);
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("b", "found", definitions, null, null));
    expect(mocked.defineWord).not.toHaveBeenCalled();
    expect(mocked.explainWord).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "sanction" })).toHaveLength(1);
    expect(screen.getByText("Beloved")).toBeVisible();
    expect(screen.getByLabelText("1 word saved")).toBeInTheDocument();
  });

  it("asks AI about a repeat's new sentence only", async () => {
    mocked.listWords.mockResolvedValue([foundRow("a", { created_at: "2026-11-01T10:00:00Z" })]);
    mocked.addWord.mockResolvedValue({ ...entry("sanction", undefined, "A new line."), id: "b" });
    const user = userEvent.setup();
    render(<App />);
    await saveRepeat(user, "A new line.");
    await waitFor(() => expect(mocked.explainWord).toHaveBeenCalledWith("sanction", "A new line.", definitions));
    expect(mocked.explainWord).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocked.saveAiContent).toHaveBeenCalledWith("b", aiContent));
  });

  it("recognises a repeat by the form that was typed", async () => {
    mocked.listWords.mockResolvedValue([{ ...foundRow("a"), word: "mitigated", base_form: "mitigate" }]);
    mocked.addWord.mockResolvedValue({ ...entry("mitigated"), id: "b" });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "mitigated{Enter}");
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("b", "found", definitions, "mitigate", null));
    expect(mocked.defineWord).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "mitigate" })).toHaveLength(1);
  });

  it("does a normal lookup for a word still waiting on its first one", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("sanction"), id: "a" }]);
    mocked.addWord.mockResolvedValue({ ...entry("sanction"), id: "b" });
    const user = userEvent.setup();
    render(<App />);
    await saveRepeat(user);
    await waitFor(() => expect(mocked.defineWord).toHaveBeenCalledWith("sanction"));
  });

  it("shows every sentence and its book, each with its own meaning", async () => {
    mocked.listWords.mockResolvedValue([
      foundRow("b", {
        created_at: "2026-11-02T10:00:00Z",
        sentence: "It punished them.",
        book: { title: "Beloved" },
        ai_content: { ...aiContent, chosenMeaning: { partOfSpeech: "noun", definition: "A penalty." } },
      }),
      foundRow("a", {
        created_at: "2026-11-01T10:00:00Z",
        sentence: "They approved it.",
        book: { title: "Middlemarch" },
        ai_content: { ...aiContent, chosenMeaning: { partOfSpeech: "noun", definition: "An approval." } },
      }),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    const page = screen.getByRole("article");
    expect(within(page).getByText("They approved it.")).toBeVisible();
    expect(within(page).getByText("It punished them.")).toBeVisible();
    expect(within(page).getByText("Beloved")).toBeVisible();
    expect(within(page).getByText("Middlemarch")).toBeVisible();
    const help = within(page).getByRole("region", { name: "Written by AI" });
    expect(within(help).getByText("In your sentences, it means")).toBeVisible();
    expect(within(help).getByText(/A penalty\./)).toBeVisible();
    expect(within(help).getByText(/An approval\./)).toBeVisible();
    expect(mocked.explainWord).not.toHaveBeenCalled();
  });

  it("fills in the meaning for an older repeat's sentence when opened", async () => {
    mocked.listWords.mockResolvedValue([
      foundRow("b", { created_at: "2026-11-02T10:00:00Z", sentence: "An older repeat.", ai_content: null }),
      foundRow("a", { created_at: "2026-11-01T10:00:00Z" }),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    await waitFor(() => expect(mocked.explainWord).toHaveBeenCalledWith("sanction", "An older repeat.", definitions));
    expect(mocked.explainWord).toHaveBeenCalledTimes(1);
  });

  it("corrects every save of a typo together, so it doesn't split apart", async () => {
    const typo = (id: string, created_at: string) => ({
      ...entry("ephemral"),
      id,
      created_at,
      definition_status: "not_found" as const,
      spelling_suggestions: ["ephemeral"],
    });
    mocked.listWords.mockResolvedValue([typo("b", "2026-11-02T10:00:00Z"), typo("a", "2026-11-01T10:00:00Z")]);
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "ephemeral" }));

    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("a", "found", definitions, "ephemeral", null));
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("b", "found", definitions, "ephemeral", null));
    expect(await screen.findByLabelText("1 word saved")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "ephemeral" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "ephemral" })).not.toBeInTheDocument();
  });

  it("stays on the word's page when a typo with repeats is corrected there", async () => {
    const typo = { ...entry("ephemral"), definition_status: "not_found" as const, spelling_suggestions: ["ephemeral"] };
    mocked.listWords.mockResolvedValue([typo]);
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "ephemral" }));
    await user.click(within(screen.getByRole("article")).getByRole("button", { name: "ephemeral" }));
    expect(await screen.findByRole("heading", { name: "ephemeral" })).toBeVisible();
  });

  it("keeps one entry when a repeat can't copy the saved details, and doesn't retry endlessly", async () => {
    mocked.listWords.mockResolvedValue([foundRow("a", { created_at: "2026-11-01T10:00:00Z" })]);
    mocked.addWord.mockResolvedValue({ ...entry("sanction"), id: "b" });
    mocked.saveDefinitions.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<App />);
    await saveRepeat(user);
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("button", { name: "sanction" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "sanction" }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mocked.saveDefinitions).toHaveBeenCalledTimes(1);
  });

  it("copies the saved details to a repeat left without them, when the word is opened", async () => {
    mocked.listWords.mockResolvedValue([
      { ...entry("sanction", undefined, "A stranded line."), id: "b", created_at: "2026-11-02T10:00:00Z" },
      foundRow("a", { created_at: "2026-11-01T10:00:00Z" }),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("b", "found", definitions, null, null));
    await waitFor(() => expect(mocked.explainWord).toHaveBeenCalledWith("sanction", "A stranded line.", definitions));
    expect(mocked.defineWord).not.toHaveBeenCalled();
    expect(mocked.saveDefinitions).toHaveBeenCalledTimes(1);
  });
});

describe("when AI is unavailable", () => {
  const withExamples = {
    source: "Wiktionary",
    sourceUrl: "https://example.test",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          { definition: "One.", example: "Line one." },
          { definition: "Two.", example: "Line two." },
          { definition: "Three.", example: "Line one." },
          { definition: "Four." },
          { definition: "Five.", example: "Line three." },
          { definition: "Six.", example: "Line four." },
        ],
      },
    ],
  };

  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
    mocked.addWord.mockResolvedValue(entry("sanction"));
    mocked.defineWord.mockResolvedValue({ status: "found", definitions: withExamples });
    mocked.explainWord.mockRejectedValueOnce(new Error("unavailable"));
  });

  async function saveAndOpen(user: ReturnType<typeof userEvent.setup>) {
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "sanction{Enter}");
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalled());
    await screen.findByText("Incomplete");
  }

  it("still saves the word and its definitions, and flags it in the list", async () => {
    const user = userEvent.setup();
    await saveAndOpen(user);
    expect(mocked.addWord).toHaveBeenCalledWith("sanction", null, null, expect.anything());
    expect(mocked.saveDefinitions).toHaveBeenCalledWith("sanction", "found", withExamples, null, null);
    expect(mocked.saveAiContent).not.toHaveBeenCalled();
    expect(screen.getByText("Incomplete")).toBeVisible();
  });

  it("shows up to 3 different dictionary examples, and the label, on the word's page", async () => {
    const user = userEvent.setup();
    await saveAndOpen(user);
    await user.click(screen.getByRole("button", { name: "sanction" }));
    const box = screen.getByRole("region", { name: "Incomplete" });
    expect(within(box).getByText("Incomplete")).toBeVisible();
    expect(within(box).getByRole("heading", { name: "Examples from the dictionary" })).toBeVisible();
    expect(within(box).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Line one.", "Line two.", "Line three."]);
  });

  it("says so when the dictionary has no examples", async () => {
    const noExamples = { ...definitions, meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "Plain." }] }] };
    mocked.defineWord.mockResolvedValue({ status: "found", definitions: noExamples });
    const user = userEvent.setup();
    await saveAndOpen(user);
    await user.click(screen.getByRole("button", { name: "sanction" }));
    expect(screen.getByText("The dictionary has no examples for this word.")).toBeVisible();
  });

  it("fills in the AI content on Try AI again, and clears the label", async () => {
    const user = userEvent.setup();
    await saveAndOpen(user);
    await user.click(screen.getByRole("button", { name: "sanction" }));
    await user.click(screen.getByRole("button", { name: "Try AI again" }));

    expect(await screen.findByText("First AI line.")).toBeVisible();
    expect(mocked.saveAiContent).toHaveBeenCalledWith("sanction", aiContent);
    expect(mocked.explainWord).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
    expect(mocked.defineWord).toHaveBeenCalledTimes(1);
  });

  it("stays incomplete if another try fails, and still allows more", async () => {
    mocked.explainWord.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    await saveAndOpen(user);
    await user.click(screen.getByRole("button", { name: "sanction" }));
    await user.click(screen.getByRole("button", { name: "Try AI again" }));
    await waitFor(() => expect(mocked.explainWord).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Try AI again" })).toBeVisible();
    expect(mocked.saveAiContent).not.toHaveBeenCalled();
  });

  it("flags an older word with no AI content, until it's opened", async () => {
    mocked.explainWord.mockReset();
    mocked.explainWord.mockResolvedValue(aiContent);
    mocked.listWords.mockResolvedValue([{ ...entry("older"), definitions, definition_status: "found" }]);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText("Incomplete")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "older" }));
    expect(await screen.findByText("First AI line.")).toBeVisible();
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
  });

  it("doesn't flag a word while AI is still working", async () => {
    mocked.explainWord.mockReset();
    mocked.explainWord.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "sanction{Enter}");
    await waitFor(() => expect(mocked.explainWord).toHaveBeenCalled());
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
  });
});

describe("pronunciation", () => {
  const found = (word: string, extra = {}) => ({ ...entry(word), definitions, definition_status: "found" as const, ai_content: aiContent, ...extra });
  const recording = { audio: "https://example.test/word-us.mp3", text: "/ˈsæŋkʃən/" };

  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
  });

  async function open(word: string, row: ReturnType<typeof found>) {
    mocked.listWords.mockResolvedValue([row]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: word }));
    return user;
  }

  it("fetches and saves the pronunciation when a word is opened", async () => {
    mocked.pronounceWord.mockResolvedValue(recording);
    await open("sanction", found("sanction"));
    expect(mocked.pronounceWord).toHaveBeenCalledWith("sanction");
    await waitFor(() => expect(mocked.savePronunciation).toHaveBeenCalledWith("sanction", recording));
    expect(await screen.findByText("/ˈsæŋkʃən/")).toBeVisible();
    expect(mocked.pronounceWord).toHaveBeenCalledTimes(1);
  });

  it("plays the recording on a tap", async () => {
    const user = await open("sanction", found("sanction", { pronunciation: recording }));
    await user.click(screen.getByRole("button", { name: "Play pronunciation of sanction" }));
    expect(playWord).toHaveBeenCalledWith("sanction", recording.audio);
    expect(mocked.pronounceWord).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Play pronunciation of sanction" })).toBeEnabled();
  });

  it("uses the base form for a changed word", async () => {
    const user = await open("mitigate", found("mitigated", { base_form: "mitigate" }));
    expect(mocked.pronounceWord).toHaveBeenCalledWith("mitigate");
    await user.click(screen.getByRole("button", { name: "Play pronunciation of mitigate" }));
    expect(playWord).toHaveBeenCalledWith("mitigate", null);
  });

  it("still offers play when the pronunciation lookup fails", async () => {
    mocked.pronounceWord.mockRejectedValue(new Error("unavailable"));
    const user = await open("sanction", found("sanction"));
    await user.click(await screen.findByRole("button", { name: "Play pronunciation of sanction" }));
    expect(playWord).toHaveBeenCalledWith("sanction", undefined);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mocked.pronounceWord).toHaveBeenCalledTimes(1);
  });

  it("can read aloud a word that isn't in the dictionary, with no lookup", async () => {
    const row = { ...entry("hobbitish"), definition_status: "not_found" as const, kept_as_typed: true };
    mocked.listWords.mockResolvedValue([row]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "hobbitish" }));
    await user.click(screen.getByRole("button", { name: "Play pronunciation of hobbitish" }));
    expect(playWord).toHaveBeenCalledWith("hobbitish", undefined);
    expect(mocked.pronounceWord).not.toHaveBeenCalled();
  });

  it("explains when nothing could play, and allows another try", async () => {
    vi.mocked(playWord).mockResolvedValueOnce("failed");
    const user = await open("sanction", found("sanction", { pronunciation: recording }));
    await user.click(screen.getByRole("button", { name: "Play pronunciation of sanction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The sound didn't play");
    await user.click(screen.getByRole("button", { name: "Play pronunciation of sanction" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("shows a playing state and blocks repeat taps meanwhile", async () => {
    let finish: (result: "played") => void = () => {};
    vi.mocked(playWord).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const user = await open("sanction", found("sanction", { pronunciation: recording }));
    await user.click(screen.getByRole("button", { name: "Play pronunciation of sanction" }));
    const button = screen.getByRole("button", { name: "Play pronunciation of sanction" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Playing…");
    await act(async () => finish("played"));
    expect(button).toBeEnabled();
  });
});

describe("typos and unknown words", () => {
  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
    mocked.keepAsTyped.mockResolvedValue();
  });

  async function saveTypo(user: ReturnType<typeof userEvent.setup>, suggestions: string[] = ["ephemeral", "ephemera"]) {
    mocked.addWord.mockResolvedValue(entry("ephemral"));
    mocked.defineWord.mockResolvedValueOnce({ status: "not_found", suggestions });
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "ephemral{Enter}");
    await screen.findByText("Check this word");
  }

  it("flags the word and offers suggestions right in the list", async () => {
    const user = userEvent.setup();
    await saveTypo(user);
    expect(screen.getByRole("button", { name: "ephemeral" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ephemera" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Keep ephemral as typed" })).toBeVisible();
    expect(mocked.saveDefinitions).toHaveBeenCalledWith("ephemral", "not_found", null, null, ["ephemeral", "ephemera"]);
  });

  it("fixes a typo with one tap, keeping what was typed", async () => {
    const user = userEvent.setup();
    await saveTypo(user);
    mocked.defineWord.mockResolvedValueOnce({ status: "found", definitions });
    await user.click(screen.getByRole("button", { name: "ephemeral" }));

    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("ephemral", "found", definitions, "ephemeral", null));
    expect(mocked.defineWord).toHaveBeenLastCalledWith("ephemeral");
    expect(await screen.findByText("You typed ephemral")).toBeVisible();
    expect(screen.queryByText("Check this word")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep ephemral as typed" })).not.toBeInTheDocument();
  });

  it("uses the base form of a chosen spelling", async () => {
    const user = userEvent.setup();
    await saveTypo(user, ["runing"]);
    mocked.defineWord.mockResolvedValueOnce({ status: "found", definitions, baseForm: "run" });
    await user.click(screen.getByRole("button", { name: "runing" }));
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenLastCalledWith("ephemral", "found", definitions, "run", null));
  });

  it("keeps a word as typed, with a visible flag that lasts", async () => {
    const user = userEvent.setup();
    await saveTypo(user);
    await user.click(screen.getByRole("button", { name: "Keep ephemral as typed" }));

    expect(mocked.keepAsTyped).toHaveBeenCalledWith("ephemral");
    expect(await screen.findByText("Not in the dictionary")).toBeVisible();
    expect(screen.queryByText("Check this word")).not.toBeInTheDocument();
    expect(screen.queryByText("Did you mean")).not.toBeInTheDocument();
  });

  it("offers keeping when there are no suggestions", async () => {
    const user = userEvent.setup();
    await saveTypo(user, []);
    expect(screen.queryByText("Did you mean")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep ephemral as typed" })).toBeVisible();
  });

  it("keeps the suggestions when a chosen spelling can't be defined", async () => {
    const user = userEvent.setup();
    await saveTypo(user);
    mocked.defineWord.mockResolvedValueOnce({ status: "not_found", suggestions: [] });
    await user.click(screen.getByRole("button", { name: "ephemeral" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save");
    expect(screen.getByRole("button", { name: "ephemeral" })).toBeVisible();
    expect(mocked.saveDefinitions).toHaveBeenCalledTimes(1);
  });

  it("offers another try when keeping fails", async () => {
    const user = userEvent.setup();
    await saveTypo(user);
    mocked.keepAsTyped.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Keep ephemral as typed" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save");
    expect(screen.getByText("Check this word")).toBeVisible();
  });

  it("offers the same choices on the word's page", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("ephemral"), definition_status: "not_found", spelling_suggestions: ["ephemeral"] }]);
    mocked.defineWord.mockResolvedValue({ status: "found", definitions });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "ephemral" }));
    expect(mocked.defineWord).not.toHaveBeenCalled();
    const page = screen.getByRole("article");
    await user.click(within(page).getByRole("button", { name: "ephemeral" }));
    expect(await screen.findByText("An approval.")).toBeVisible();
  });

  it("fetches suggestions once for a word flagged before they existed", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("older"), definition_status: "not_found" }]);
    mocked.defineWord.mockResolvedValue({ status: "not_found", suggestions: [] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "older" }));
    await waitFor(() => expect(mocked.saveDefinitions).toHaveBeenCalledWith("older", "not_found", null, null, []));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocked.defineWord).toHaveBeenCalledTimes(1);
  });

  it("doesn't look up a word already kept as typed", async () => {
    mocked.listWords.mockResolvedValue([{ ...entry("hobbitish"), definition_status: "not_found", kept_as_typed: true }]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "hobbitish" }));
    expect(mocked.defineWord).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Keep hobbitish as typed" })).not.toBeInTheDocument();
  });
});

describe("reading without signal", () => {
  const offlineError = new Error("offline");
  const cachedWord = { ...entry("sanction"), definitions, definition_status: "found" as const };

  it("shows saved words and definitions when the list can't refresh", async () => {
    localStorage.setItem("wordarchive.words.v1", JSON.stringify([cachedWord]));
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockRejectedValue(offlineError);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/seeing your saved copy/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "sanction" }));
    expect(screen.getByText("An approval.")).toBeVisible();
    expect(mocked.defineWord).not.toHaveBeenCalled();
  });

  it("stays signed in when sign-in can't be checked with no signal", async () => {
    localStorage.setItem("wordarchive.words.v1", JSON.stringify([cachedWord]));
    mocked.getSession.mockRejectedValue(offlineError);
    mocked.isOfflineError.mockReturnValue(true);
    mocked.listWords.mockRejectedValue(offlineError);
    render(<App />);
    expect(await screen.findByRole("button", { name: "sanction" })).toBeVisible();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("explains when there's nothing saved and no signal", async () => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockRejectedValue(offlineError);
    render(<App />);
    expect(await screen.findByText("Your words didn't load. Check your connection and reopen the app.")).toBeVisible();
  });

  it("keeps the saved copy up to date", async () => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([cachedWord]);
    render(<App />);
    await screen.findByRole("button", { name: "sanction" });
    await waitFor(() => expect(localStorage.getItem("wordarchive.words.v1")).toContain("An approval."));
  });

  it("removes the saved copy on sign-out, so it can't be read afterwards", async () => {
    localStorage.setItem("wordarchive.words.v1", JSON.stringify([cachedWord]));
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([cachedWord]);
    let notify: (value: Awaited<ReturnType<typeof api.getSession>>) => void = () => {};
    mocked.onSessionChange.mockImplementation((listener) => {
      notify = listener;
      return () => {};
    });
    render(<App />);
    await screen.findByRole("button", { name: "sanction" });
    await act(async () => notify(null));
    expect(await screen.findByLabelText("Password")).toBeVisible();
    await waitFor(() => expect(localStorage.getItem("wordarchive.words.v1")).toBeNull());
    expect(screen.queryByText("sanction")).not.toBeInTheDocument();
  });

  it("clears any leftover copy when opening signed out", async () => {
    localStorage.setItem("wordarchive.words.v1", JSON.stringify([cachedWord]));
    mocked.getSession.mockResolvedValue(null);
    render(<App />);
    await screen.findByLabelText("Password");
    await waitFor(() => expect(localStorage.getItem("wordarchive.words.v1")).toBeNull());
  });
});

describe("book sentences", () => {
  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
  });

  it("saves the sentence, shows it on the word's page, then clears the box", async () => {
    const line = "The sanction was granted.";
    mocked.addWord.mockResolvedValue(entry("sanction", undefined, line));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "sanction");
    await user.type(screen.getByLabelText("Sentence from the book (optional)"), `  ${line}  `);
    await user.click(screen.getByRole("button", { name: "Save word" }));

    expect(mocked.addWord).toHaveBeenCalledWith("sanction", null, line, expect.anything());
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(screen.getByText(line)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to words" }));
    expect(screen.getByLabelText("Sentence from the book (optional)")).toHaveValue("");
  });

  it("saves a word with Return and no sentence, with no extra steps", async () => {
    mocked.addWord.mockResolvedValue(entry("ephemeral"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "ephemeral{Enter}");

    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null, null, expect.anything());
    await user.click(await screen.findByRole("button", { name: "ephemeral" }));
    expect(screen.getByText("No book sentence saved with this word.")).toBeVisible();
  });

  it("treats a sentence of only spaces as none", async () => {
    mocked.addWord.mockResolvedValue(entry("ephemeral"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "ephemeral");
    await user.type(screen.getByLabelText("Sentence from the book (optional)"), "   ");
    await user.click(screen.getByRole("button", { name: "Save word" }));
    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null, null, expect.anything());
  });

  it("keeps half-typed text when opening a word and coming back", async () => {
    mocked.listWords.mockResolvedValue([entry("sanction")]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("New word"), "halfway");
    await user.click(await screen.findByRole("button", { name: "sanction" }));
    expect(screen.queryByLabelText("New word")).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to words" }));
    expect(screen.getByLabelText("New word")).toHaveValue("halfway");
  });
});

describe("saving quotes", () => {
  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
  });

  async function openQuotes(user: ReturnType<typeof userEvent.setup>) {
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Quotes" }));
    return screen.findByLabelText("New quote");
  }

  it("saves a quote exactly as entered, against the current book", async () => {
    const quote = `  "It is," she said,\n'a truth…'  `;
    mocked.getCurrentBook.mockResolvedValue(middlemarch);
    mocked.addQuote.mockResolvedValue(savedQuote(quote, middlemarch));
    const user = userEvent.setup();
    const box = await openQuotes(user);
    await screen.findByText(/by George Eliot/);
    box.focus();
    await user.paste(quote);
    await user.click(screen.getByRole("button", { name: "Save quote" }));

    expect(mocked.addQuote).toHaveBeenCalledWith(quote, "b1", expect.anything());
    expect(await screen.findByRole("status", { name: "" })).toBeInTheDocument();
    const saved = document.querySelector(".quotes blockquote");
    expect(saved?.textContent).toBe(quote);
    expect(within(document.querySelector(".quotes li") as HTMLElement).getByText("Middlemarch")).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(screen.getByLabelText("1 quote saved")).toBeInTheDocument();
  });

  it("shows saved quotes after reopening", async () => {
    mocked.listQuotes.mockResolvedValue([savedQuote("Old words", middlemarch)]);
    const user = userEvent.setup();
    await openQuotes(user);
    expect(await screen.findByText("Old words")).toBeVisible();
  });

  it("rejects a blank quote without calling the server", async () => {
    const user = userEvent.setup();
    const box = await openQuotes(user);
    await screen.findByText("No book chosen yet");
    await user.type(box, "   ");
    await user.click(screen.getByRole("button", { name: "Save quote" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type or dictate a quote to save.");
    expect(mocked.addQuote).not.toHaveBeenCalled();
  });

  it("keeps a half-typed quote when switching tabs or books", async () => {
    mocked.listBooks.mockResolvedValue([middlemarch]);
    const user = userEvent.setup();
    const box = await openQuotes(user);
    await screen.findByText("No book chosen yet");
    await user.type(box, "Half a quote");
    await user.click(screen.getByRole("button", { name: "Words" }));
    await user.click(screen.getByRole("button", { name: "Choose a book" }));
    await user.click(await screen.findByRole("button", { name: /Middlemarch/ }));
    await screen.findByText(/by George Eliot/);
    await user.click(screen.getByRole("button", { name: "Quotes" }));
    expect(screen.getByLabelText("New quote")).toHaveValue("Half a quote");
  });
});

describe("signing in", () => {
  beforeEach(() => mocked.getSession.mockResolvedValue(null));

  it("signs in with an email and password", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Email"), " reader@example.test ");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(mocked.signIn).toHaveBeenCalledWith("reader@example.test", "test-password");
  });

  it("explains a failed sign-in and allows another try", async () => {
    mocked.signIn.mockRejectedValue(new Error("invalid"));
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Email"), "reader@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You weren't signed in");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows no words when signed out", async () => {
    render(<App />);
    await screen.findByLabelText("Email");
    expect(mocked.listWords).not.toHaveBeenCalled();
  });
});

describe("saving words", () => {
  beforeEach(() => mocked.getSession.mockResolvedValue(session));

  it("shows saved words after reopening", async () => {
    mocked.listWords.mockResolvedValue([entry("ephemeral")]);
    render(<App />);
    expect(await screen.findByText("ephemeral")).toBeInTheDocument();
    expect(screen.getByLabelText("1 word saved")).toHaveTextContent("1");
  });

  it("saves a cleaned-up word, puts it first and clears the box", async () => {
    mocked.listWords.mockResolvedValue([entry("sanction")]);
    mocked.addWord.mockResolvedValue(entry("ephemeral"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("sanction");
    await screen.findByText("No book chosen yet");

    await user.type(screen.getByLabelText("New word"), " Ephemeral. {Enter}");

    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null, null, expect.anything());
    expect(await screen.findByRole("status")).toHaveTextContent("Saved ephemeral");
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("ephemeral");
    expect(screen.getByLabelText("New word")).toHaveValue("");
    expect(screen.getByLabelText("2 words saved")).toBeInTheDocument();
  });

  it("rejects two words without calling the server", async () => {
    mocked.listWords.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/Your words will appear here/);
    await user.type(screen.getByLabelText("New word"), "two words{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Save one word at a time.");
    expect(mocked.addWord).not.toHaveBeenCalled();
  });

  it("signs out when asked", async () => {
    mocked.listWords.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocked.signOut).toHaveBeenCalled());
  });
});

describe("the current book", () => {
  beforeEach(() => {
    mocked.getSession.mockResolvedValue(session);
    mocked.listWords.mockResolvedValue([]);
  });

  it("shows the saved current book after reopening", async () => {
    mocked.getCurrentBook.mockResolvedValue(middlemarch);
    render(<App />);
    expect(await screen.findByText("Middlemarch")).toBeInTheDocument();
    expect(screen.getByText(/by George Eliot/)).toBeInTheDocument();
  });

  it("attaches a new word to the current book with no extra steps", async () => {
    mocked.getCurrentBook.mockResolvedValue(middlemarch);
    mocked.addWord.mockResolvedValue(entry("ephemeral", "Middlemarch"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/by George Eliot/);
    await user.type(screen.getByLabelText("New word"), "ephemeral{Enter}");
    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", "b1", null, expect.anything());
    const row = (await screen.findAllByRole("listitem"))[0];
    expect(within(row).getByText("Middlemarch")).toBeInTheDocument();
  });

  it("won't save against no book while the current book is unknown", async () => {
    mocked.getCurrentBook.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/Your current book didn't load/);
    await user.type(screen.getByLabelText("New word"), "ephemeral{Enter}");
    expect(mocked.addWord).not.toHaveBeenCalled();
    expect(screen.getByText(/current book hasn't loaded/)).toBeInTheDocument();
    expect(screen.getByLabelText("New word")).toHaveValue("ephemeral");
  });

  it("switches book, and later words use the new one", async () => {
    mocked.getCurrentBook.mockResolvedValue(middlemarch);
    mocked.listBooks.mockResolvedValue([beloved, middlemarch]);
    mocked.addWord.mockResolvedValue(entry("sanction", "Beloved"));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Change book" }));
    expect(await screen.findByRole("button", { name: /Middlemarch.*Reading now/ })).toHaveAttribute("aria-current", "true");
    await user.click(screen.getByRole("button", { name: /Beloved/ }));

    expect(mocked.setCurrentBook).toHaveBeenCalledWith("b2");
    await screen.findByText(/by Toni Morrison/);
    await user.type(screen.getByLabelText("New word"), "sanction{Enter}");
    expect(mocked.addWord).toHaveBeenCalledWith("sanction", "b2", null, expect.anything());
  });

  it("adds a book and makes it current", async () => {
    mocked.addBook.mockResolvedValue(middlemarch);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a book" }));
    await user.type(await screen.findByLabelText("Title"), " Middlemarch ");
    await user.type(screen.getByLabelText("Author"), " George Eliot ");
    await user.click(screen.getByRole("button", { name: "Add book" }));

    expect(mocked.addBook).toHaveBeenCalledWith("Middlemarch", "George Eliot");
    expect(mocked.setCurrentBook).toHaveBeenCalledWith("b1");
    expect(await screen.findByText(/by George Eliot/)).toBeInTheDocument();
  });

  it("requires a title and author", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a book" }));
    await user.type(await screen.findByLabelText("Title"), "Middlemarch");
    await user.click(screen.getByRole("button", { name: "Add book" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the book's title and author.");
    expect(mocked.addBook).not.toHaveBeenCalled();
  });

  it("stays on the books screen when changing book fails", async () => {
    mocked.listBooks.mockResolvedValue([middlemarch]);
    mocked.setCurrentBook.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Choose a book" }));
    await user.click(await screen.findByRole("button", { name: /Middlemarch/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current book didn't change");
    expect(screen.getByRole("button", { name: /Middlemarch/ })).toBeEnabled();
  });
});
