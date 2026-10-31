ALTER TABLE "slip_selections"
  ADD COLUMN "base_probability" DOUBLE PRECISION,
  ADD COLUMN "base_model_version" TEXT,
  ADD COLUMN "predicted_at" TIMESTAMP(3),
  ADD COLUMN "prediction_mode" TEXT;

CREATE TABLE "prediction_observations" (
  "id" TEXT NOT NULL PRIMARY KEY, "slip_id" TEXT NOT NULL, "ticket_size" INTEGER NOT NULL, "event_id" TEXT NOT NULL,
  "market_id" TEXT NOT NULL, "outcome_id" TEXT NOT NULL, "specifier" TEXT NOT NULL,
  "market_name" TEXT NOT NULL, "league" TEXT NOT NULL, "mode" TEXT, "odds" DOUBLE PRECISION NOT NULL,
  "probability" DOUBLE PRECISION NOT NULL, "base_probability" DOUBLE PRECISION NOT NULL,
  "model_version" TEXT NOT NULL, "base_model_version" TEXT NOT NULL,
  "predicted_at" TIMESTAMP(3) NOT NULL, "kickoff_at" TIMESTAMP(3) NOT NULL,
  "result" TEXT NOT NULL, "result_source" TEXT, "verified" BOOLEAN NOT NULL DEFAULT false,
  "result_known_at" TIMESTAMP(3) NOT NULL, "checked_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "prediction_observations_kickoff_at_idx" ON "prediction_observations"("kickoff_at");
CREATE INDEX "prediction_observations_model_version_kickoff_at_idx" ON "prediction_observations"("model_version", "kickoff_at");
