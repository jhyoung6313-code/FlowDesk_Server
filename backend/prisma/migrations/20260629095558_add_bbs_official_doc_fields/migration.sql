-- AlterTable
ALTER TABLE "bbs_posts" ADD COLUMN     "official_due_date" DATE,
ADD COLUMN     "recipient_depts" TEXT[],
ADD COLUMN     "sender_org" VARCHAR(200);
