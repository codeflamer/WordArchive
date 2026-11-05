type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type KeepAwakeEnv = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string };

// Free Supabase projects pause after a week of low activity, so a scheduled job makes a small request.
export async function keepAwake(env: KeepAwakeEnv, fetcher: FetchLike): Promise<boolean> {
  try {
    const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/record_keep_awake`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) console.error(`Keep-awake failed: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error(`Keep-awake failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return false;
  }
}
