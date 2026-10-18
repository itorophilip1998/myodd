-- Store a short summary of which games cut a ticket after play verification.
ALTER TABLE "generated_slips" ADD COLUMN IF NOT EXISTS "cut_summary" TEXT;
