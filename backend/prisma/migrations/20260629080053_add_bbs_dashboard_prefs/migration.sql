-- AlterTable
ALTER TABLE "bbs_categories" ADD COLUMN     "show_on_dashboard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_dashboard_bbs_categories" (
    "user_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_dashboard_bbs_categories_pkey" PRIMARY KEY ("user_id","category_id")
);

-- AddForeignKey
ALTER TABLE "user_dashboard_bbs_categories" ADD CONSTRAINT "user_dashboard_bbs_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dashboard_bbs_categories" ADD CONSTRAINT "user_dashboard_bbs_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "bbs_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
