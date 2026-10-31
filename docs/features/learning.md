# Learning, prediction performance and preferences

Prediction learning and user preferences have separate inputs. Helpful/not-helpful feedback can save form defaults; it never becomes a win/loss label or a prompt instruction.

## Verified-outcome learning loop

1. The AI scores only future, active selections and records `predictedAt`, base probability and base model version. Investor/Gambler goal trends are applied before the learning adjustment, so their numerical source remains identifiable.
2. Accepted tickets preserve those fields in `SlipSelection`. Market availability, approved mode markets, leg prices and mixed ticket-odds targets are still enforced independently.
3. Result checks archive `PredictionObservation` alongside the settlement transaction. Forecast fields never change. Confirmed results can be corrected or revoked. Repeated checks do not move the first-known outcome timestamp forward.
4. Only completed matches with explicit SportyBet JSON/page or supported BBC score evidence contribute labels. Pending, live, void, conflicted, unverified and post-kickoff forecasts are excluded. Existing tickets without original prediction timestamps/base metadata are not backfilled with invented history.
5. The `prediction-learning` BullMQ job runs every six hours. It loads a rolling window of 90 days/up to 10,000 observations, sends only verified samples to the internal AI learner, and journals `MODEL_EVALUATION` results. Account IDs, booking codes, notes and user feedback are not sent.
6. A small regularized sigmoid/logit calibrator learns probability adjustments separately for each base-model version and market ID. Sparse groups retain the base prediction. It adjusts estimates and ranking; it does not generate fixtures or bookmaker selections.
7. A candidate is activated only after beating both the raw baseline and incumbent on later, fresh matches. Atomic artifacts on the AI data volume are hot-loaded by all agents. No provider fine-tuning dependency or restart is required.

## Promotion checks

- At least **200 training outcomes across 40 matches** and **80 holdout outcomes across 40 new matches**.
- Each fitted base-model/market group needs **80 outcomes across 20 matches**, including at least ten wins and ten losses.
- Whole-event forecast days define the chronological split. A training result must have been known before the earliest holdout forecast. All options from one match stay on the same side.
- Repeated users/tickets predicting the same exact event/market/outcome/line count once. Contradictory verified outcomes for that key are quarantined.
- Both Brier score and log loss must improve by at least **0.002** against the baseline and current model. Event-level bootstrap confidence bounds must also show improvement, so correlated options cannot be treated as independent matches.
- Identical batches are not retested. Evaluated holdout outcomes are not reused for later promotion decisions, even after a rejected candidate. A previous holdout may become training data only when its results were known before a genuinely newer holdout.
- Rejected/insufficient-data runs leave the current model active. The previous artifact is retained on promotion. Missing/corrupt learning artifacts fall back to the base predictions and expose a degraded status.

This is measured probability calibration of the existing odds/Poisson/trend models. It is not evidence that the application is the best predictor, that every release improves, or that a generated ticket will win. Tests use synthetic outcomes to verify the pipeline; production improvement requires sufficient real, verified results. Performance reflects generated-ticket selections, not all matches in the football universe.

Method reference: [scikit-learn probability calibration and proper scoring rules](https://scikit-learn.org/stable/modules/calibration.html).

## Performance panel and endpoints

The Predictions page includes a collapsible performance panel with verified selection count, selection win rate, whole-ticket win rate, Brier error versus the saved baseline, mode/model breakdowns and learning status. Empty datasets show no manufactured accuracy. Whole-ticket results require every expected leg to have verified final evidence. Selection hit rate is never displayed as ticket win probability.

`GET /api/learning/performance` returns aggregate metrics only: selection and ticket outcomes, Brier/log loss, calibration bins, mode/market/model breakdowns, excluded counts and active/last-evaluation metadata. Pending and void observations do not affect binary accuracy or training. The current rolling window/record cap is explicit in the response.

Internal AI endpoints are `POST /learning/status` and `POST /learning/update`. They are for the API worker on the private service network; do not expose the AI service publicly. Browser clients have no retrain or model-activation route.

## Storage and deployment

Apply `202610310001_prediction_learning` through the existing migration service before starting the matching API build. It adds immutable forecast metadata and an independent `prediction_observations` table, so collection expiry does not erase learning data. The migration does not train a model or rewrite historical forecasts.

Compose stores artifacts at `/data/learning/active.json` on the existing persistent `ai_data` volume. `previous.json` retains the prior accepted model; `last-evaluation.json` records the latest evaluation. A file lock serializes updates across Python workers, and atomic file replacement prevents partial reads. For local development, `LEARNING_MODEL_PATH` can point to a writable local path.

Use the normal build/start workflow to apply the migration and start the durable scheduler. This implementation does not apply migrations to a live database or activate a model without real evaluation data. A fresh deployment starts in **collecting** state.

## Folder ownership

| Layer | Files |
| --- | --- |
| Forecast/source metadata | `llms/scoring.py`, `schemas.py`, `slips.service.ts` |
| Label/evidence archive | `learning/observation.ts`, `groups/play-check.service.ts`, Prisma migration |
| Scheduled refresh | `learning/learning-maintenance.ts`, `model-learning.service.ts` |
| Calibration and evaluation | `tools/calibration.py`, `learning_data.py`, `model_metrics.py`, `model_learning.py` |
| Persistent model state | `memory/model_store.py` |
| Public metrics | `learning/performance.ts`, `performance.controller.ts` |
| User-visible tracking | `PredictionPerformance.tsx`, Predictions page |

The existing append-only journal, `TrainingFeedback`, `LearningProfile`, `POST /api/learning/feedback`, preference-revision behavior, and local export tooling remain available. Manual historical-goal Poisson training remains separate from automatic probability calibration.
