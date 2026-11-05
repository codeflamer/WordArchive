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
  await db.exec(readFileSync("supabase/migrations/005_word_definitions.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/006_word_base_form.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/007_word_spelling.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/008_word_ai_content.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/009_word_pronunciation.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/010_word_reviews.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/011_keep_awake.sql", "utf8"));
});

describe("review schedule and history", () => {
  const card = (due: string) => JSON.stringify({ due, last_review: "2026-11-05T12:00:00Z", reps: 1 });
  const record = (key: string, rating: number, due: string) =>
    db.query("select public.record_review($1, $2, $3::jsonb)", [key, rating, card(due)]);

  it("saves the next date and a history row together, keeping one schedule per word", async () => {
    await as("authenticated", ALICE);
    await record("sanction", 1, "2026-11-05T12:01:00Z");
    await record("sanction", 4, "2026-11-15T12:00:00Z");
    const schedule = await db.query<{ word_key: string; user_id: string; due: Date }>("select word_key, user_id, due from public.word_reviews");
    expect(schedule.rows).toHaveLength(1);
    expect(schedule.rows[0]).toMatchObject({ word_key: "sanction", user_id: ALICE });
    expect(schedule.rows[0].due.toISOString()).toBe("2026-11-15T12:00:00.000Z");
    const history = await db.query("select rating from public.word_review_log order by next_due");
    expect(history.rows).toEqual([{ rating: 1 }, { rating: 4 }]);
  });

  it("saves neither when the rating is invalid", async () => {
    await as("authenticated", ALICE);
    await expect(record("sanction", 9, "2026-11-15T12:00:00Z")).rejects.toThrow(/check constraint/);
    expect((await db.query("select * from public.word_reviews")).rows).toEqual([]);
  });

  it("hides one user's schedule and history from another, and keeps their words apart", async () => {
    await as("authenticated", ALICE);
    await record("sanction", 4, "2026-11-15T12:00:00Z");
    await as("authenticated", BOB);
    expect((await db.query("select * from public.word_reviews")).rows).toEqual([]);
    expect((await db.query("select * from public.word_review_log")).rows).toEqual([]);
    await record("sanction", 1, "2026-11-05T12:01:00Z");
    expect((await db.query("select * from public.word_reviews")).rows).toHaveLength(1);
    await as("authenticated", ALICE);
    const { rows } = await db.query<{ due: Date }>("select due from public.word_reviews");
    expect(rows[0].due.toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });

  it("doesn't change another user's schedule, and stops saving as someone else", async () => {
    await as("authenticated", ALICE);
    await record("sanction", 4, "2026-11-15T12:00:00Z");
    await as("authenticated", BOB);
    expect((await db.query("update public.word_reviews set due = now()")).affectedRows).toBe(0);
    await expect(
      db.query("insert into public.word_review_log (user_id, word_key, rating, reviewed_at, next_due) values ($1, 'x', 1, now(), now())", [ALICE]),
    ).rejects.toThrow(/row-level security/);
  });

  it("never lets history be changed or deleted", async () => {
    await as("authenticated", ALICE);
    await record("sanction", 4, "2026-11-15T12:00:00Z");
    await expect(db.query("update public.word_review_log set rating = 1")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.word_review_log")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.word_reviews")).rejects.toThrow(/permission denied/);
  });

  it("blocks signed-out access", async () => {
    await as("anon", null);
    await expect(db.query("select * from public.word_reviews")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.word_review_log")).rejects.toThrow(/permission denied/);
    await expect(record("sanction", 4, "2026-11-15T12:00:00Z")).rejects.toThrow(/permission denied/);
  });
});

describe("keeping the database awake", () => {
  it("lets the public key record a run, and only ever keeps one row", async () => {
    await as("anon", null);
    await db.query("select public.record_keep_awake()");
    await db.query("select public.record_keep_awake()");
    await as("authenticated", ALICE);
    const { rows } = await db.query("select last_run from public.keep_awake");
    expect(rows).toHaveLength(1);
  });

  it("gives the public key no other access", async () => {
    await as("anon", null);
    await expect(db.query("select * from public.keep_awake")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.keep_awake (id) values (true)")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.keep_awake")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.words")).rejects.toThrow(/permission denied/);
  });

  it("lets signed-in readers see the time, but not change it", async () => {
    await as("anon", null);
    await db.query("select public.record_keep_awake()");
    await as("authenticated", BOB);
    expect((await db.query("select * from public.keep_awake")).rows).toHaveLength(1);
    await expect(db.query("update public.keep_awake set last_run = now()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.record_keep_awake()")).rejects.toThrow(/permission denied/);
  });

  it("can't add a second row", async () => {
    await expect(db.query("insert into public.keep_awake (id) values (false)")).rejects.toThrow(/check constraint/);
  });
});

describe("saves sent from the phone", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("accepts the phone's ID and time, and refuses the same ID twice", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (id, word, created_at) values ($1, 'offline', '2026-11-01T08:00:00Z')", [ID]);
    const { rows } = await db.query<{ id: string; created_at: Date }>("select id, created_at from public.words");
    expect(rows[0].id).toBe(ID);
    expect(rows[0].created_at.toISOString()).toBe("2026-11-01T08:00:00.000Z");
    await expect(db.query("insert into public.words (id, word) values ($1, 'offline')", [ID])).rejects.toMatchObject({ code: "23505" });
    expect((await db.query("select * from public.words")).rows).toHaveLength(1);
  });

  it("does the same for quotes", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.quotes (id, body) values ($1, 'A line')", [ID]);
    await expect(db.query("insert into public.quotes (id, body) values ($1, 'A line')", [ID])).rejects.toMatchObject({ code: "23505" });
    expect((await db.query("select * from public.quotes")).rows).toHaveLength(1);
  });
});

