-- AlterTable
ALTER TABLE "internal_mails" ADD COLUMN     "priority" VARCHAR(10) NOT NULL DEFAULT 'normal',
ADD COLUMN     "thread_id" INTEGER;

-- CreateTable
CREATE TABLE "internal_mail_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT '#1677ff',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_mail_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_mail_label_links" (
    "id" SERIAL NOT NULL,
    "label_id" INTEGER NOT NULL,
    "mail_id" INTEGER NOT NULL,

    CONSTRAINT "internal_mail_label_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_mail_label_links_label_id_mail_id_key" ON "internal_mail_label_links"("label_id", "mail_id");

-- AddForeignKey
ALTER TABLE "internal_mail_labels" ADD CONSTRAINT "internal_mail_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_label_links" ADD CONSTRAINT "internal_mail_label_links_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "internal_mail_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_mail_label_links" ADD CONSTRAINT "internal_mail_label_links_mail_id_fkey" FOREIGN KEY ("mail_id") REFERENCES "internal_mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
