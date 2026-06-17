-- AlterTable: PlaybookStep에 기한(due_at) 추가
ALTER TABLE "playbook_steps" ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP(3);
