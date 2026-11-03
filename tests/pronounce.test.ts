// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { choosePronunciation, lookUpPronunciation } from "../worker/pronounce";
import { handleRequest, type Env } from "../worker/index";

const noWait = () => Promise.resolve();
const link = (accent: string) => `https://api.dictionaryapi.dev/media/pronunciations/en/word-${accent}.mp3`;

describe("choosing a pronunciation", () => {
  it("prefers American, then British, then any other accent", () => {
    expect(choosePronunciation([{ audio: link("au") }, { audio: link("uk") }, { audio: link("us") }]).audio).toBe(link("us"));
    expect(choosePronunciation([{ audio: link("ca") }, { audio: link("uk") }]).audio).toBe(link("uk"));
    expect(choosePronunciation([{ audio: link("au") }]).audio).toBe(link("au"));
  });

  it("uses the written form from the chosen recording", () => {
    const chosen = choosePronunciation([{ text: "/uk/", audio: link("uk") }, { text: "/us/", audio: link("us") }]);
    expect(chosen).toEqual({ audio: link("us"), text: "/us/" });
  });

  it("falls back to any written form", () => {
    expect(choosePronunciation([{ text: "/a/", audio: "" }, { audio: link("us") }])).toEqual({ audio: link("us"), text: "/a/" });
    expect(choosePronunciation([{ text: "[ˈpʰʌɫ]" }])).toEqual({ audio: null, text: "[ˈpʰʌɫ]" });
  });

  it("handles no pronunciation data", () => {
    expect(choosePronunciation([])).toEqual({ audio: null, text: null });
    expect(choosePronunciation([{ audio: "", text: "" }])).toEqual({ audio: null, text: null });
  });

  it("keeps secure links only, and repairs links with no scheme", () => {
    expect(choosePronunciation([{ audio: "http://example.test/word-us.mp3" }]).audio).toBeNull();
    expect(choosePronunciation([{ audio: "javascript:alert(1)" }]).audio).toBeNull();
    expect(choosePronunciation([{ audio: "//example.test/word-us.mp3" }]).audio).toBe("https://example.test/word-us.mp3");
  });
});

describe("looking up a pronunciation", () => {
  const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
  const entries = [{ phonetics: [{ text: "/a/", audio: link("us") }] }, { phonetics: [{ audio: link("uk") }] }];

  it("reads every entry for the word", async () => {
    const fetcher = vi.fn(async () => reply(200, entries));
    expect(await lookUpPronunciation("word", fetcher, noWait)).toEqual({ audio: link("us"), text: "/a/" });
  });

  it("retries a temporary error once", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(502)).mockResolvedValueOnce(reply(200, entries));
    expect(await lookUpPronunciation("word", fetcher, noWait)).toMatchObject({ text: "/a/" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports an unknown word as having no pronunciation", async () => {
    const fetcher = vi.fn(async () => reply(404));
    expect(await lookUpPronunciation("zzzz", fetcher, noWait)).toEqual({ audio: null, text: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("says unavailable when the service keeps failing, or can't be reached", async () => {
    expect(await lookUpPronunciation("word", vi.fn(async () => reply(502)), noWait)).toBe("unavailable");
    const offline = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await lookUpPronunciation("word", offline, noWait)).toBe("unavailable");
  });
});

describe("the pronunciation endpoint", () => {
  const env: Env = { SUPABASE_URL: "https://project.test", SUPABASE_PUBLISHABLE_KEY: "key" };
  const request = (path: string, token?: string, method = "GET") =>
    new Request(`https://app.test${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const fetcher = () =>
    vi.fn(async (url: string) =>
      url.includes("/auth/v1/user") ? new Response("{}", { status: 200 }) : new Response(JSON.stringify([{ phonetics: [{ text: "/a/" }] }]), { status: 200 }),
    );
  const send = (req: Request, mock: ReturnType<typeof fetcher>) => handleRequest(req, env, mock as unknown as typeof fetch);

  it("refuses a request with no sign-in, without calling the dictionary", async () => {
    const mock = fetcher();
    expect((await send(request("/api/pronounce?word=word"), mock)).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it("returns a pronunciation to a signed-in reader", async () => {
    const response = await send(request("/api/pronounce?word=word", "good"), fetcher());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ audio: null, text: "/a/" });
  });

  it("rejects anything that isn't one word, and other methods", async () => {
    expect((await send(request("/api/pronounce?word=two%20words", "good"), fetcher())).status).toBe(400);
    expect((await send(request("/api/pronounce?word=word", "good", "POST"), fetcher())).status).toBe(405);
  });
});
