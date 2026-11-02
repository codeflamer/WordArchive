# WordArchive Kanban

Feature cards for building WordArchive, in build order. To move a card, cut it and paste it under the new column heading.

## Rules

1. **Vertical features only.** Every card delivers something usable that works through the screen, server and data. Backend-only or screen-only cards aren't allowed.
2. **One card in progress at a time.** A card starts only when the cards it depends on are in Done.
3. **Every feature gets tested.** When the build is finished, the card moves to Testing and its test steps are run.
4. **Done needs two results.** The test steps must pass, and the effectiveness check must be measured and recorded.
5. **Every issue goes in [issues.md](issues.md).** A failed test sends the card back to In progress, with the issue number on the card. The full test is run again after the fix.

The effectiveness targets below are proposed and can be changed.

## To do

### F07: Handle typos and unknown words

- **Depends on:** F05
- **Requirements:** W3, W5
- **Story:** As the reader, I get spelling suggestions for a typo, and a word the dictionary lacks still saves.
- **Screen:** "Did you mean" suggestions and a "check this word" flag
- **Server:** Cloudflare returns suggestions when lookup finds nothing
- **Data:** Flag for unchecked words

**Test steps**

- [ ] Save "ephemral" and choose the suggested spelling.
- [ ] Save a made-up word and choose to keep it.
- [ ] Open your word list.

**Passes if:** The corrected word gets a definition, and the made-up word is saved with a visible flag.

**Effectiveness check:** Fixing a typo takes one tap.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F08: Get the right meaning and 3 examples from AI

- **Depends on:** F04, F05
- **Requirements:** M2, M3, M4
- **Story:** As the reader, I add a book sentence, and AI highlights the meaning that fits and writes 3 examples, labelled as AI-written.
- **Screen:** Highlighted meaning, 3 examples and an AI label
- **Server:** Cloudflare calls Groq and holds the key
- **Data:** Chosen meaning and examples stored with the word

**Before starting**

- [ ] Confirm Groq's free plan limits and data terms on its official pages.

**Test steps**

- [ ] Save "sanction" with a sentence where it means to approve.
- [ ] Save "sanction" on a test account with a sentence where it means to punish.
- [ ] Check the highlighted meaning and examples for each.
- [ ] Claude confirms the AI key can't be found in the app's code on the phone.

**Passes if:** Each sentence gets the right meaning, exactly 3 examples and an AI label, and the key isn't exposed.

**Effectiveness check:** Try 20 real word and sentence pairs. Record how many meanings you judge correct.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F09: Fall back to the dictionary when AI is unavailable

- **Depends on:** F08
- **Requirements:** M5, M6
- **Story:** As the reader, I can still save a word when AI fails, and retry it later.
- **Screen:** "Incomplete" label and a "Try AI again" button
- **Server:** Cloudflare detects the Groq failure and returns dictionary examples
- **Data:** Incomplete status stored with the word

**Test steps**

- [ ] Claude temporarily disables the AI key on a test setup.
- [ ] Save a word.
- [ ] Confirm dictionary examples and the incomplete label show.
- [ ] Claude restores the key.
- [ ] Tap "Try AI again".

**Passes if:** The word saves during the failure, then gets its AI meaning and 3 examples on retry.

**Effectiveness check:** An AI failure never stops a word being saved.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F10: Merge a repeated word into one entry

- **Depends on:** F04
- **Requirements:** W6
- **Story:** As the reader, when I save a word again, its new sentence joins the existing entry.
- **Screen:** Several sentences on one word's page
- **Server:** Save checks for an existing word per user
- **Data:** Word has a list of sentences, each with its book

**Test steps**

- [ ] Save a word with a sentence from one book.
- [ ] Switch book and save the same word with a new sentence.
- [ ] Check your word list and the word's page.

**Passes if:** The word appears once, showing both sentences and their books.

**Effectiveness check:** No duplicate words appear after 5 repeated saves.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F11: Save without signal and sync later

- **Depends on:** F03, F05
- **Requirements:** Offline requirement in the PRD
- **Story:** As the reader with no signal, I save words and quotes, and they sync and get looked up when I'm back online.
- **Screen:** "Waiting to sync" marker on entries
- **Server:** Sync to Supabase and lookup through Cloudflare on reconnect
- **Data:** Offline storage holds entries until they sync

