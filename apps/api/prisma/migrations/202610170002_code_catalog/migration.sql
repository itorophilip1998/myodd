-- CreateEnum
CREATE TYPE "BookingCodeStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "booking_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "upstream_expires_at" TIMESTAMP(3),
    "checked_at" TIMESTAMP(3),
    "status" "BookingCodeStatus" NOT NULL DEFAULT 'PENDING',
    "active_selections" INTEGER NOT NULL DEFAULT 0,
    "total_selections" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "last_error" TEXT,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "booking_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_sources" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_crawl_runs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "verified" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "code_crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_codes_code_key" ON "booking_codes"("code");

-- CreateIndex
CREATE INDEX "booking_codes_status_expires_at_idx" ON "booking_codes"("status", "expires_at");

-- CreateIndex
CREATE INDEX "booking_codes_checked_at_idx" ON "booking_codes"("checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "code_sources_url_key" ON "code_sources"("url");


-- Retain all saved history; cap reuse windows at one week.
UPDATE "generated_slips" SET "expires_at" = LEAST(COALESCE("expires_at", "created_at" + interval '7 days'), "created_at" + interval '7 days');
UPDATE "slip_groups" SET "expires_at" = LEAST(COALESCE("expires_at", "created_at" + interval '7 days'), "created_at" + interval '7 days');

-- Backfill existing codes without resetting their original age.
INSERT INTO "booking_codes" ("id", "code", "source", "first_seen_at", "last_seen_at", "expires_at", "status", "total_selections")
SELECT 'saved_' || "id", UPPER("booking_code"), 'generated', "created_at", "created_at", "expires_at", 'PENDING'::"BookingCodeStatus", "selection_count"
FROM (SELECT DISTINCT ON (UPPER("booking_code")) * FROM "generated_slips" ORDER BY UPPER("booking_code"), "created_at") s
ON CONFLICT ("code") DO NOTHING;
