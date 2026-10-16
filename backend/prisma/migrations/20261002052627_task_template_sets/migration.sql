-- AlterTable
ALTER TABLE "task_templates" ADD COLUMN     "day_offset" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "set_id" INTEGER;

-- CreateTable
CREATE TABLE "task_template_sets" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_template_sets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "task_template_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_sets" ADD CONSTRAINT "task_template_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