describe("pronunciation", () => {
  const value = JSON.stringify({ audio: null, text: "/a/" });

  it("stores a pronunciation on a user's own word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await db.query("update public.words set pronunciation = $1::jsonb", [value]);
    const { rows } = await db.query("select pronunciation from public.words");
    expect(rows).toEqual([{ pronunciation: { audio: null, text: "/a/" } }]);
  });

  it("doesn't change another user's word, and blocks signed-out changes", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await as("authenticated", BOB);
    expect((await db.query("update public.words set pronunciation = $1::jsonb", [value])).affectedRows).toBe(0);
    await as("anon", null);
    await expect(db.query("update public.words set pronunciation = $1::jsonb", [value])).rejects.toThrow(/permission denied/);
  });
});

describe("AI content", () => {
  const content = JSON.stringify({ chosenMeaning: null, examples: ["One.", "Two.", "Three."] });

  it("stores AI content on a user's own word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await db.query("update public.words set ai_content = $1::jsonb", [content]);
    const { rows } = await db.query<{ ai_content: { examples: string[] } }>("select ai_content from public.words");
    expect(rows[0].ai_content.examples).toHaveLength(3);
  });

  it("doesn't change another user's word, and blocks signed-out changes", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await as("authenticated", BOB);
    expect((await db.query("update public.words set ai_content = $1::jsonb", [content])).affectedRows).toBe(0);
    await as("anon", null);
    await expect(db.query("update public.words set ai_content = $1::jsonb", [content])).rejects.toThrow(/permission denied/);
  });
});

describe("spelling", () => {
  it("stores suggestions and the keep choice on a user's own word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('ephemral')");
    const before = await db.query("select spelling_suggestions, kept_as_typed from public.words");
    expect(before.rows).toEqual([{ spelling_suggestions: null, kept_as_typed: false }]);
    await db.query("update public.words set spelling_suggestions = $1, kept_as_typed = true", [["ephemeral"]]);
    const { rows } = await db.query("select spelling_suggestions, kept_as_typed from public.words");
    expect(rows).toEqual([{ spelling_suggestions: ["ephemeral"], kept_as_typed: true }]);
  });

  it("doesn't change another user's word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('ephemral')");
    await as("authenticated", BOB);
    const result = await db.query("update public.words set kept_as_typed = true");
    expect(result.affectedRows).toBe(0);
  });

  it("blocks signed-out changes", async () => {
    await as("anon", null);
    await expect(db.query("update public.words set kept_as_typed = true")).rejects.toThrow(/permission denied/);
  });
});

describe("base forms", () => {
  it("stores a base form beside the typed word, which can't change", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('mitigated')");
    await db.query("update public.words set base_form = 'mitigate'");
    const { rows } = await db.query("select word, base_form from public.words");
    expect(rows).toEqual([{ word: "mitigated", base_form: "mitigate" }]);
    await expect(db.query("update public.words set word = 'x'")).rejects.toThrow(/permission denied/);
  });

  it("doesn't change another user's word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('mitigated')");
    await as("authenticated", BOB);
    const result = await db.query("update public.words set base_form = 'forged'");
    expect(result.affectedRows).toBe(0);
  });

  it("blocks signed-out changes", async () => {
    await as("anon", null);
    await expect(db.query("update public.words set base_form = 'x'")).rejects.toThrow(/permission denied/);
  });
});

describe("definitions", () => {
  const definitions = JSON.stringify({ source: "Test", sourceUrl: "https://example.test", meanings: [] });

  it("lets a user fill in definitions on their own word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await db.query("update public.words set definitions = $1::jsonb, definition_status = 'found'", [definitions]);
    const { rows } = await db.query<{ definition_status: string }>("select definition_status from public.words");
    expect(rows).toEqual([{ definition_status: "found" }]);
  });

  it("doesn't change another user's word", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await as("authenticated", BOB);
    const result = await db.query("update public.words set definition_status = 'found'");
    expect(result.affectedRows).toBe(0);
    await as("authenticated", ALICE);
    const { rows } = await db.query("select definition_status from public.words");
    expect(rows).toEqual([{ definition_status: null }]);
  });

  it("still blocks changing the word, its sentence, its book or its owner", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    for (const column of ["word = 'x'", "sentence = 'x'", "book_id = null", `user_id = '${BOB}'`]) {
      await expect(db.query(`update public.words set ${column}`)).rejects.toThrow(/permission denied/);
    }
  });

  it("blocks signed-out updates and invalid statuses", async () => {
    await as("authenticated", ALICE);
    await db.query("insert into public.words (word) values ('sanction')");
    await expect(db.query("update public.words set definition_status = 'maybe'")).rejects.toThrow(/check constraint/);
    await as("anon", null);
    await expect(db.query("update public.words set definition_status = 'found'")).rejects.toThrow(/permission denied/);
  });
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

  it("keeps deletes and word changes switched off for now", async () => {
    await as("authenticated", ALICE);
    await expect(db.query("delete from public.words")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.words set word = 'x'")).rejects.toThrow(/permission denied/);
  });
});
