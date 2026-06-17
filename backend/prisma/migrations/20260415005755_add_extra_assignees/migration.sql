-- CreateTable
CREATE TABLE "task_extra_assignees" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "task_extra_assignees_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "task_extra_assignees" ADD CONSTRAINT "task_extra_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
