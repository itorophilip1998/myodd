# Feature: Learning & preferences

## Purpose

Retain generation context for improvement analytics and let users mark feedback / remember generation defaults. This is **preference adaptation and journaling**, not automatic model fine-tuning from likes.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `LearningFeedback.tsx`, settings defaults |
| API | `learning/*` |
| Models | `TrainingEvent`, `TrainingFeedback`, `LearningProfile` |

## Behaviour

- **Training journal** — append-only versioned JSON events (requests, catalogs, candidates, booking attempts, stage changes). Written transactionally with job progress.
- **Feedback** — `POST /api/learning/feedback` (helpful / not helpful, notes, corrected prompts). Notes are not executed as system instructions.
- **Remember settings** — stores approved mode / ticket count / games-per-ticket defaults on an account profile (or anonymous browser profile for guests).
- Export tooling: `apps/api/scripts/export-training.cjs` (local-only, sensitive).

## Related

- [settings.md](./settings.md) — device UI settings
- [generation.md](./generation.md) — what gets journaled
