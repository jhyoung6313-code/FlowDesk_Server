-- CreateEnum
CREATE TYPE "WbsIssueStatus" AS ENUM ('open', 'in_progress', 'closed', 'hold');

-- CreateTable
CREATE TABLE "wbs_projects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "description" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_project_members" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "member_name" VARCHAR(100) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wbs_project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_tasks" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "level" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" VARCHAR(200) NOT NULL,
    "deliverable" VARCHAR(200),
    "start_date" DATE,
    "end_date" DATE,
    "planned_progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "actual_progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_issues" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "category" VARCHAR(100),
    "content" TEXT NOT NULL,
    "occur_date" DATE,
    "target_date" DATE,
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "expected_date" DATE,
    "status" "WbsIssueStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_issues_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "wbs_project_members" ADD CONSTRAINT "wbs_project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "wbs_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_tasks" ADD CONSTRAINT "wbs_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "wbs_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_tasks" ADD CONSTRAINT "wbs_tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "wbs_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_issues" ADD CONSTRAINT "wbs_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "wbs_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
