-- AlterTable
ALTER TABLE "slip_groups" ADD COLUMN     "is_legacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "owner_id" TEXT;

-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_collections" (
    "user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_collections_pkey" PRIMARY KEY ("user_id","group_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_clerk_id_key" ON "app_users"("clerk_id");

-- CreateIndex
CREATE INDEX "saved_collections_group_id_idx" ON "saved_collections"("group_id");

-- CreateIndex
CREATE INDEX "slip_groups_owner_id_created_at_idx" ON "slip_groups"("owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "slip_groups" ADD CONSTRAINT "slip_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_collections" ADD CONSTRAINT "saved_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_collections" ADD CONSTRAINT "saved_collections_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "slip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve pre-auth collections as an explicit legacy archive. Never assign them to a first login.
UPDATE slip_groups SET is_legacy = TRUE;