**Before starting**

- [ ] Try the keyboard mic in Airplane Mode on your iPhone, and record whether it works.

**Test steps**

- [ ] Turn on Airplane Mode.
- [ ] Save a word and a quote, then force-close the app.
- [ ] Reopen it and check they are listed as waiting.
- [ ] Turn off Airplane Mode.
- [ ] Check them on your laptop or after a fresh sign-in.

**Passes if:** Nothing is lost, nothing is duplicated, and the word gets its definition after syncing.

**Effectiveness check:** Entries sync within a minute of the app being open online.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F12: Review due words with spaced repetition

- **Depends on:** F05
- **Requirements:** R1, R2, R3
- **Story:** As the reader, I see due words in their book sentences, recall the meaning, flip the card and mark how well I knew it.
- **Screen:** Review session with flip and rating buttons
- **Server:** Access rules cover review history
- **Data:** Next review date and history stored per word

**Before starting**

- [ ] Confirm the `ts-fsrs` library's current version, maintenance and licence.
- [ ] Decide whether incomplete words appear in review before AI fills them in.

**Test steps**

- [ ] Save 3 words, and start a review.
- [ ] Flip each card and rate one as forgotten and one as easy.
- [ ] Check the next review date for each.
- [ ] Claude runs automated tests of the schedule across simulated dates.

**Passes if:** Only due words appear, and a forgotten word comes back sooner than an easy one.

**Effectiveness check:** After 2 weeks of use, record how many reviewed words you recall from a sample of 10.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F13: Cap review sessions and carry the rest over

- **Depends on:** F12
- **Requirements:** R4
- **Story:** As the reader, I never face more than about 10 words in a session, even after missing days.
- **Screen:** Session progress and an end-of-session message
- **Server:** Due words request is limited
- **Data:** Words left over stay due

**Test steps**

- [ ] Claude sets up a test account with 25 due words.
- [ ] Complete a session.
- [ ] Start the next day's session, using a simulated date.

**Passes if:** The session stops at the cap, and the remaining words appear in the next one.

**Effectiveness check:** A session takes about 5 minutes or less.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F14: Resurface one past quote each day

- **Depends on:** F03, F12
- **Requirements:** Q3
- **Story:** As the reader, I see one past quote each day after my review.
- **Screen:** Quote of the day with its book and author
- **Server:** Daily quote selection for the signed-in user
- **Data:** Date each quote was last shown

**Test steps**

- [ ] Save at least 5 quotes.
- [ ] Finish a review and check the quote shown.
- [ ] Reopen the app the same day.
- [ ] Claude tests the following days using simulated dates.

**Passes if:** The quote stays the same all day, changes the next day, and doesn't repeat until the others have been shown.

**Effectiveness check:** After 2 weeks, note whether the daily quote is still something you read.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F15: Open today's review from a daily reminder

- **Depends on:** F12
- **Requirements:** Daily reminder in the PRD
- **Story:** As the reader, a recurring iPhone reminder takes me straight to today's review.
- **Screen:** A direct link that opens the review session
- **Server:** Link is served by Cloudflare and checks sign-in
- **Data:** Reads the due words

**Test steps**

- [ ] Create a recurring iPhone reminder using the link from the app.
- [ ] Wait for it to fire, then tap it and open the link.
- [ ] Check what opens.

**Passes if:** The link opens today's review, signed in, without going through other screens.

**Effectiveness check:** Record how many days out of 14 you complete a review. Use this to decide whether web notifications are needed.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F16: Search words and quotes

- **Depends on:** F03, F05
- **Requirements:** D1
- **Story:** As the reader, I search by text, book or author and find what I saved.
- **Screen:** Search box and results
- **Server:** Search runs only over the user's own entries
- **Data:** Search across words, quotes and books

**Test steps**

- [ ] Search for a saved word.
- [ ] Search for a phrase inside a quote.
- [ ] Search for a book title and an author.
- [ ] Search for something that doesn't exist.

**Passes if:** Each search finds the matching entries, and the empty search says nothing was found.

**Effectiveness check:** You can find any quote you remember within 15 seconds.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F17: Export everything to a file

