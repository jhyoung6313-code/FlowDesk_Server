-- CreateTable
CREATE TABLE "internal_mail_comments" (
    "id" SERIAL NOT NULL,
    "mail_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_mail_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "internal_mail_comments" ADD CONSTRAINT "internal_mail_comments_mail_id_fkey" FOREIGN KEY ("mail_id") REFERENCES "internal_mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_comments" ADD CONSTRAINT "internal_mail_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
