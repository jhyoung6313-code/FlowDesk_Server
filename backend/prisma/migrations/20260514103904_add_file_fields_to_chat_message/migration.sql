-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "file_name" VARCHAR(255),
ADD COLUMN     "file_size" INTEGER,
ADD COLUMN     "file_type" VARCHAR(100),
ADD COLUMN     "file_url" VARCHAR(500),
ALTER COLUMN "content" SET DEFAULT '';
