-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'sla_warning';
ALTER TYPE "NotificationType" ADD VALUE 'sla_breach';
ALTER TYPE "NotificationType" ADD VALUE 'step_assigned';
ALTER TYPE "NotificationType" ADD VALUE 'step_reminder';

-- DropForeignKey
ALTER TABLE "playbook_phases" DROP CONSTRAINT "playbook_phases_playbook_id_fkey";

-- DropForeignKey
ALTER TABLE "playbook_runs" DROP CONSTRAINT "playbook_runs_created_by_fkey";

-- DropForeignKey
ALTER TABLE "playbook_runs" DROP CONSTRAINT "playbook_runs_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "playbook_runs" DROP CONSTRAINT "playbook_runs_playbook_id_fkey";

-- DropForeignKey
ALTER TABLE "playbook_steps" DROP CONSTRAINT "playbook_steps_assignee_user_id_fkey";

-- DropForeignKey
ALTER TABLE "playbook_steps" DROP CONSTRAINT "playbook_steps_phase_id_fkey";

-- DropForeignKey
ALTER TABLE "playbook_steps" DROP CONSTRAINT "playbook_steps_playbook_id_fkey";

-- DropForeignKey
ALTER TABLE "playbooks" DROP CONSTRAINT "playbooks_created_by_fkey";

-- DropForeignKey
ALTER TABLE "run_participants" DROP CONSTRAINT "run_participants_run_id_fkey";

-- DropForeignKey
ALTER TABLE "run_participants" DROP CONSTRAINT "run_participants_user_id_fkey";

-- DropForeignKey
ALTER TABLE "run_steps" DROP CONSTRAINT "run_steps_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "run_steps" DROP CONSTRAINT "run_steps_completed_by_fkey";

-- DropForeignKey
ALTER TABLE "run_steps" DROP CONSTRAINT "run_steps_run_id_fkey";

-- DropForeignKey
ALTER TABLE "run_steps" DROP CONSTRAINT "run_steps_step_id_fkey";

-- DropForeignKey
ALTER TABLE "run_timeline" DROP CONSTRAINT "run_timeline_created_by_fkey";

-- DropForeignKey
ALTER TABLE "run_timeline" DROP CONSTRAINT "run_timeline_run_id_fkey";

-- DropForeignKey
ALTER TABLE "run_updates" DROP CONSTRAINT "run_updates_created_by_fkey";

-- DropForeignKey
ALTER TABLE "run_updates" DROP CONSTRAINT "run_updates_run_id_fkey";

-- AlterTable
ALTER TABLE "board_cards" ADD COLUMN     "card_number" INTEGER,
ADD COLUMN     "cover_image_url" VARCHAR(500),
ADD COLUMN     "due_date" DATE,
ADD COLUMN     "linked_task_id" INTEGER,
ADD COLUMN     "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "start_date" DATE,
ADD COLUMN     "status" VARCHAR(50) NOT NULL DEFAULT 'todo';

-- AlterTable
ALTER TABLE "board_members" ADD COLUMN     "is_favorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "bg_color" VARCHAR(30),
ADD COLUMN     "linked_room_id" INTEGER,
ADD COLUMN     "swimlane_group_by_prop_id" INTEGER,
ADD COLUMN     "wip_limits_json" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "message" VARCHAR(500),
ADD COLUMN     "run_id" INTEGER,
ADD COLUMN     "run_step_id" INTEGER,
ALTER COLUMN "task_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "playbook_runs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "playbook_steps" ADD COLUMN     "parallel_group" INTEGER;

-- AlterTable
ALTER TABLE "playbooks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "run_steps" ADD COLUMN     "parallel_group" INTEGER,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "board_card_assignees" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'assignee',

    CONSTRAINT "board_card_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_card_links" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "title" VARCHAR(200),
    "url" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_card_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_card_comments" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_card_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_card_attachments" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "comment_id" INTEGER,
    "uploaded_by" INTEGER NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_card_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_card_checklists" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_card_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_card_dependencies" (
    "id" SERIAL NOT NULL,
    "dependent_id" INTEGER NOT NULL,
    "blocking_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_card_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_automations" (
    "id" SERIAL NOT NULL,
    "board_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger" VARCHAR(50) NOT NULL,
    "trigger_config" TEXT,
    "action" VARCHAR(50) NOT NULL,
    "action_config" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_step_checklists" (
    "id" SERIAL NOT NULL,
    "run_step_id" INTEGER NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_step_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbook_versions" (
    "id" SERIAL NOT NULL,
    "playbook_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playbook_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbook_webhooks" (
    "id" SERIAL NOT NULL,
    "playbook_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playbook_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbook_schedules" (
    "id" SERIAL NOT NULL,
    "playbook_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "recurrence_type" "RecurrenceType" NOT NULL,
    "recurrence_day" INTEGER,
    "recurrence_time" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "variable_values" TEXT,
    "participant_ids" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playbook_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_card_assignees_card_id_user_id_type_key" ON "board_card_assignees"("card_id", "user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "board_card_dependencies_dependent_id_blocking_id_key" ON "board_card_dependencies"("dependent_id", "blocking_id");

-- CreateIndex
CREATE UNIQUE INDEX "playbook_webhooks_token_key" ON "playbook_webhooks"("token");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "playbook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_run_step_id_fkey" FOREIGN KEY ("run_step_id") REFERENCES "run_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_cards" ADD CONSTRAINT "board_cards_linked_task_id_fkey" FOREIGN KEY ("linked_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_assignees" ADD CONSTRAINT "board_card_assignees_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_assignees" ADD CONSTRAINT "board_card_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_links" ADD CONSTRAINT "board_card_links_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_comments" ADD CONSTRAINT "board_card_comments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_comments" ADD CONSTRAINT "board_card_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_attachments" ADD CONSTRAINT "board_card_attachments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_attachments" ADD CONSTRAINT "board_card_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "board_card_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_attachments" ADD CONSTRAINT "board_card_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_checklists" ADD CONSTRAINT "board_card_checklists_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_dependencies" ADD CONSTRAINT "board_card_dependencies_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_card_dependencies" ADD CONSTRAINT "board_card_dependencies_blocking_id_fkey" FOREIGN KEY ("blocking_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_automations" ADD CONSTRAINT "board_automations_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_phases" ADD CONSTRAINT "playbook_phases_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_steps" ADD CONSTRAINT "playbook_steps_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_steps" ADD CONSTRAINT "playbook_steps_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "playbook_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_steps" ADD CONSTRAINT "playbook_steps_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "playbook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "playbook_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_participants" ADD CONSTRAINT "run_participants_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "playbook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_participants" ADD CONSTRAINT "run_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_updates" ADD CONSTRAINT "run_updates_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "playbook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_updates" ADD CONSTRAINT "run_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_timeline" ADD CONSTRAINT "run_timeline_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "playbook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_timeline" ADD CONSTRAINT "run_timeline_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_step_checklists" ADD CONSTRAINT "run_step_checklists_run_step_id_fkey" FOREIGN KEY ("run_step_id") REFERENCES "run_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_versions" ADD CONSTRAINT "playbook_versions_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_versions" ADD CONSTRAINT "playbook_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_webhooks" ADD CONSTRAINT "playbook_webhooks_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_schedules" ADD CONSTRAINT "playbook_schedules_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_schedules" ADD CONSTRAINT "playbook_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

