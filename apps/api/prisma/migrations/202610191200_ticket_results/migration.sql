CREATE TYPE "SettlementResult" AS ENUM ('WON', 'LOST', 'VOID', 'PENDING', 'UNKNOWN');
ALTER TABLE "generated_slips" ADD COLUMN "result" "SettlementResult" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "slip_selections"
  ADD COLUMN "result" "SettlementResult" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "result_source" TEXT,
  ADD COLUMN "result_checked_at" TIMESTAMP(3),
  ADD COLUMN "result_evidence" JSONB;
