import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSession, isConfigured, onSessionChange } from "./lib/api";
import { Home } from "./Home";
import { SignIn } from "./SignIn";

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    getSession().then(setSession, () => setSession(null));
    return onSessionChange(setSession);
  }, []);

  if (!isConfigured) {
    return (
      <main className="page">
        <h1 className="title">WordArchive</h1>
        <p>This copy of the app isn't connected to a database yet.</p>
      </main>
    );
  }
  if (session === undefined) return <main className="page" aria-busy="true" />;
  return session ? <Home /> : <SignIn />;
}
