-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VarianceLevel" AS ENUM ('LOWER', 'MODERATE', 'HIGHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "slip_groups" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "original_booking_code" TEXT,
    "instruction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "slip_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_slips" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "booking_code" TEXT NOT NULL,
    "share_url" TEXT NOT NULL,
    "total_odds" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "risk_level" "VarianceLevel" NOT NULL,
    "selection_count" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slip_selections" (
    "id" TEXT NOT NULL,
    "slip_id" TEXT NOT NULL,
    "sporty_event_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "outcome_id" TEXT NOT NULL,
    "specifier" TEXT NOT NULL DEFAULT '',
    "home_team" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "market_name" TEXT NOT NULL,
    "selection_name" TEXT NOT NULL,
    "odds" DOUBLE PRECISION NOT NULL,
    "prediction_probability" DOUBLE PRECISION NOT NULL,
    "prediction_score" DOUBLE PRECISION NOT NULL,
    "kickoff_at" TIMESTAMP(3),

    CONSTRAINT "slip_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" TEXT NOT NULL,
    "group_id" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slip_groups_public_id_key" ON "slip_groups"("public_id");

-- CreateIndex
CREATE INDEX "generated_slips_group_id_idx" ON "generated_slips"("group_id");

-- CreateIndex
CREATE INDEX "generated_slips_booking_code_idx" ON "generated_slips"("booking_code");

-- CreateIndex
CREATE INDEX "generated_slips_fingerprint_idx" ON "generated_slips"("fingerprint");

-- CreateIndex
CREATE INDEX "slip_selections_slip_id_idx" ON "slip_selections"("slip_id");

-- CreateIndex
CREATE INDEX "predictions_event_id_market_selection_idx" ON "predictions"("event_id", "market", "selection");

-- CreateIndex
CREATE INDEX "generation_jobs_status_idx" ON "generation_jobs"("status");

-- AddForeignKey
ALTER TABLE "generated_slips" ADD CONSTRAINT "generated_slips_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "slip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_selections" ADD CONSTRAINT "slip_selections_slip_id_fkey" FOREIGN KEY ("slip_id") REFERENCES "generated_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "slip_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

