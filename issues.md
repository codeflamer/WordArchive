# WordArchive issues

Every issue found while building or testing WordArchive is logged here, including failed tests from [KANBAN.md](KANBAN.md).

A card can't move to Done until its full test is run again and passes.

## Open

### ISS-003: Project folder syncs through OneDrive

- **Card:** F01
- **Found:** 2026-11-02
- **Severity:** Minor
- **Steps to reproduce:**
  1. Run `npm install` in the project folder on the OneDrive Desktop.
- **Expected:** Only project files sync.
- **Actual:** OneDrive also has to sync thousands of generated files in `node_modules`, which can slow it down or lock files during builds.
- **Cause:** The project is inside a OneDrive folder.
- **Fix:** Not decided. Moving the project out of OneDrive would avoid this.
- **Retest:** Not yet

## Resolved

### ISS-011: Sign-out tests failed intermittently

- **Card:** F06
- **Found:** 2026-11-02
- **Severity:** Minor
- **Steps to reproduce:**
  1. Run the automated tests several times.
- **Expected:** The tests pass every time.
- **Actual:** "clears any leftover copy when opening signed out" sometimes failed.
- **Cause:** The test checked for the deleted copy at the moment the sign-in screen appeared, just before the app's deletion step ran. This followed the ISS-008 fix, which moved that deletion to after the screen closes.
- **Fix:** The two sign-out tests now wait for the deletion. The app itself didn't change.
- **Retest:** 2026-11-02, 10 of 10 full test runs passed.

### ISS-010: Base form column missing from the real database

- **Card:** F06
- **Found:** 2026-11-02
- **Severity:** Blocker
- **Steps to reproduce:**
  1. Run the pre-deploy check after `006_word_base_form.sql` was reported as run.
- **Expected:** The `base_form` column exists and refuses signed-out access.
- **Actual:** The database replied that the column doesn't exist (error 42703).
- **Cause:** Unknown. The first run didn't take effect, and the same SQL succeeded on the second try.
- **Fix:** Ran the SQL again. The pre-deploy check stopped the deploy until it passed.
- **Retest:** 2026-11-02, the column exists and refuses signed-out reads and changes.

### ISS-007: Dictionary services fail temporarily

- **Card:** F05
- **Found:** 2026-11-02
- **Severity:** Major
- **Steps to reproduce:**
  1. Look up 22 words in a row on both services.
- **Expected:** Each real word returns a definition.
- **Actual:** The Free Dictionary API returned temporary 500 and 502 errors for 7 words, including when retried. Wiktionary returned 429 rate-limit errors after about 12 quick requests.
- **Cause:** The Free Dictionary API is a donation-funded service with occasional server errors. Wikimedia limits how quickly a client can make requests.
- **Fix:** The server retries the Free Dictionary API once, falls back to Wiktionary, and identifies itself to Wikimedia. If neither answers, the word stays saved with a "Try again" button.
- **Retest:** 2026-11-02, the F05 iPhone test passed with a real lookup through Cloudflare. A long outage of both services hasn't been tried live.

### ISS-009: Local preview looked down

- **Card:** F05
- **Found:** 2026-11-02
- **Severity:** Minor
- **Steps to reproduce:**
  1. Open the browser pane after a browser check has finished.
- **Expected:** The local preview loads.
- **Actual:** The page failed to load, and `localhost:5173` showed another project, Spend Guard.
- **Cause:** The local preview was stopped after each check. It was also set up on port 5173, which Spend Guard uses. The live app wasn't affected.
- **Fix:** The local preview now uses port 5174.
- **Retest:** 2026-11-02, local preview restarted on port 5174.

### ISS-008: Saved words could stay on the phone after sign-out

- **Card:** F05
- **Found:** 2026-11-02
- **Severity:** Major
- **Steps to reproduce:**
  1. Sign out just as the word list finishes refreshing.
