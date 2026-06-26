-- AlterTable
ALTER TABLE "task_attachments" ADD COLUMN     "comment_id" INTEGER;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "task_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
