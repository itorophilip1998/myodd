-- Account-scoped removal preserves collection records and training provenance.
ALTER TABLE "saved_collections" ADD COLUMN "hidden_at" TIMESTAMP(3);
