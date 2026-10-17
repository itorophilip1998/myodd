-- AlterTable
ALTER TABLE "slip_selections" ADD COLUMN     "model_version" TEXT NOT NULL DEFAULT 'odds-v1';

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN     "completed_tasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "failed_count" INTEGER NOT NULL DEFAULT 0;