- **Expected:** The copy of the words on the phone is deleted.
- **Actual:** The copy could be written back straight after it was deleted. An automated test failed in 3 of 4 runs.
- **Cause:** The copy was deleted before the words screen's pending save had run.
- **Fix:** The copy is now deleted only after the words screen has closed.
- **Retest:** 2026-11-02, see the test runs in F05. It was caught before deploying, so it never reached the live app.

### ISS-004: Supabase blocks email template edits without custom SMTP

- **Card:** F01
- **Found:** 2026-11-02
- **Severity:** Blocker
- **Steps to reproduce:**
  1. Open the Magic link or OTP template in Supabase.
  2. Try to edit it without custom SMTP enabled.
- **Expected:** The template can be changed to show a sign-in code.
- **Actual:** Supabase says custom SMTP must be enabled first.
- **Cause:** The sign-in design assumed the template could be edited on the default email service.
- **Fix:** Switched to email and password sign-in, which needs no email template.
- **Retest:** 2026-11-02, real sign-in passed in the F01 iPhone test.

### ISS-006: Cloudflare account needed a workers.dev subdomain

- **Card:** F01
- **Found:** 2026-11-02
- **Severity:** Blocker
- **Steps to reproduce:**
  1. Run `npm run deploy` on an account with no workers.dev subdomain.
- **Expected:** The app deploys.
- **Actual:** Wrangler couldn't register "wordarchive" as the account's subdomain, because that name is taken.
- **Cause:** A new Cloudflare account has no subdomain, and my setup steps didn't include choosing one.
- **Fix:** The account owner registered the `codeflamer` subdomain.
- **Retest:** 2026-11-02, deployed. The site loads once its certificate is ready, which took a few retries.

### ISS-005: Supabase URL included the API path

- **Card:** F01
- **Found:** 2026-11-02
- **Severity:** Blocker
- **Steps to reproduce:**
  1. Put the URL from Supabase's Data API page, including `/rest/v1/`, in `.env.local`.
  2. Make a request to the database.
- **Expected:** The request reaches the words table.
- **Actual:** Requests returned a 404, "Invalid path specified in request URL".
- **Cause:** The app adds `/rest/v1/` itself, so the path was doubled. My setup instructions didn't warn about this ending.
- **Fix:** Removed `/rest/v1/` from `VITE_SUPABASE_URL` in `.env.local`.
- **Retest:** 2026-11-02, see the F01 build progress.

### ISS-002: Test tool didn't support the installed Node version

- **Card:** F01
- **Found:** 2026-11-02
- **Severity:** Minor
- **Steps to reproduce:**
  1. Install the latest `jsdom` on Node 22.15.0.
- **Expected:** An install with no compatibility warnings
- **Actual:** npm warned that `jsdom` 30 needs a newer Node version.
- **Cause:** The latest `jsdom` requires Node 22.22.2 or newer.
- **Fix:** Used `jsdom` 26.
- **Retest:** 2026-11-02, warning gone and all 22 tests passed.

### ISS-001: Build failed on missing Node types

- **Card:** F01
- **Found:** 2026-11-02
- **Severity:** Major
- **Steps to reproduce:**
  1. Run `npm run build`.
- **Expected:** The build completes.
- **Actual:** The type check failed in `tests/access-rules.test.ts` because it couldn't find `node:fs`.
- **Cause:** The Node type definitions weren't installed or enabled.
- **Fix:** Installed `@types/node` and added it to `tsconfig.json`.
- **Retest:** 2026-11-02, build passed.

## Template

Copy this into **Open**, using the next number. Move it to **Resolved** once the retest passes.

```markdown
### ISS-001: Short description

- **Card:** F01
- **Found:** YYYY-MM-DD
- **Severity:** Blocker, Major or Minor
- **Steps to reproduce:**
  1. What was done
- **Expected:** What should have happened
- **Actual:** What happened instead
- **Cause:** Why it happened, once known
- **Fix:** What changed
- **Retest:** Date and result
```
