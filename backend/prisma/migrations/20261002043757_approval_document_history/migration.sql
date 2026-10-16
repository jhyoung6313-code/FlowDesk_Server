-- CreateTable
CREATE TABLE "approval_document_histories" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "field" VARCHAR(100),
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_document_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_document_histories_document_id_created_at_idx" ON "approval_document_histories"("document_id", "created_at");

-- AddForeignKey
ALTER TABLE "approval_document_histories" ADD CONSTRAINT "approval_document_histories_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "approval_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_histories" ADD CONSTRAINT "approval_document_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
