import type { Definitions } from "../src/lib/definitions";
import { checkWord } from "../src/lib/word";
import { lookUp } from "./define";
import { explain } from "./explain";
import { lookUpPronunciation } from "./pronounce";

export type Env = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; GROQ_API_KEY?: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Only signed-in readers can use these, so they can't be used as an open proxy.
async function isSignedIn(request: Request, env: Env, fetcher: typeof fetch): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization },
  });
  return response.ok;
}

async function define(url: URL, fetcher: typeof fetch): Promise<Response> {
  const check = checkWord(url.searchParams.get("word") ?? "");
  if (!check.ok) return json(400, { error: "invalid_word" });
  const answer = await lookUp(check.word, (target, init) => fetcher(target, init));
  return answer === "unavailable" ? json(503, { error: "unavailable" }) : json(200, answer);
}

async function pronounce(url: URL, fetcher: typeof fetch): Promise<Response> {
  const check = checkWord(url.searchParams.get("word") ?? "");
  if (!check.ok) return json(400, { error: "invalid_word" });
  const answer = await lookUpPronunciation(check.word, (target, init) => fetcher(target, init));
  return answer === "unavailable" ? json(503, { error: "unavailable" }) : json(200, answer);
}

function isDefinitions(value: unknown): value is Definitions {
  const meanings = (value as Definitions | null)?.meanings;
  return (
    Array.isArray(meanings) &&
    meanings.every((meaning) => typeof meaning?.partOfSpeech === "string" && Array.isArray(meaning.definitions) && meaning.definitions.every((item) => typeof item?.definition === "string"))
  );
}

async function explainWord(request: Request, env: Env, fetcher: typeof fetch): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { word?: unknown; sentence?: unknown; definitions?: unknown } | null;
  const check = checkWord(typeof body?.word === "string" ? body.word : "");
  const sentence = typeof body?.sentence === "string" ? body.sentence : null;
  if (!check.ok || !isDefinitions(body?.definitions)) return json(400, { error: "invalid_request" });
  const ai = await explain(check.word, sentence, body.definitions, env.GROQ_API_KEY, (target, init) => fetcher(target, init));
  return ai ? json(200, ai) : json(503, { error: "unavailable" });
}

export async function handleRequest(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  if (!["/api/define", "/api/explain", "/api/pronounce"].includes(url.pathname)) return json(404, { error: "not_found" });
  if (!["GET /api/define", "POST /api/explain", "GET /api/pronounce"].includes(route)) return json(405, { error: "method_not_allowed" });

  try {
    if (!(await isSignedIn(request, env, fetcher))) return json(401, { error: "sign_in_required" });
  } catch {
    return json(503, { error: "unavailable" });
  }

  if (route === "GET /api/define") return define(url, fetcher);
  if (route === "GET /api/pronounce") return pronounce(url, fetcher);
  return explainWord(request, env, fetcher);
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
