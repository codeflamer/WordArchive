import { checkWord } from "../src/lib/word";
import { lookUp } from "./define";

export type Env = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Only signed-in readers can use the lookup, so it can't be used as an open proxy.
async function isSignedIn(request: Request, env: Env, fetcher: typeof fetch): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization },
  });
  return response.ok;
}

export async function handleRequest(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/define") return json(404, { error: "not_found" });
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" });

  try {
    if (!(await isSignedIn(request, env, fetcher))) return json(401, { error: "sign_in_required" });
  } catch {
    return json(503, { error: "unavailable" });
  }

  const check = checkWord(url.searchParams.get("word") ?? "");
  if (!check.ok) return json(400, { error: "invalid_word" });

  const answer = await lookUp(check.word, (target, init) => fetcher(target, init));
  return answer === "unavailable" ? json(503, { error: "unavailable" }) : json(200, answer);
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
