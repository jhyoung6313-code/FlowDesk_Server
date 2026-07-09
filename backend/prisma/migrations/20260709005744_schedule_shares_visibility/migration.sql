-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'schedule_shared';

-- AlterTable
ALTER TABLE "schedule_events" ADD COLUMN     "visibility" VARCHAR(10) NOT NULL DEFAULT 'public';

-- CreateTable
CREATE TABLE "schedule_event_shares" (
    "event_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "schedule_event_shares_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateIndex
CREATE INDEX "schedule_event_shares_user_id_idx" ON "schedule_event_shares"("user_id");

-- AddForeignKey
ALTER TABLE "schedule_event_shares" ADD CONSTRAINT "schedule_event_shares_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "schedule_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_event_shares" ADD CONSTRAINT "schedule_event_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
