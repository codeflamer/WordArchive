import { useState, type FormEvent } from "react";
import { signIn } from "./lib/api";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
    } catch {
      setError("You weren't signed in. Check your email, password and connection, then try again.");
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="title">WordArchive</h1>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="field"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="primary" disabled={busy}>Sign in</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
