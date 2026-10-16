-- AlterTable
ALTER TABLE "approval_attachments" ADD COLUMN     "comment_id" INTEGER;

-- AddForeignKey
ALTER TABLE "approval_attachments" ADD CONSTRAINT "approval_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "approval_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
