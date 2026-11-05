// @vitest-environment node
// Exports a real account from a real Postgres engine (in memory), then restores the file into an empty account
// in a separate database, through the same access rules the app uses.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { buildExport, describeCounts, EXPORT_TABLES, exportFileName, type ExportFile, type ExportTable, type ExportTables, type Row } from "../src/lib/exportData";
import type { OutboxItem } from "../src/lib/outbox";

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
const CAROL = "00000000-0000-0000-0000-00000000000c";

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    insert into auth.users values ('${ALICE}'), ('${BOB}'), ('${CAROL}');
  `);
  for (const file of readdirSync("supabase/migrations").sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  return db;
}

async function as(db: PGlite, uid: string) {
  await db.exec("reset role");
  await db.query("select set_config('test.uid', $1, false)", [uid]);
  await db.exec("set role authenticated");
}

// The same reads the app makes: everything in each table, in a fixed order, limited by the access rules.
async function exportAs(db: PGlite, uid: string, waiting: OutboxItem[] = []): Promise<ExportFile> {
  await as(db, uid);
  const tables = {} as ExportTables;
  for (const [table, order] of Object.entries(EXPORT_TABLES) as [ExportTable, readonly string[]][]) {
    const { rows } = await db.query<Row>(`select * from public.${table} order by ${order.join(", ")}`);
    tables[table] = rows;
  }
  // Round-tripped through text, exactly as the saved file would be.
  return JSON.parse(JSON.stringify(buildExport(tables, waiting, new Date("2026-11-05T21:00:00Z")))) as ExportFile;
}

const asValue = (value: unknown) => (value !== null && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : value);

async function insert(db: PGlite, table: string, row: Row) {
  const columns = Object.keys(row);
  const values = columns.map((_, index) => `$${index + 1}`);
  await db.query(`insert into public.${table} (${columns.join(", ")}) values (${values.join(", ")})`, columns.map((column) => asValue(row[column])));
}

// Restores a file into an account, in the order the links between tables need.
async function restore(db: PGlite, uid: string, file: ExportFile) {
  await as(db, uid);
  for (const row of file.books) await insert(db, "books", row);
  for (const row of file.words) await insert(db, "words", row);
  for (const row of file.quotes) await insert(db, "quotes", row);
  for (const row of file.reviewSchedule) await insert(db, "word_reviews", row);
  for (const row of file.reviewHistory) await insert(db, "word_review_log", row);
  if (file.settings) await insert(db, "reader_settings", { ...file.settings, user_id: uid });
}

let source: PGlite;

beforeEach(async () => {
  source = await freshDatabase();
  await as(source, ALICE);
  const book = await source.query<{ id: string }>("insert into public.books (title, author) values ('Middlemarch', 'George Eliot') returning id");
  const bookId = book.rows[0].id;
  await source.query("insert into public.books (title, author) values ('Beloved', 'Toni Morrison')");
  await source.query("insert into public.reader_settings (user_id, current_book_id) values ($1, $2)", [ALICE, bookId]);
  await source.query("insert into public.words (word, book_id, sentence) values ('mitigated', $1, 'They mitigated the harm.')", [bookId]);
  await source.query("insert into public.words (word) values ('mitigate')");
  await source.query("insert into public.words (word) values ('ephemral')");
  await source.query(
    `update public.words set definition_status = 'found', base_form = 'mitigate',
       definitions = '{"source":"Test","sourceUrl":"https://example.test","meanings":[]}',
       ai_content = '{"chosenMeaning":null,"examples":["One.","Two.","Three."]}',
       pronunciation = '{"audio":null,"text":"/ˈmɪtɪɡeɪt/"}'
     where word like 'mitigate%'`,
  );
  await source.query("update public.words set definition_status = 'not_found', spelling_suggestions = $1, kept_as_typed = true where word = 'ephemral'", [["ephemeral", "ephemera"]]);
  await source.query("insert into public.quotes (body, book_id) values ($1, $2)", [`  "It is," she said,\n\n— a truth.  `, bookId]);
  await source.query("insert into public.quotes (body) values ('No book for this one')");
  await source.query("select public.quote_of_the_day('2026-11-05')");
  const card = (due: string) => JSON.stringify({ due, last_review: "2026-11-05T12:00:00Z", stability: 3.2, difficulty: 5.1, reps: 2, lapses: 1, state: 2 });
  await source.query("select public.record_review('mitigate', 1, $1::jsonb)", [card("2026-11-05T12:01:00Z")]);
  await source.query("select public.record_review('mitigate', 3, $1::jsonb)", [card("2026-11-08T12:00:00Z")]);

  await as(source, BOB);
  await source.query("insert into public.books (title, author) values ('Bob''s book', 'Someone')");
  await source.query("insert into public.words (word) values ('private')");
  await source.query("insert into public.quotes (body) values ('Bob''s quote')");
  await source.query("select public.record_review('private', 4, $1::jsonb)", [card("2026-11-20T12:00:00Z")]);
});

describe("exporting everything", () => {
  it("holds every book, word, quote, review and setting, and nothing of anyone else's", async () => {
    const file = await exportAs(source, ALICE);
    expect(file.counts).toEqual({ books: 2, words: 2, wordSaves: 3, quotes: 2, reviews: 2, waitingToSync: 0 });
    expect(file.reviewSchedule).toHaveLength(1);
    expect(file.settings).toMatchObject({ current_book_id: expect.any(String) });
    const text = JSON.stringify(file);
    for (const other of ["Bob's book", "private", "Bob's quote", BOB, ALICE]) expect(text).not.toContain(other);
  });

  it("keeps a quote's words exactly, and each word's details", async () => {
    const file = await exportAs(source, ALICE);
    expect(file.quotes.map((quote) => quote.body)).toContain(`  "It is," she said,\n\n— a truth.  `);
    const typo = file.words.find((word) => word.word === "ephemral");
    expect(typo).toMatchObject({ spelling_suggestions: ["ephemeral", "ephemera"], kept_as_typed: true, definition_status: "not_found" });
    expect(file.words.find((word) => word.word === "mitigated")).toMatchObject({ sentence: "They mitigated the harm.", base_form: "mitigate" });
  });

  it("includes entries still waiting to sync on the phone", async () => {
    const waiting: OutboxItem[] = [{ kind: "word", id: "w1", word: "offline", bookId: null, bookTitle: null, sentence: null, createdAt: "2026-11-05T20:00:00Z" }];
    const file = await exportAs(source, ALICE, waiting);
    expect(file.waitingToSync).toEqual(waiting);
    expect(describeCounts(file)).toBe("2 words, 2 quotes, 2 books, 2 reviews, plus 1 entry waiting to sync");
  });

  it("names the file with the reader's own date", () => {
    expect(exportFileName(new Date(2026, 10, 5, 23, 45))).toBe("wordarchive-2026-11-05.json");
  });
});

describe("restoring the file into an empty account", () => {
  it("brings back every entry, unchanged, and the account can carry on using it", async () => {
    const file = await exportAs(source, ALICE);
    const target = await freshDatabase();
    const empty = await exportAs(target, CAROL);
    expect(empty.counts).toEqual({ books: 0, words: 0, wordSaves: 0, quotes: 0, reviews: 0, waitingToSync: 0 });

    await restore(target, CAROL, file);
    const restored = await exportAs(target, CAROL);
    expect(restored).toEqual(file);

    // Reviews and the daily quote continue from where they were.
    await as(target, CAROL);
    const quote = await target.query<{ body: string }>("select body from public.quote_of_the_day('2026-11-05')");
    expect(quote.rows[0].body).toBe(file.quotes.find((row) => row.last_shown_on)?.body);
    await target.query("select public.record_review('mitigate', 4, $1::jsonb)", [JSON.stringify({ due: "2026-11-20T12:00:00Z", last_review: "2026-11-08T12:00:00Z" })]);
    expect((await target.query("select * from public.word_review_log")).rows).toHaveLength(3);
  });

  it("keeps the restored entries private to the new account", async () => {
    const file = await exportAs(source, ALICE);
    const target = await freshDatabase();
    await restore(target, CAROL, file);
    const other = await exportAs(target, BOB);
    expect(other.counts).toEqual({ books: 0, words: 0, wordSaves: 0, quotes: 0, reviews: 0, waitingToSync: 0 });
  });
});
