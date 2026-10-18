# Feature: Settings (UI)

## Purpose

Device-local UI preferences (sounds, defaults presentation) plus links into account generation preferences.

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
