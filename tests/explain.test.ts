// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Definitions } from "../src/lib/definitions";
import { buildPrompt, explain, readAnswer } from "../worker/explain";
import { handleRequest, type Env } from "../worker/index";

const definitions: Definitions = {
  source: "Test",
  sourceUrl: "https://example.test",
  meanings: [
    { partOfSpeech: "noun", definitions: [{ definition: "An approval." }, { definition: "A penalty." }] },
    { partOfSpeech: "verb", definitions: [{ definition: "To approve." }] },
  ],
};
const listed = [
  { partOfSpeech: "noun", definition: "An approval." },
  { partOfSpeech: "noun", definition: "A penalty." },
];
const examples = ["One sanction.", "Two sanctions.", "Three sanctions."];
const answer = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200 });

describe("reading the AI's answer", () => {
  it("returns the chosen definition and the examples", () => {
    expect(readAnswer(JSON.stringify({ chosen: 2, examples }), listed)).toEqual({ chosenMeaning: listed[1], examples });
  });

  it("treats 0 as no chosen meaning, but keeps the examples", () => {
    expect(readAnswer(JSON.stringify({ chosen: 0, examples }), listed)).toEqual({ chosenMeaning: null, examples });
  });

  it("treats a number outside the list as no chosen meaning", () => {
    expect(readAnswer(JSON.stringify({ chosen: 9, examples }), listed)?.chosenMeaning).toBeNull();
    expect(readAnswer(JSON.stringify({ chosen: -1, examples }), listed)?.chosenMeaning).toBeNull();
  });

  it.each([
    ["not JSON", "Sure! Here you go"],
    ["no examples", JSON.stringify({ chosen: 1 })],
    ["too few examples", JSON.stringify({ chosen: 1, examples: ["One.", "Two."] })],
    ["too many examples", JSON.stringify({ chosen: 1, examples: ["1", "2", "3", "4"] })],
    ["a blank example", JSON.stringify({ chosen: 1, examples: ["One.", "  ", "Three."] })],
    ["a non-text example", JSON.stringify({ chosen: 1, examples: ["One.", 2, "Three."] })],
    ["a very long example", JSON.stringify({ chosen: 1, examples: ["One.", "x".repeat(401), "Three."] })],
    ["a non-number choice", JSON.stringify({ chosen: "1", examples })],
  ])("rejects %s", (_name, content) => {
    expect(readAnswer(content, listed)).toBeNull();
  });
});

describe("the AI prompt", () => {
  it("numbers the definitions and includes the sentence", () => {
    const prompt = buildPrompt("sanction", "The council gave its sanction.", listed);
    expect(prompt).toContain("Word: sanction");
    expect(prompt).toContain("The council gave its sanction.");
    expect(prompt).toContain("1. (noun) An approval.");
    expect(prompt).toContain("2. (noun) A penalty.");
  });

  it("says when there's no sentence, and limits long ones", () => {
    expect(buildPrompt("sanction", null, listed)).toContain("Sentence from the book: (none)");
    expect(buildPrompt("sanction", "x".repeat(5000), listed).length).toBeLessThan(1200);
  });
});

describe("asking the AI", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends the key, model and required shape to Groq", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => answer({ chosen: 1, examples }));
    const result = await explain("sanction", "Its sanction.", definitions, "test-key", fetcher);

    expect(result).toEqual({ chosenMeaning: { partOfSpeech: "noun", definition: "An approval." }, examples });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content).toContain("Its sanction.");
  });

  it("can choose from the typed word's own meanings", async () => {
    const withTyped = { ...definitions, typedMeanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "Weary." }] }] };
    const fetcher = vi.fn(async () => answer({ chosen: 4, examples }));
    const result = await explain("bore", "He was bored.", withTyped, "test-key", fetcher);
    expect(result?.chosenMeaning).toEqual({ partOfSpeech: "adjective", definition: "Weary." });
  });

  it("doesn't call Groq without a key or definitions", async () => {
    const fetcher = vi.fn();
    expect(await explain("sanction", null, definitions, undefined, fetcher)).toBeNull();
    expect(await explain("sanction", null, { ...definitions, meanings: [] }, "test-key", fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns nothing when Groq fails, and logs no sentence", async () => {
    const log = vi.spyOn(console, "error");
    const failing = vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), { status: 429 }));
    expect(await explain("sanction", "A private sentence.", definitions, "test-key", failing)).toBeNull();
    expect(log.mock.calls.flat().join(" ")).toContain("429 rate_limit_exceeded");
    expect(log.mock.calls.flat().join(" ")).not.toContain("private sentence");
  });

  it("returns nothing when Groq can't be reached or answers badly", async () => {
    const offline = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await explain("sanction", null, definitions, "test-key", offline)).toBeNull();
    const badAnswer = vi.fn(async () => answer("not json"));
    expect(await explain("sanction", null, definitions, "test-key", badAnswer)).toBeNull();
  });
});

describe("the explain endpoint", () => {
  const env: Env = { SUPABASE_URL: "https://project.test", SUPABASE_PUBLISHABLE_KEY: "key", GROQ_API_KEY: "test-key" };
  const post = (body: unknown, token: string | null = "good") =>
    new Request("https://app.test/api/explain", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetcher = vi.fn(async (url: string) => (url.includes("/auth/v1/user") ? new Response("{}", { status: 200 }) : answer({ chosen: 1, examples })));
  });

  const send = (request: Request, environment = env) => handleRequest(request, environment, fetcher as unknown as typeof fetch);

  it("refuses a request with no sign-in, without calling Groq", async () => {
    const response = await send(post({ word: "sanction", definitions }, null));
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns AI content to a signed-in reader, without the key", async () => {
    const response = await send(post({ word: "sanction", sentence: "Its sanction.", definitions }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ examples });
    expect(text).not.toContain("test-key");
  });

  it.each([
    ["broken JSON", "{not json"],
    ["two words", { word: "two words", definitions }],
    ["no definitions", { word: "sanction" }],
    ["malformed definitions", { word: "sanction", definitions: { meanings: [{ partOfSpeech: 1, definitions: "x" }] } }],
  ])("rejects %s", async (_name, body) => {
    expect((await send(post(body))).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("says when AI isn't available, including with no key set", async () => {
    const { GROQ_API_KEY: _unused, ...noKey } = env;
    expect((await send(post({ word: "sanction", definitions }), noKey)).status).toBe(503);
  });

  it("only allows POST", async () => {
    const response = await send(new Request("https://app.test/api/explain", { headers: { Authorization: "Bearer good" } }));
    expect(response.status).toBe(405);
  });
});
