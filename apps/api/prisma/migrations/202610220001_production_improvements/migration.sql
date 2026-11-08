ALTER TABLE "app_users" ADD COLUMN "ui_settings" JSONB;
ALTER TABLE "generation_jobs"
  ADD COLUMN "request_key" TEXT,
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "payload_hash" TEXT,
  ADD COLUMN "requested_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failures" JSONB NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX "generation_jobs_request_key_key" ON "generation_jobs"("request_key");
ALTER TABLE "slip_groups" ADD COLUMN "completed_at" TIMESTAMP(3), ADD COLUMN "delete_after" TIMESTAMP(3), ADD COLUMN "lifecycle_checked_at" TIMESTAMP(3);
CREATE INDEX "slip_groups_delete_after_idx" ON "slip_groups"("delete_after");
CREATE INDEX "slip_groups_lifecycle_checked_at_idx" ON "slip_groups"("lifecycle_checked_at");
ALTER TABLE "slip_selections" ADD COLUMN "match_phase" TEXT NOT NULL DEFAULT 'unknown', ADD COLUMN "match_checked_at" TIMESTAMP(3);
-- Bring previously declared settlement indexes into migration-managed databases.
CREATE INDEX IF NOT EXISTS "generated_slips_play_status_idx" ON "generated_slips"("play_status");
CREATE INDEX IF NOT EXISTS "slip_selections_play_status_idx" ON "slip_selections"("play_status");