- **Depends on:** F03, F05
- **Requirements:** D2
- **Story:** As the reader, I can save all my data to a file at any time.
- **Screen:** Export button
- **Server:** Export gathers only the user's own data
- **Data:** All books, words, quotes and review history

**Test steps**

- [ ] Tap Export and save the file.
- [ ] Open it and compare the counts with the app.
- [ ] Claude runs an automated test that restores the file into an empty test account.

**Passes if:** Every entry is in the file, and the file restores into an empty test account.

**Effectiveness check:** Export takes one tap, and the file is readable outside the app.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

### F18: Keep the database awake and show its status

- **Depends on:** F01
- **Requirements:** Supabase pausing risk in the PRD
- **Story:** As the reader, my app still works after a reading break of more than a week.
- **Screen:** "Last checked" line in the app's settings
- **Server:** Daily Cloudflare scheduled job
- **Data:** The job writes its latest run to the database

**Test steps**

- [ ] Claude deploys the daily job and confirms a run.
- [ ] Check the "last checked" date in the app.
- [ ] Leave the app unused for 8 or more days.
- [ ] Open the app and save a word.

**Passes if:** The app works after 8 days unused, with no pause warning from Supabase.

**Effectiveness check:** No manual restores are needed during a month of use.

**Test record:** Date: — | Result: — | Effectiveness: — | Issues: —

## In progress

None yet.

## Testing

### F06: Save a word under its base form

- **Depends on:** F05
- **Requirements:** W4
- **Story:** As the reader, I type "mitigated" and the app looks up and saves "mitigate".
- **Screen:** Word shown in base form, with what you typed
- **Server:** Cloudflare finds the base form during lookup
- **Data:** Base form and original typed form both stored

**Test steps**

- [x] Save "mitigated", "running" and "children".
- [x] Check the word shown for each one.

**Passes if:** Each word is saved under its base form with its definition, and what you typed is still visible.

**Effectiveness check:** Try 10 changed word forms from your own books. Record how many are correct.

**Build progress:** Built, with all 108 automated tests passing. Detection gave the expected result on 22 of 23 real Wiktionary entries, with "ran" staying as typed. The flow works in a browser against the fake local server. Live, and the column on the real database refuses signed-out access. Waiting for the effectiveness result before moving to Done.

**Test record:** Date: 2026-11-02 | Result: Passed on iPhone | Effectiveness: Not yet recorded | Issues: ISS-010, ISS-011

## Done

### F05: See a dictionary definition for a saved word

- **Depends on:** F01
- **Requirements:** M1
- **Story:** As the reader, I save a word and its real dictionary definitions appear without my doing anything else.
- **Screen:** Definitions on the word's page, with a loading state
- **Server:** Cloudflare looks up Free Dictionary, then Wiktionary as a backup
- **Data:** Definitions and their source stored with the word

**Before starting**

- [x] Confirm the Free Dictionary API's limits and reliability, using a sample of real words. No limit is published, and responses reported 450 requests. It finds real words but gives occasional temporary server errors, and it relies on donations (checked 2026-11-02, see ISS-007).

**Test steps**

- [x] Save "sanction" and open it.
- [x] Confirm its definitions and source are shown.
- [x] Reopen the word with Airplane Mode on.
- [x] Claude runs an automated test that forces the main dictionary to fail, to confirm Wiktionary is used.

**Passes if:** Definitions appear, stay available offline once saved, and still arrive when the main dictionary fails.

**Effectiveness check:** Try 20 words from your own books. Record how many get a definition.

**Build progress:** Live. All 86 automated tests pass, including the fallback to Wiktionary. The live server refuses signed-out requests and fake sign-ins.

**Test record:** Date: 2026-11-02 | Result: Passed on iPhone | Effectiveness: Passed, 20 of 20 words got a definition | Issues: ISS-007, ISS-008, ISS-009

### F04: Save the book sentence with a word

- **Depends on:** F02
- **Requirements:** W2
- **Story:** As the reader, I can add the sentence I found the word in, or skip it.
- **Screen:** Optional sentence box, and sentence on the word's page
- **Server:** Access rules cover the new field
- **Data:** Sentence stored with the word

**Test steps**

