-- CreateTable
CREATE TABLE "wbs_task_dependencies" (
    "id" SERIAL NOT NULL,
    "predecessor_id" INTEGER NOT NULL,
    "successor_id" INTEGER NOT NULL,

    CONSTRAINT "wbs_task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wbs_task_dependencies_predecessor_id_successor_id_key" ON "wbs_task_dependencies"("predecessor_id", "successor_id");

-- AddForeignKey
ALTER TABLE "wbs_task_dependencies" ADD CONSTRAINT "wbs_task_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "wbs_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_task_dependencies" ADD CONSTRAINT "wbs_task_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "wbs_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
