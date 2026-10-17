ALTER TABLE "slip_groups" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "app_users" ADD COLUMN "public_id" TEXT, ADD COLUMN "username" TEXT, ADD COLUMN "profile_synced_at" TIMESTAMP(3);
UPDATE "app_users" SET "public_id" = 'creator_' || replace("id", '-', '');
ALTER TABLE "app_users" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX "app_users_public_id_key" ON "app_users"("public_id");
CREATE TABLE "creator_follows" (
  "follower_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_follows_pkey" PRIMARY KEY ("follower_id", "creator_id"),
  CONSTRAINT "creator_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creator_follows_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "creator_follows_creator_id_idx" ON "creator_follows"("creator_id");
