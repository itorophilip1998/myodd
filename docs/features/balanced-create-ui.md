# Balanced Create UI — v0.2.16

This correction follows the requested UI changes after v0.2.15. It supersedes the earlier Home/Generate navigation, collapsed Auto-mode picker, and automatic saving of authenticated generations described in `production-improvements.md`.

- Restore Create, Live, Predictions, and Codes as the main navigation. Settings stays in the signed-in profile menu; its page again includes a Create back link.
- Restore Create at `/`. Keep `/generate` working for existing links, with `/` as its canonical URL. Prediction-book actions and result back links return to Create.
- Put the shared version at the bottom of the footer, centered below the legal links. Keep the profile version entry.
- Show the four mode cards directly, with Investor selected by default or the user's saved mode preference. Remove the collapsed “Mode: Auto optional” control.
- Put searchable markets inside Options. Remove Matches and odds presets/source tabs from ticket options. Show only Min and Max odds inputs, constrained to the selected mode. Prompt odds update the visible inputs within those bounds.
- Generate into a durable private draft and navigate to `/result/[id]`. Creating a ticket no longer marks its collection saved. The result-page Save Collection dialog names and optionally publishes that same collection.
- Remove the repeated public-collection heading/subtitle, completion-policy banners, and routine successful-generation summary. Keep actionable shortage/error messages and privacy-aware metadata. Retention behavior remains unchanged; the save dialog still explains it.
- Remove the underline from card View details controls. Keep independent copying and detail interactions.

No migration or new environment variable is required. Existing saved collections keep their saved state and visibility. Deployment is separate from this change; no application deployment was performed.

Validation: shared build, API/web type checks, API/web production builds, and all 17 Playwright tests passed. Browser checks cover 320, 375, 767, 768, 1023, and 1280px with the original fixed appearance. API tests passed (257); seven optional PostgreSQL integration tests were skipped because no disposable test database was configured. The persistence regression also runs in the ordinary catalog unit suite. No live provider bookings were created.

## Theme removal

Removed the Appearance/Theme setting and the System, Light, and Dark theme feature. The app uses its original fixed colors. Removed the pre-paint theme script, operating-system appearance listener, theme-specific CSS overrides/tokens, theme analytics event, and theme field from shared account settings. Old stored theme values are ignored and stripped during local persistence and account synchronization. Other settings still synchronize. Existing account JSON needs no migration; removed fields are excluded on reads and discarded on the next settings update.

## Markets and mode explanations

Markets is collapsed by default inside Options. Opening it loads provider availability and shows searchable category groups, selectable rows, removable chips, category actions, unavailable states, and a scrollable list. Collapsing it retains the selected market IDs and shows their count.

Each mode has an edge-aligned info button with a 44px touch target. It opens an anchored explanation with a pointer to that exact button, brings it into view, and focuses the explanation. Escape or Close restores focus; clicking outside dismisses it. Learn more opens the matching Terms anchor. The Terms sections now explain each mode’s exact ticket and selection bands, relative risk, control precedence, availability limits, and the distinction between code generation and placing bets. Odds bands come from the shared product constants.

Validation for the markets and mode refinement: all 20 browser tests passed. Four targeted cases passed again after refining automatic scrolling and exact pointer positioning. Mobile and desktop screenshots were visually checked; web type checks and the production build passed. Provider responses in these browser tests are controlled fixtures.
