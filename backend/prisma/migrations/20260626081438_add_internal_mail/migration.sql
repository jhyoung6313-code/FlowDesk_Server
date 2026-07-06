-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'mail_received';

-- CreateTable
CREATE TABLE "internal_mails" (
    "id" SERIAL NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "parent_id" INTEGER,
    "forwarded_from" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_mails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_mail_recipients" (
    "id" SERIAL NOT NULL,
    "mail_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'to',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "folder" VARCHAR(20) NOT NULL DEFAULT 'inbox',
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "internal_mail_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_mail_attachments" (
    "id" SERIAL NOT NULL,
    "mail_id" INTEGER NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "original_name" VARCHAR(500) NOT NULL,
    "stored_name" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_mail_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_mail_recipients_mail_id_user_id_key" ON "internal_mail_recipients"("mail_id", "user_id");

-- AddForeignKey
ALTER TABLE "internal_mails" ADD CONSTRAINT "internal_mails_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_recipients" ADD CONSTRAINT "internal_mail_recipients_mail_id_fkey" FOREIGN KEY ("mail_id") REFERENCES "internal_mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_recipients" ADD CONSTRAINT "internal_mail_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_attachments" ADD CONSTRAINT "internal_mail_attachments_mail_id_fkey" FOREIGN KEY ("mail_id") REFERENCES "internal_mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_attachments" ADD CONSTRAINT "internal_mail_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
