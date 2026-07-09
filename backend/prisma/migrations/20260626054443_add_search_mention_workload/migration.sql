-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'mention';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actor_id" INTEGER,
ADD COLUMN     "link" VARCHAR(300);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
