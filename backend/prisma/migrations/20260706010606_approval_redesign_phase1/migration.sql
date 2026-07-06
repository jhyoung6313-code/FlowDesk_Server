-- AlterEnum
ALTER TYPE "ApprovalStepStatus" ADD VALUE 'skipped';

-- DropIndex
DROP INDEX "approval_steps_document_id_step_order_key";

-- AlterTable
ALTER TABLE "approval_documents" ADD COLUMN     "doc_no" VARCHAR(30),
ADD COLUMN     "rejected_step" INTEGER;

-- AlterTable
ALTER TABLE "approval_steps" ADD COLUMN     "acting_type" VARCHAR(10),
ADD COLUMN     "approver_name_snap" VARCHAR(100),
ADD COLUMN     "approver_title_snap" VARCHAR(100),
ADD COLUMN     "sign_image_path" VARCHAR(255),
ADD COLUMN     "signed_ip" VARCHAR(45),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'approval';

-- AlterTable
ALTER TABLE "approval_templates" ADD COLUMN     "code" VARCHAR(10) NOT NULL DEFAULT 'DOC';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sign_image_path" VARCHAR(255);

-- CreateTable
CREATE TABLE "approval_doc_seq" (
    "form_code" VARCHAR(10) NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "approval_doc_seq_pkey" PRIMARY KEY ("form_code","year")
);

-- CreateIndex
CREATE INDEX "approval_documents_doc_no_idx" ON "approval_documents"("doc_no");

-- CreateIndex
CREATE INDEX "approval_steps_document_id_step_order_idx" ON "approval_steps"("document_id", "step_order");
