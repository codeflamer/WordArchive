import { useState } from "react";
import { reviewLink } from "./lib/link";

export function ReminderLink() {
  const link = reviewLink(window.location.origin);
  const [copied, setCopied] = useState<"" | "yes" | "no">("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("yes");
    } catch {
      // Some browsers block copying, so the link stays on screen to select by hand.
      setCopied("no");
    }
  }

  return (
    <section className="reminder" aria-label="Daily reminder">
      <h2 className="section">Daily reminder</h2>
      <p>This link opens today's review directly:</p>
      <p className="reminder-link">{link}</p>
      <button type="button" className="quiet" onClick={copy}>
        Copy link
      </button>
      {copied === "yes" && <p className="saved" role="status">Link copied.</p>}
      {copied === "no" && <p className="saved" role="status">The link couldn't be copied. Press and hold it to copy it instead.</p>}
      <ol className="reminder-steps">
        <li>In the Reminders app, add a reminder such as “Review words”.</li>
        <li>Tap the ⓘ, set a daily time and Repeat to Daily, and paste the link into URL.</li>
        <li>The link opens in Safari, which keeps its own sign-in, so sign in there the first time.</li>
      </ol>
    </section>
  );
}
