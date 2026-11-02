// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookUp, plainText } from "../worker/define";
import { handleRequest, type Env } from "../worker/index";

const FREE = "api.dictionaryapi.dev";
const WIKI = "en.wiktionary.org";
const noWait = () => Promise.resolve();

const freeBody = [
  {
    word: "sanction",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [{ definition: "An approval by an authority.", example: "With sanction from the state." }, { definition: "A penalty." }],
      },
    ],
  },
];
const wikiBody = {
  en: [
    {
      partOfSpeech: "Noun",
      definitions: [
        {
          definition: '<span class="x" about="#a"></span>An <a href="/wiki/approval">approval</a> &amp; a <b>consent</b>.',
          examples: ["With <b>sanction</b> from the state."],
        },
        { definition: "" },
      ],
    },
  ],
};

const reply = (status: number, body?: unknown) => new Response(body === undefined ? "error" : JSON.stringify(body), { status });

// Answers from a queue per service, so each test states exactly what each service does.
function services(free: (() => Response)[], wiki: (() => Response)[]) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    const queue = url.includes(FREE) ? free : wiki;
    const next = queue.shift();
    if (!next) throw new Error("Unexpected call");
    expect(url.includes(WIKI) ? new Headers(init?.headers).get("User-Agent") : "WordArchiveBot").toContain("WordArchiveBot");
    return next();
  });
  return { fetcher, calls };
}

describe("looking up a word", () => {
  it("uses the Free Dictionary API first", async () => {
    const { fetcher, calls } = services([() => reply(200, freeBody)], []);
    const answer = await lookUp("sanction", fetcher, noWait);
    expect(answer).toEqual({
      status: "found",
      definitions: {
        source: "Free Dictionary API, from Wiktionary",
        sourceUrl: "https://en.wiktionary.org/wiki/sanction",
        meanings: [
          {
            partOfSpeech: "noun",
            definitions: [{ definition: "An approval by an authority.", example: "With sanction from the state." }, { definition: "A penalty." }],
          },
        ],
      },
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a temporary error before using the backup", async () => {
    const { fetcher, calls } = services([() => reply(502), () => reply(200, freeBody)], []);
    const answer = await lookUp("sanction", fetcher, noWait);
    expect(answer).toMatchObject({ status: "found", definitions: { source: "Free Dictionary API, from Wiktionary" } });
    expect(calls).toHaveLength(2);
  });

  it("falls back to Wiktionary when the main dictionary keeps failing", async () => {
    const { fetcher } = services([() => reply(502), () => reply(500)], [() => reply(200, wikiBody)]);
    expect(await lookUp("sanction", fetcher, noWait)).toEqual({
      status: "found",
      definitions: {
        source: "Wiktionary",
        sourceUrl: "https://en.wiktionary.org/wiki/sanction",
        meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "An approval & a consent.", example: "With sanction from the state." }] }],
      },
    });
  });

  it("falls back to Wiktionary when the main dictionary can't be reached", async () => {
    const offline = () => {
      throw new Error("network");
    };
    const { fetcher } = services([offline, offline], [() => reply(200, wikiBody)]);
    expect(await lookUp("sanction", fetcher, noWait)).toMatchObject({ status: "found", definitions: { source: "Wiktionary" } });
  });

  it("checks Wiktionary when the main dictionary doesn't know the word", async () => {
    const { fetcher } = services([() => reply(404, {})], [() => reply(200, wikiBody)]);
    expect(await lookUp("sanction", fetcher, noWait)).toMatchObject({ status: "found", definitions: { source: "Wiktionary" } });
  });

  it("reports not found only when both services say so", async () => {
    const { fetcher } = services([() => reply(404, {})], [() => reply(404, {})]);
    expect(await lookUp("zzzznotaword", fetcher, noWait)).toEqual({ status: "not_found" });
  });

  it("never reports a word as missing when a service couldn't answer", async () => {
    const first = services([() => reply(404, {})], [() => reply(429)]);
    expect(await lookUp("sanction", first.fetcher, noWait)).toBe("unavailable");
    const second = services([() => reply(502), () => reply(502)], [() => reply(404, {})]);
    expect(await lookUp("sanction", second.fetcher, noWait)).toBe("unavailable");
  });

  it("treats an entry with no usable definitions as not found", async () => {
    const { fetcher } = services([() => reply(200, [{ meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "" }] }] }])], [() => reply(404, {})]);
    expect(await lookUp("sanction", fetcher, noWait)).toEqual({ status: "not_found" });
  });

  it("encodes words with apostrophes and hyphens", async () => {
    const { fetcher, calls } = services([() => reply(200, freeBody)], []);
    await lookUp("o'clock", fetcher, noWait);
    expect(calls[0]).toContain("/o'clock");
  });

  it("limits very long entries", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ definition: `Sense ${i}` }));
    const meanings = Array.from({ length: 12 }, () => ({ partOfSpeech: "verb", definitions: many }));
    const { fetcher } = services([() => reply(200, [{ meanings }])], []);
    const answer = await lookUp("run", fetcher, noWait);
    if (answer === "unavailable" || answer.status !== "found") throw new Error("Expected a definition");
    expect(answer.definitions.meanings).toHaveLength(6);
    expect(answer.definitions.meanings[0].definitions).toHaveLength(8);
  });
});

