-- Draft collections stay off history/public feeds until the user explicitly saves.
ALTER TABLE "slip_groups" ADD COLUMN "user_saved" BOOLEAN NOT NULL DEFAULT false;

-- Existing collections were already treated as saved library items.
UPDATE "slip_groups" SET "user_saved" = true;

-- New generations start private; existing public rows keep their visibility.
ALTER TABLE "slip_groups" ALTER COLUMN "is_public" SET DEFAULT false;

CREATE INDEX "slip_groups_user_saved_is_public_created_at_idx" ON "slip_groups"("user_saved", "is_public", "created_at");
