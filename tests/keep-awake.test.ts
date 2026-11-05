// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { keepAwake } from "../worker/keep-awake";
import worker from "../worker/index";

const env = { SUPABASE_URL: "https://project.test/", SUPABASE_PUBLISHABLE_KEY: "public-key" };

describe("keeping the database awake", () => {
  it("calls the one function it's allowed to, with the public key", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    expect(await keepAwake(env, fetcher)).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://project.test/rest/v1/rpc/record_keep_awake");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("apikey")).toBe("public-key");
  });

  it("logs a refusal, without any key", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await keepAwake(env, vi.fn(async () => new Response("{}", { status: 503 })))).toBe(false);
    expect(log.mock.calls.flat().join(" ")).toContain("503");
    expect(log.mock.calls.flat().join(" ")).not.toContain("public-key");
    log.mockRestore();
  });

  it("doesn't throw when the database can't be reached", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const offline = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await keepAwake(env, offline)).toBe(false);
    log.mockRestore();
  });

  it("is what the scheduled job runs", async () => {
    const realFetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", realFetch);
    await worker.scheduled({}, env);
    expect(realFetch).toHaveBeenCalledTimes(1);
    expect(String(realFetch.mock.calls[0]?.at(0))).toContain("record_keep_awake");
    vi.unstubAllGlobals();
  });

  it("is scheduled several times a day", () => {
    const config = readFileSync("wrangler.jsonc", "utf8");
    expect(config).toContain('"crons": ["17 */6 * * *"]');
  });
});
