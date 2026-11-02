// @vitest-environment node
// Runs the real migration on a real Postgres engine (in memory) to prove words stay private.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

async function as(role: "anon" | "authenticated", uid: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('test.uid', $1, false)", [uid ?? ""]);
  await db.exec(`set role ${role}`);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    insert into auth.users values ('${ALICE}'), ('${BOB}');
  `);
  await db.exec(readFileSync("supabase/migrations/001_words.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/002_books.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/003_quotes.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/004_word_sentence.sql", "utf8"));
});

describe("book sentences", () => {
  it("saves a sentence with a word, and keeps it optional", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word, sentence) values ('with', 'A line from the book.')");
    await db.query("insert into public.words (word) values ('without')");
    const { rows } = await db.query("select word, sentence from public.words order by word");
    expect(rows).toEqual([
      { word: "with", sentence: "A line from the book." },
      { word: "without", sentence: null },
    ]);
  });

  it("keeps a sentence private to its owner", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word, sentence) values ('private', 'Secret line')");
    await as("authenticated", BOB);
    const { rows } = await db.query("select sentence from public.words");
    expect(rows).toEqual([]);
  });
});

describe("quotes access rules", () => {
  it("stores a quote character for character", async () => {
    const body = `  "It is," she said, 'a truth…'\n\n— and more.  `;
    await as("authenticated", ALICE);
    await db.query("insert into public.quotes (body) values ($1)", [body]);
    const { rows } = await db.query<{ body: string }>("select body from public.quotes");
    expect(rows[0].body).toBe(body);
  });

  it("hides a user's quotes from another user", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.quotes (body) values ('Private')");
    await as("authenticated", BOB);
    const { rows } = await db.query("select * from public.quotes");
    expect(rows).toEqual([]);
  });

  it("blocks signed-out reads and saves", async () => {
    await as("anon", null);
    await expect(db.query("select * from public.quotes")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.quotes (body) values ('x')")).rejects.toThrow(/permission denied/);
  });

  it("stops a user saving a quote as someone else, or against their book", async () => {
    await as("authenticated", ALICE);
    const { rows } = await db.query<{ id: string }>("insert into public.books (title, author) values ('A', 'B') returning id");
    await as("authenticated", BOB);
    await expect(db.query("insert into public.quotes (body, user_id) values ('forged', $1)", [ALICE])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into public.quotes (body, book_id) values ('forged', $1)", [rows[0].id])).rejects.toThrow(/foreign key/);
  });

  it("rejects a blank quote", async () => {
    await as("authenticated", ALICE);
    await expect(db.query("insert into public.quotes (body) values ('  \n ')")).rejects.toThrow(/check constraint/);
  });
});

async function addBookAs(uid: string, title: string) {
  await as("authenticated", uid);
  const { rows } = await db.query<{ id: string }>(
    "insert into public.books (title, author) values ($1, 'An Author') returning id",
    [title],
  );
  return rows[0].id;
}

describe("books and current book access rules", () => {
  it("hides a user's books from another user", async () => {
    await addBookAs(ALICE, "Middlemarch");
    await as("authenticated", BOB);
    const { rows } = await db.query("select * from public.books");
    expect(rows).toEqual([]);
  });

  it("blocks signed-out access to books and settings", async () => {
    await as("anon", null);
    await expect(db.query("select * from public.books")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.reader_settings")).rejects.toThrow(/permission denied/);
  });

  it("saves and changes the current book, keeping one setting per user", async () => {
    const first = await addBookAs(ALICE, "Middlemarch");
    const second = await addBookAs(ALICE, "Beloved");
    const upsert = `insert into public.reader_settings (user_id, current_book_id) values ($1, $2)
      on conflict (user_id) do update set current_book_id = excluded.current_book_id`;
    await db.query(upsert, [ALICE, first]);
    await db.query(upsert, [ALICE, second]);
    const { rows } = await db.query("select current_book_id from public.reader_settings");
    expect(rows).toEqual([{ current_book_id: second }]);
  });

  it("hides one user's setting from another", async () => {
    const book = await addBookAs(ALICE, "Middlemarch");
    await db.query("insert into public.reader_settings (user_id, current_book_id) values ($1, $2)", [ALICE, book]);
    await as("authenticated", BOB);
    const { rows } = await db.query("select * from public.reader_settings");
    expect(rows).toEqual([]);
  });

  it("stops a word or setting pointing at someone else's book", async () => {
    const book = await addBookAs(ALICE, "Middlemarch");
    await as("authenticated", BOB);
    await expect(db.query("insert into public.words (word, book_id) values ('forged', $1)", [book])).rejects.toThrow(/foreign key/);
    await expect(
      db.query("insert into public.reader_settings (user_id, current_book_id) values ($1, $2)", [BOB, book]),
    ).rejects.toThrow(/foreign key/);
  });

  it("links a word to its book and keeps older words without one", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('older')");
    const book = await addBookAs(ALICE, "Middlemarch");
    await db.query("insert into public.words (word, book_id) values ('newer', $1)", [book]);
    const { rows } = await db.query("select word, book_id from public.words order by word");
    expect(rows).toEqual([
      { word: "newer", book_id: book },
      { word: "older", book_id: null },
    ]);
  });
});

describe("words access rules", () => {
  it("lets a user save and read their own word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('ephemeral')");
    const { rows } = await db.query<{ word: string; user_id: string }>("select word, user_id from public.words");
    expect(rows).toEqual([{ word: "ephemeral", user_id: ALICE }]);
  });

  it("hides a user's words from another user", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('ephemeral')");
    await as("authenticated", BOB);
    const { rows } = await db.query("select * from public.words");
    expect(rows).toEqual([]);
  });

  it("stops a user saving a word as someone else", async () => {
    await as("authenticated", BOB);
    await expect(
      db.query("insert into public.words (word, user_id) values ('forged', $1)", [ALICE]),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks signed-out reads and saves", async () => {
    await as("anon", null);
    await expect(db.query("select * from public.words")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.words (word) values ('x')")).rejects.toThrow(/permission denied/);
  });

  it("keeps updates and deletes switched off for now", async () => {
    await as("authenticated", ALICE);
    await expect(db.query("delete from public.words")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.words set word = 'x'")).rejects.toThrow(/permission denied/);
  });
});
