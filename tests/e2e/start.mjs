// Runs the app against a small fake Supabase on this computer, for browser checks without an account.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createServer as createVite } from "vite";

const words = [];
const books = [];
let currentBookId = null;
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function session() {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: "00000000-0000-0000-0000-00000000000a", aud: "authenticated", role: "authenticated", email: "reader@example.test" };
  const access_token = `${base64url({ alg: "none" })}.${base64url({ sub: user.id, exp: expires_at, role: "authenticated" })}.test`;
  return { access_token, refresh_token: "test", token_type: "bearer", expires_in: 3600, expires_at, user };
}

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  let body = "";
  req.on("data", (part) => (body += part));
  req.on("end", () => {
    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/auth/v1/token") return json(200, session());
    if (path === "/auth/v1/logout") return res.writeHead(204).end();
    if (path === "/rest/v1/words" && req.method === "GET") return json(200, words);
    if (path === "/rest/v1/words" && req.method === "POST") {
      const { word: text, book_id } = JSON.parse(body);
      const book = books.find((item) => item.id === book_id);
      const word = { id: randomUUID(), word: text, created_at: new Date().toISOString(), book: book ? { title: book.title } : null };
      words.unshift(word);
      return json(201, word);
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
}).listen(54399);

const vite = await createVite({ mode: "e2e", server: { port: Number(process.env.PORT) || 5173, strictPort: true } });
await vite.listen();
vite.printUrls();
