import { render, screen, waitFor, within } from "@testing-library/react";
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
}));

const mocked = vi.mocked(api);
const session = { access_token: "token" } as Awaited<ReturnType<typeof api.getSession>>;
const middlemarch = { id: "b1", title: "Middlemarch", author: "George Eliot" };
const beloved = { id: "b2", title: "Beloved", author: "Toni Morrison" };
const entry = (word: string, title?: string) => ({
  id: word,
  word,
  created_at: "2026-11-02T10:00:00Z",
  book: title ? { title } : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.onSessionChange.mockReturnValue(() => {});
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

    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", null);
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
    expect(mocked.addWord).toHaveBeenCalledWith("ephemeral", "b1");
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
    expect(mocked.addWord).toHaveBeenCalledWith("sanction", "b2");
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
