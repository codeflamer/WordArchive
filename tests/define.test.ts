// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeSpellings, editDistance, findBaseForm, lookUp, plainText, suggestSpellings } from "../worker/define";
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
    expect(calls.filter((url) => url.includes(FREE))).toHaveLength(1);
  });

  it("retries a temporary error before using the backup", async () => {
    const { fetcher, calls } = services([() => reply(502), () => reply(200, freeBody)], []);
    const answer = await lookUp("sanction", fetcher, noWait);
    expect(answer).toMatchObject({ status: "found", definitions: { source: "Free Dictionary API, from Wiktionary" } });
    expect(calls.filter((url) => url.includes(FREE))).toHaveLength(2);
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
    expect(await lookUp("zzzznotaword", fetcher, noWait)).toEqual({ status: "not_found", suggestions: [] });
  });

  it("never reports a word as missing when a service couldn't answer", async () => {
    const first = services([() => reply(404, {})], [() => reply(429)]);
    expect(await lookUp("sanction", first.fetcher, noWait)).toBe("unavailable");
    const second = services([() => reply(502), () => reply(502)], [() => reply(404, {})]);
    expect(await lookUp("sanction", second.fetcher, noWait)).toBe("unavailable");
  });

  it("treats an entry with no usable definitions as not found", async () => {
    const { fetcher } = services([() => reply(200, [{ meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "" }] }] }])], [() => reply(404, {})]);
    expect(await lookUp("sanction", fetcher, noWait)).toEqual({ status: "not_found", suggestions: [] });
  });

  it("encodes words with apostrophes and hyphens", async () => {
    const { fetcher, calls } = services([() => reply(200, freeBody)], []);
    await lookUp("o'clock", fetcher, noWait);
    expect(calls.every((url) => url.includes("/o'clock"))).toBe(true);
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

// The same markup Wiktionary returned for these words on 2026-11-02, shortened.
const glossary = (name: string) => `<a rel="mw:WikiLink" href="/wiki/Appendix:Glossary#${name}" title="Appendix:Glossary">${name}</a>`;
const formOf = (grammar: string, base: string) =>
  `<span class="form-of-definition use-with-mention" about="#mwt1" typeof="mw:Transclusion">${grammar} of <span class="form-of-definition-link"><i class="Latn mention" lang="en"><a rel="mw:WikiLink" href="/wiki/${base}#English" title="${base}">${base}</a></i></span></span>`;
const variantOf = (base: string) =>
  `<span class="form-of-definition use-with-mention">Alternative spelling of <span class="form-of-definition-link"><i class="Latn mention" lang="en"><a rel="mw:WikiLink" href="/wiki/${base}#English" title="${base}">${base}</a></i></span></span>.`;
const own = (text: string) => ({ definition: text });
const entry = (partOfSpeech: string, ...definitions: { definition: string }[]) => ({ partOfSpeech, definitions });

describe("finding a base form", () => {
  it.each([
    ["children", [entry("Noun", { definition: formOf(glossary("plural"), "child") })], "child"],
    ["went", [entry("Verb", { definition: formOf(`simple ${glossary("past")}`, "go") }), entry("Noun", own("A course."))], "go"],
    ["running", [entry("Verb", { definition: formOf(`present ${glossary("participle")}`, "run") }), entry("Adjective", own("Moving."), own("Present."))], "run"],
    ["mitigated", [entry("Adjective", own("Lessened.")), entry("Verb", { definition: formOf(`simple ${glossary("past")}`, "mitigate") })], "mitigate"],
    ["better", [entry("Adjective", { definition: formOf(glossary("comparative"), "good") }, own("Greater."))], "good"],
  ])("treats %s as a changed form", (word, en, base) => {
    expect(findBaseForm({ en }, word)).toBe(base);
  });

  it.each([
    ["ephemeral", [entry("Adjective", own("Lasting a short time."), own("Existing one day."))]],
    ["news", [entry("Noun", own("New information."), own("Media reports.")), entry("Noun", { definition: formOf(glossary("plural"), "new") })]],
    ["interesting", [entry("Adjective", own("Holding attention."), own("Of concern.")), entry("Verb", { definition: formOf(`present ${glossary("participle")}`, "interest") })]],
    ["bettor", [entry("Noun", { definition: variantOf("better") })]],
  ])("keeps %s as it is", (word, en) => {
    expect(findBaseForm({ en }, word)).toBeNull();
  });

  it("ignores a link that isn't one word, or is the same word", () => {
    expect(findBaseForm({ en: [entry("Noun", { definition: formOf(glossary("plural"), "ice_cream") })] }, "icecreams")).toBeNull();
    expect(findBaseForm({ en: [entry("Noun", { definition: formOf(glossary("plural"), "sheep") })] }, "sheep")).toBeNull();
  });
});

describe("looking up a changed form", () => {
  const boredPage = {
    en: [
      entry("Verb", { definition: formOf(`simple ${glossary("past")}`, "bore") }),
      entry("Adjective", own("Suffering from <a href=\"/wiki/boredom\">boredom</a>.")),
    ],
  };
  const boreBody = [{ meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To inspire boredom." }] }] }];

  it("defines the base form, and keeps the typed word's own meanings", async () => {
    const { fetcher, calls } = services([() => reply(200, boreBody)], [() => reply(200, boredPage)]);
    const answer = await lookUp("bored", fetcher, noWait);
    expect(answer).toEqual({
      status: "found",
      baseForm: "bore",
      definitions: {
        source: "Free Dictionary API, from Wiktionary",
        sourceUrl: "https://en.wiktionary.org/wiki/bore",
        meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To inspire boredom." }] }],
        typedMeanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "Suffering from boredom." }] }],
      },
    });
    expect(calls.some((url) => url.endsWith("/bore"))).toBe(true);
  });

  it("leaves out typed meanings when the word has none", async () => {
    const page = { en: [entry("Noun", { definition: formOf(glossary("plural"), "child") })] };
    const { fetcher } = services([() => reply(200, boreBody)], [() => reply(200, page)]);
    const answer = await lookUp("children", fetcher, noWait);
    expect(answer).toMatchObject({ status: "found", baseForm: "child" });
    if (answer === "unavailable" || answer.status !== "found") throw new Error("Expected a definition");
    expect(answer.definitions.typedMeanings).toBeUndefined();
  });

  it("uses the backup for the base form when the main dictionary fails", async () => {
    const page = { en: [entry("Noun", own("A young person."))] };
    const { fetcher } = services([() => reply(502), () => reply(502)], [() => reply(200, boredPage), () => reply(200, page)]);
    expect(await lookUp("bored", fetcher, noWait)).toMatchObject({ status: "found", baseForm: "bore", definitions: { source: "Wiktionary" } });
  });

  it("falls back to the typed word when the base form can't be defined", async () => {
    const { fetcher } = services([() => reply(404, {}), () => reply(200, freeBody)], [() => reply(200, boredPage), () => reply(404, {})]);
    const answer = await lookUp("bored", fetcher, noWait);
    expect(answer).toMatchObject({ status: "found" });
    expect(answer).not.toHaveProperty("baseForm");
  });

  it("still defines the typed word when Wiktionary can't be reached", async () => {
    const { fetcher } = services([() => reply(200, freeBody)], [() => reply(429)]);
    const answer = await lookUp("mitigated", fetcher, noWait);
    expect(answer).toMatchObject({ status: "found" });
    expect(answer).not.toHaveProperty("baseForm");
  });

  it("asks Wiktionary only once about the typed word", async () => {
    const { fetcher, calls } = services([() => reply(404, {})], [() => reply(404, {})]);
    await lookUp("zzzznotaword", fetcher, noWait);
    expect(calls.filter((url) => url.includes("/page/definition/"))).toHaveLength(1);
  });

  it("corrects a word Wiktionary lists as a misspelling", async () => {
    const page = { en: [entry("Verb", { definition: formOf("Misspelling", "receive") })] };
    const body = [{ meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To get." }] }] }];
    const { fetcher } = services([() => reply(200, body)], [() => reply(200, page)]);
    expect(await lookUp("recieve", fetcher, noWait)).toMatchObject({ status: "found", baseForm: "receive" });
  });
});

describe("suggesting spellings", () => {
  const english = (...titles: string[]) => ({
    query: { pages: titles.map((title) => ({ title, categories: [{ title: "Category:English lemmas" }] })) },
  });

  it("measures how far apart two spellings are", () => {
    expect(editDistance("ephemral", "ephemeral")).toBe(1);
    expect(editDistance("same", "same")).toBe(0);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("pulchritood", "pulchritude")).toBe(3);
  });

  it("keeps only close, single, lower-case words that differ from the typed word", () => {
    // Real Wiktionary results from 2026-11-02.
    expect(closeSpellings("ephemral", ["ephemeral", "ephemera", "ephedra", "ephemerality", "Ephemera"])).toEqual(["ephemeral", "ephemera", "ephedra"]);
    expect(closeSpellings("blargle", ["blackleg"])).toEqual([]);
    expect(closeSpellings("pulchritood", ["pulchritudinous", "pulchritude"])).toEqual(["pulchritude"]);
    expect(closeSpellings("word", ["word", "ice cream", "wards"])).toEqual(["wards"]);
  });

  it("only suggests words with an English entry, in the order found", async () => {
    const pages = { query: { pages: [{ title: "ephemera", categories: [{}] }, { title: "ephemeral", categories: [{}] }, { title: "ephemeron" }] } };
    const { fetcher, calls } = services([], [() => reply(200, ["ephemral", ["ephemeral", "ephemeron", "ephemera"]]), () => reply(200, pages)]);
    expect(await suggestSpellings("ephemral", fetcher)).toEqual(["ephemeral", "ephemera"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("profile=fuzzy");
  });

  it("limits how many it suggests", async () => {
    const close = ["worda", "wordb", "wordc", "wordd", "worde", "wordf"];
    const { fetcher } = services([], [() => reply(200, ["word", close]), () => reply(200, english(...close))]);
    expect(await suggestSpellings("word", fetcher)).toHaveLength(4);
  });

  it("skips the English check when nothing is close", async () => {
    const { fetcher, calls } = services([], [() => reply(200, ["blargle", ["blackleg"]])]);
    expect(await suggestSpellings("blargle", fetcher)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("gives no suggestions, rather than an error, when the search fails", async () => {
    const down = services([], [() => reply(503)]);
    expect(await suggestSpellings("ephemral", down.fetcher)).toEqual([]);
    const offline = services([], []);
    expect(await suggestSpellings("ephemral", offline.fetcher)).toEqual([]);
    const checkDown = services([], [() => reply(200, ["ephemral", ["ephemeral"]]), () => reply(503)]);
    expect(await suggestSpellings("ephemral", checkDown.fetcher)).toEqual([]);
  });

  it("adds suggestions to a word that wasn't found", async () => {
    const { fetcher } = services(
      [() => reply(404, {})],
      [() => reply(404, {}), () => reply(200, ["ephemral", ["ephemeral"]]), () => reply(200, english("ephemeral"))],
    );
    expect(await lookUp("ephemral", fetcher, noWait)).toEqual({ status: "not_found", suggestions: ["ephemeral"] });
  });

  it("doesn't look for suggestions when a word was found, or no service could answer", async () => {
    const foundWord = services([() => reply(200, freeBody)], [() => reply(404, {})]);
    await lookUp("sanction", foundWord.fetcher, noWait);
    expect(foundWord.calls.some((url) => url.includes("opensearch"))).toBe(false);

    const down = services([() => reply(502), () => reply(502)], [() => reply(429)]);
    expect(await lookUp("sanction", down.fetcher, noWait)).toBe("unavailable");
    expect(down.calls.some((url) => url.includes("opensearch"))).toBe(false);
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
