-- Persist AI candidate ranking so Recommended order survives concurrent booking jobs.
ALTER TABLE "generated_slips" ADD COLUMN "rank_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "generated_slips" ADD COLUMN "slip_score" DOUBLE PRECISION NOT NULL DEFAULT 0;
CREATE INDEX "generated_slips_group_id_rank_order_idx" ON "generated_slips"("group_id", "rank_order");
