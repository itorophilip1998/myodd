# Feature: Settings (UI)

## Purpose

Device-local UI preferences with authenticated account synchronization, including appearance, sounds, and generation defaults.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `/settings` — `SettingsForm`, `SettingsProvider`, `ToastProvider`, `lib/ui-settings.ts` |
| API | Account / learning preference endpoints when signed in |

## Behaviour

- `SettingsProvider` wraps the app (see `providers.tsx`) and persists UI settings in local storage (`myodd-ui-settings-v1`).
- Controls include sound toggles and defaults aligned with generation guardrails (`MAX_TICKETS`, games-per-ticket caps).
- Signed-in “remember these settings” from generation flows uses server `LearningProfile` (see [learning.md](./learning.md)).
- Toasts / dictation hooks can play UI sounds via the same provider.

## Notes

- UI settings are per-browser unless synced through account preference APIs.
- Not a substitute for Clerk account security settings.

## Appearance and synchronization (v0.2.15)

System is the initial theme; explicit Light/Dark overrides persist. A pre-paint script applies the local preference. Only System follows operating-system theme changes. Theme tokens cover both palettes.

`GET/PATCH /api/account/settings` read/merge validated settings on the authenticated AppUser record. Local changes apply immediately; pending edits survive a slow initial read and failed synchronization. Account-local caches are isolated, and signing out restores guest preferences. Existing generation-learning preferences remain separate.
