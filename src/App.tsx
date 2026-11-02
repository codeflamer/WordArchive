import { useEffect, useState } from "react";
import { getSession, isConfigured, isOfflineError, onSessionChange } from "./lib/api";
import { clearCachedWords } from "./lib/cache";
import { Home } from "./Home";
import { SignIn } from "./SignIn";

type SignedIn = "checking" | "yes" | "no";

export function App() {
  const [signedIn, setSignedIn] = useState<SignedIn>("checking");

  useEffect(() => {
    if (!isConfigured) return;
    getSession().then(
      (session) => setSignedIn(session ? "yes" : "no"),
      // No signal shouldn't lock a signed-in reader out of their saved words.
      (error) => setSignedIn(isOfflineError(error) ? "yes" : "no"),
    );
    return onSessionChange((session) => setSignedIn(session ? "yes" : "no"));
  }, []);

  // Runs after the words screen has closed, so it can't write the copy back afterwards.
  useEffect(() => {
    if (signedIn === "no") clearCachedWords();
  }, [signedIn]);

  if (!isConfigured) {
    return (
      <main className="page">
        <h1 className="title">WordArchive</h1>
        <p>This copy of the app isn't connected to a database yet.</p>
      </main>
    );
  }
  if (signedIn === "checking") return <main className="page" aria-busy="true" />;
  return signedIn === "yes" ? <Home /> : <SignIn />;
}
