// Runs the app against a small fake Supabase on this computer, for browser checks without an account.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createServer as createVite } from "vite";

const words = [];
const books = [];
const quotes = [];
const reviews = [];
let currentBookId = null;
let lookups = 0;
let aiCalls = 0;
let signal = true;
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function session() {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: "00000000-0000-0000-0000-00000000000a", aud: "authenticated", role: "authenticated", email: "reader@example.test" };
  const access_token = `${base64url({ alg: "none" })}.${base64url({ sub: user.id, exp: expires_at, role: "authenticated" })}.test`;
  return { access_token, refresh_token: "test", token_type: "bearer", expires_in: 3600, expires_at, user };
}

const fake = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  let body = "";
  req.on("data", (part) => (body += part));
  req.on("end", () => {
    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const path = new URL(req.url, "http://localhost").pathname;
    // Lets a browser check act out losing signal, and the loss lasts through reloads.
    if (path === "/__signal") {
      signal = new URL(req.url, "http://localhost").searchParams.get("on") !== "false";
      return json(200, { signal });
    }
    if (!signal) return json(503, { message: "No signal" });
    if (path === "/rest/v1/keep_awake") return json(200, [{ last_run: new Date().toISOString() }]);
    if (path === "/auth/v1/token") return json(200, session());
    if (path === "/auth/v1/logout") return res.writeHead(204).end();
    if (path === "/api/pronounce") {
      return json(200, { audio: null, text: "/ˈsæŋkʃən/" });
    }
    if (path === "/api/explain") {
      const { word, sentence } = JSON.parse(body);
      if (word === "failsai" && aiCalls++ === 0) return json(503, { error: "unavailable" });
      if (sentence?.includes("failai")) return json(503, { error: "unavailable" });
      return json(200, {
        chosenMeaning: sentence ? { partOfSpeech: "noun", definition: "A penalty or punishment." } : null,
        examples: [`The first example uses ${word} well.`, `A second sentence with ${word} in it.`, `Here is ${word} a third time.`],
      });
    }
    if (path === "/api/define") {
      const word = new URL(req.url, "http://localhost").searchParams.get("word");
      if (word === "zzzznotaword") return json(200, { status: "not_found", suggestions: [] });
      if (word === "ephemral") return json(200, { status: "not_found", suggestions: ["ephemeral", "ephemera"] });
      if (word === "failsonce" && lookups++ === 0) return json(503, { error: "unavailable" });
      if (word === "bored") {
        return json(200, {
          status: "found",
          baseForm: "bore",
          definitions: {
            source: "Free Dictionary API, from Wiktionary",
            sourceUrl: "https://en.wiktionary.org/wiki/bore",
            meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To inspire boredom in somebody." }] }],
            typedMeanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "Suffering from boredom." }] }],
          },
        });
      }
      return json(200, {
        status: "found",
        definitions: {
          source: "Free Dictionary API, from Wiktionary",
          sourceUrl: `https://en.wiktionary.org/wiki/${word}`,
          meanings: [
            { partOfSpeech: "noun", definitions: [{ definition: "An approval, by an authority.", example: "It had official sanction." }, { definition: "A penalty or punishment." }] },
            { partOfSpeech: "verb", definitions: [{ definition: "To give official approval to." }] },
          ],
        },
      });
    }
    if (path === "/rest/v1/words" && req.method === "PATCH") {
      const id = new URL(req.url, "http://localhost").searchParams.get("id")?.replace("eq.", "");
      Object.assign(words.find((item) => item.id === id) ?? {}, JSON.parse(body));
      return res.writeHead(204).end();
    }
    if (path === "/rest/v1/words" && req.method === "GET") return json(200, words);
    if (path === "/rest/v1/words" && req.method === "POST") {
      const { id, word: text, book_id, sentence } = JSON.parse(body);
      // Like the real database, sending the same ID twice is refused rather than duplicated.
      if (words.some((item) => item.id === id)) return json(409, { code: "23505", message: "duplicate key" });
      const book = books.find((item) => item.id === book_id);
      const word = { id: id ?? randomUUID(), word: text, sentence, definitions: null, definition_status: null, created_at: new Date().toISOString(), book: book ? { title: book.title } : null };
      words.unshift(word);
      return json(201, word);
    }
    if (path === "/rest/v1/word_reviews" && req.method === "GET") {
      const key = new URL(req.url, "http://localhost").searchParams.get("word_key")?.replace("eq.", "");
      return json(200, key ? reviews.filter((item) => item.word_key === key) : reviews);
    }
    if (path === "/rest/v1/rpc/record_review" && req.method === "POST") {
      const { p_word_key, p_card } = JSON.parse(body);
      const row = { word_key: p_word_key, card: p_card, due: p_card.due, last_review: p_card.last_review };
      const index = reviews.findIndex((item) => item.word_key === p_word_key);
      if (index >= 0) reviews[index] = row;
      else reviews.push(row);
      return res.writeHead(204).end();
    }
    if (path === "/rest/v1/quotes" && req.method === "GET") return json(200, quotes);
    if (path === "/rest/v1/quotes" && req.method === "POST") {
      const { id, body: text, book_id } = JSON.parse(body);
      if (quotes.some((item) => item.id === id)) return json(409, { code: "23505", message: "duplicate key" });
      const book = books.find((item) => item.id === book_id);
      const quote = { id: id ?? randomUUID(), body: text, created_at: new Date().toISOString(), book: book ? { title: book.title, author: book.author } : null };
      quotes.unshift(quote);
      return json(201, quote);
    }
    if (path === "/rest/v1/books" && req.method === "GET") return json(200, books);
    if (path === "/rest/v1/books" && req.method === "POST") {
      const { title, author } = JSON.parse(body);
      const book = { id: randomUUID(), title, author };
      books.unshift(book);
      return json(201, book);
    }
    if (path === "/rest/v1/reader_settings" && req.method === "GET") {
      const book = books.find((item) => item.id === currentBookId);
      return json(200, book ? [{ book }] : []);
    }
    if (path === "/rest/v1/reader_settings" && req.method === "POST") {
      currentBookId = JSON.parse(body).current_book_id;
      return json(201, null);
    }
    json(404, { message: "Not found" });
  });
});

// Any free port, so this can run alongside another copy of the app.
await new Promise((resolve) => fake.listen(0, resolve));
const fakeUrl = `http://localhost:${fake.address().port}`;
process.env.VITE_SUPABASE_URL = fakeUrl;

const vite = await createVite({ mode: "e2e", server: { port: Number(process.env.PORT) || 5174, strictPort: true, proxy: { "/api": fakeUrl } } });
await vite.listen();
vite.printUrls();
