import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import * as api from "../src/lib/api";

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
  isOfflineError: vi.fn(),
}));

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

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocked.onSessionChange.mockReturnValue(() => {});
  mocked.isOfflineError.mockReturnValue(false);
  mocked.defineWord.mockResolvedValue({ status: "not_found" });
  mocked.saveDefinitions.mockResolvedValue();
  mocked.getCurrentBook.mockResolvedValue(null);
  mocked.listBooks.mockResolvedValue([]);
  mocked.listQuotes.mockResolvedValue([]);
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

    expect(mocked.addWord).toHaveBeenCalledWith("sanction", null, line);
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

    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null, null);
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
    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null, null);
  });

  it("keeps the sentence when saving fails", async () => {
    mocked.addWord.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "ephemeral");
    await user.type(screen.getByLabelText("Sentence from the book (optional)"), "A line");
    await user.click(screen.getByRole("button", { name: "Save word" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The word wasn't saved");
    expect(screen.getByLabelText("Sentence from the book (optional)")).toHaveValue("A line");
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

    expect(mocked.addQuote).toHaveBeenCalledWith(quote, "b1");
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

  it("keeps the typed quote when saving fails", async () => {
    mocked.addQuote.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    const box = await openQuotes(user);
    await screen.findByText("No book chosen yet");
    await user.type(box, "A line");
    await user.click(screen.getByRole("button", { name: "Save quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The quote wasn't saved");
    expect(box).toHaveValue("A line");
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

    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null, null);
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

  it("keeps the typed word when saving fails", async () => {
    mocked.listWords.mockResolvedValue([]);
    mocked.addWord.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("No book chosen yet");
    await user.type(screen.getByLabelText("New word"), "ephemeral{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The word wasn't saved");
    expect(screen.getByLabelText("New word")).toHaveValue("ephemeral");
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
    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", "b1", null);
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
    expect(mocked.addWord).toHaveBeenCalledWith("sanction", "b2", null);
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