- [x] Save a word with a sentence.
- [x] Save another word and leave the sentence empty.
- [x] Open both words.

**Passes if:** The sentence shows on the first word, and the second saves normally without one.

**Effectiveness check:** Skipping the sentence adds no extra steps.

**Build progress:** Live. All 52 automated tests pass, and the flow works in a browser against the fake local server. The sentence column exists on the real database and refuses signed-out reads.

**Test record:** Date: 2026-11-02 | Result: Passed on iPhone | Effectiveness: Passed, skipping the sentence adds no steps | Issues: None

### F03: Save a quote word for word

- **Depends on:** F02
- **Requirements:** Q1, Q2, B3
- **Story:** As the reader, I type or dictate a quote and it is saved exactly as entered, against my current book.
- **Screen:** Add quote form and quote list
- **Server:** Access rules keep quotes private to the user
- **Data:** Quotes table, linked to a book

**Test steps**

- [x] Type a quote with commas, quotation marks and a line break.
- [x] Dictate a second quote with the iPhone keyboard mic.
- [x] Reopen the app and compare both with what you entered.

**Passes if:** Both quotes match what was entered, character for character, and show the current book.

**Effectiveness check:** A short quote can be saved without losing your place in the book.

**Build progress:** Live. All 45 automated tests pass, and a multi-line quote saved exactly in a browser against the fake local server. The real database refuses signed-out access to quotes.

**Test record:** Date: 2026-11-02 | Result: Passed on iPhone | Effectiveness: Passed, saved a short quote without losing place | Issues: None

### F02: Set a current book, and new words attach to it

- **Depends on:** F01
- **Requirements:** B1, B2, B3
- **Story:** As the reader, I pick my book once, and every word I save belongs to it.
- **Screen:** Add book form, current book picker and book name on each word
- **Server:** Access rules keep books private to the user
- **Data:** Books table, current book setting and word-to-book link

**Test steps**

- [x] Add two books with titles and authors.
- [x] Set the first as current and save a word.
- [x] Switch to the second book and save another word.
- [x] Reopen the app.

**Passes if:** Each word shows the book that was current when it was saved, and the current book is still selected after reopening.

**Effectiveness check:** Saving a word needs no extra taps to choose the book.

**Build progress:** Live. All 35 automated tests pass, and the flow works in a browser against the fake local server. The real database refuses signed-out access to the new tables.

**Test record:** Date: 2026-11-02 | Result: Passed on iPhone | Effectiveness: Passed, no extra taps to choose the book | Issues: None

### F01: Sign in, save a word, and find it after reopening

- **Depends on:** Nothing
- **Requirements:** W1, D3
- **Story:** As the reader, I add the app to my Home Screen, sign in, type a word and still see it after closing the app.
- **Screen:** Sign-in, add word box and word list
- **Server:** App hosted on Cloudflare, with Supabase sign-in
- **Data:** Words table, private to each user

**Before starting**

- [x] Confirm the Supabase free plan limits on its official pages. 500 MB database, 50,000 monthly users, 5 GB egress, 2 active projects (checked 2026-11-02).
- [x] Confirm the Cloudflare free plan limits on its official pages. 100,000 requests a day, 20,000 files, 5 scheduled jobs (checked 2026-11-02).
- [x] Decide whether the proposed success targets in the PRD are right. The 10-second target is confirmed for F01. The PRD's other targets are still proposed.

**Test steps**

- [x] Open the app link on your iPhone and add it to the Home Screen.
- [x] Open it from the Home Screen and sign in.
- [x] Save the word "ephemeral".
- [x] Force-close the app and reopen it.
- [x] Sign out, and confirm the list is no longer visible.

**Passes if:** The word is still listed after reopening, and it can't be seen when signed out.

**Effectiveness check:** Saving a typed word takes under 10 seconds from opening the app.

**Build progress:** Live at https://wordarchive.codeflamer.workers.dev. Sign-in uses email and password. All 22 automated tests pass. The real Supabase project refuses signed-out reads and saves, and new sign-ups are off. The published code contains no secret key. 

**Test record:** Date: 2026-11-02 | Result: Passed on iPhone | Effectiveness: Passed, saved a word in under 10 seconds | Issues: ISS-001 to ISS-006
