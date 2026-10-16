-- AlterTable
ALTER TABLE "wbs_tasks" ADD COLUMN     "deliverable_mime" VARCHAR(120),
ADD COLUMN     "deliverable_size" INTEGER,
ADD COLUMN     "deliverable_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "deliverable_uploaded_by" INTEGER;

-- CreateTable
CREATE TABLE "document_favorites" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "ref_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_favorites_user_id_idx" ON "document_favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_favorites_user_id_source_ref_id_key" ON "document_favorites"("user_id", "source", "ref_id");

-- AddForeignKey
ALTER TABLE "document_favorites" ADD CONSTRAINT "document_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
