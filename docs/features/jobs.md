# Feature: Jobs & progress

## Purpose

Durable asynchronous generation work with pollable progress so the UI can show stages, counts, and failures without blocking the request thread.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `/result/[id]`, `ProgressQuest.tsx`, job toasts |
| API | `jobs/*`, BullMQ queue `create-booking` |
| Model | `GenerationJob` (+ related group/slip rows) |

## Behaviour

1. Generate endpoints create a job and return identifiers immediately.
2. Worker (`CreateBookingProcessor`, concurrency 3) runs preparation then booking tasks.
3. `GET /api/jobs/:jobId` exposes status, stage, saved/failed counts, errors.
4. UI checkpoints follow persisted backend stages: request → games → combinations → verification → saved.
5. Verified tickets appear as they are saved; partial success is allowed.

## Implementation notes

- Queue name: `create-booking` (`job.constants.ts`).
- Preparation may be inlined as a job name on the same queue; a separate `prepare-generation.processor.ts` may exist as WIP and is not the primary registered path until wired.
- Redis AOF backs BullMQ durability across API restarts.

## Related

- [generation.md](./generation.md)
- [collections.md](./collections.md)