describe("plainText", () => {
  it("removes markup and decodes entities", () => {
    expect(plainText("<b>A</b> &lt;b&gt; &#39;c&#39; &#x2014;  <i>d</i>&nbsp;&unknown;")).toBe("A <b> 'c' — d &unknown;");
  });
});

describe("the lookup endpoint", () => {
  const env: Env = { SUPABASE_URL: "https://project.test/", SUPABASE_PUBLISHABLE_KEY: "key" };
  const request = (path: string, token?: string, method = "GET") =>
    new Request(`https://app.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetcher = vi.fn(async (url: string) => {
      if (url.includes("/auth/v1/user")) return reply(200, { id: "user" });
      return reply(200, freeBody);
    });
  });

  it("refuses a request with no sign-in, without calling any dictionary", async () => {
    const response = await handleRequest(request("/api/define?word=sanction"), env, fetcher as unknown as typeof fetch);
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a sign-in that Supabase rejects, without calling any dictionary", async () => {
    fetcher.mockResolvedValueOnce(reply(401, {}));
    const response = await handleRequest(request("/api/define?word=sanction", "bad"), env, fetcher as unknown as typeof fetch);
    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends the reader's token and app key to Supabase", async () => {
    await handleRequest(request("/api/define?word=sanction", "good"), env, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://project.test/auth/v1/user");
    expect(init.headers).toEqual({ apikey: "key", Authorization: "Bearer good" });
  });

  it("returns definitions to a signed-in reader", async () => {
    const response = await handleRequest(request("/api/define?word=Sanction", "good"), env, fetcher as unknown as typeof fetch);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "found" });
    expect(fetcher.mock.calls[1][0]).toContain("/sanction");
  });

  it("rejects anything that isn't one word", async () => {
    const response = await handleRequest(request("/api/define?word=two%20words", "good"), env, fetcher as unknown as typeof fetch);
    expect(response.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("says when no dictionary could answer", async () => {
    fetcher.mockImplementation(async (url: string) => (url.includes("/auth/v1/user") ? reply(200, {}) : reply(502)));
    const response = await handleRequest(request("/api/define?word=sanction", "good"), env, fetcher as unknown as typeof fetch);
    expect(response.status).toBe(503);
  }, 10000);

  it("only serves the lookup path and method", async () => {
    expect((await handleRequest(request("/api/other", "good"), env, fetcher as unknown as typeof fetch)).status).toBe(404);
    expect((await handleRequest(request("/api/define?word=a", "good", "POST"), env, fetcher as unknown as typeof fetch)).status).toBe(405);
  });
});
