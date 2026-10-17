-- AlterEnum
ALTER TYPE "BookingCodeStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'QUEUED',
ADD COLUMN     "stage_detail" TEXT;

-- CreateTable
CREATE TABLE "training_events" (
    "id" TEXT NOT NULL,
    "event_key" TEXT,
    "group_id" TEXT,
    "job_id" TEXT,
    "profile_id" TEXT,
    "kind" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_profiles" (
    "id" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_feedback" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "rating" TEXT NOT NULL,
    "note" TEXT,
    "corrected_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_events_event_key_key" ON "training_events"("event_key");

-- CreateIndex
CREATE INDEX "training_events_group_id_created_at_idx" ON "training_events"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "training_events_job_id_created_at_idx" ON "training_events"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "training_events_kind_created_at_idx" ON "training_events"("kind", "created_at");

-- CreateIndex
CREATE INDEX "training_feedback_group_id_idx" ON "training_feedback"("group_id");

-- Preserve existing results in the export; missing historical context is explicitly labelled.
INSERT INTO training_events (id,event_key,group_id,kind,payload)
SELECT 'legacy_' || g.id, 'legacy:' || g.id, g.id, 'LEGACY_COLLECTION_IMPORTED',
jsonb_build_object('historicalContextAvailable',false,'collection',to_jsonb(g),'slips',
COALESCE((SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object('selections',
 COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM slip_selections p WHERE p.slip_id=s.id),'[]'::jsonb)))
 FROM generated_slips s WHERE s.group_id=g.id),'[]'::jsonb))
FROM slip_groups g ON CONFLICT (event_key) DO NOTHING;
