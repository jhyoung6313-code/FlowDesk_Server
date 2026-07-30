-- AlterTable
ALTER TABLE "approval_documents" ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "is_urgent" BOOLEAN NOT NULL DEFAULT false;
