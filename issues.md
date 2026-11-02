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
