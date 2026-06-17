-- Playbook SOP Engine 전면 교체 마이그레이션

-- 1. 기존 테이블 제거 (의존 순서대로)
DROP TABLE IF EXISTS "run_metrics" CASCADE;
DROP TABLE IF EXISTS "run_status_updates" CASCADE;
DROP TABLE IF EXISTS "run_checklists" CASCADE;
DROP TABLE IF EXISTS "run_timeline" CASCADE;
DROP TABLE IF EXISTS "run_participants" CASCADE;
DROP TABLE IF EXISTS "playbook_runs" CASCADE;
DROP TABLE IF EXISTS "playbooks" CASCADE;

-- 2. 기존 enum 제거
DROP TYPE IF EXISTS "RunTimelineEvent";
DROP TYPE IF EXISTS "RunParticipantRole";
DROP TYPE IF EXISTS "RunStatus";

-- 3. 새 enum 생성
CREATE TYPE "StepType" AS ENUM ('task', 'approval', 'note', 'decision');
CREATE TYPE "StepAssigneeMode" AS ENUM ('unassigned', 'specific', 'role');
CREATE TYPE "RunStatus" AS ENUM ('active', 'paused', 'finished', 'archived');
CREATE TYPE "RunSeverity" AS ENUM ('p1', 'p2', 'p3', 'none');
CREATE TYPE "RunStepStatus" AS ENUM ('pending', 'in_progress', 'done', 'skipped', 'blocked', 'rejected');
CREATE TYPE "RunParticipantRole" AS ENUM ('owner', 'coordinator', 'participant');
CREATE TYPE "RunUpdateType" AS ENUM ('note', 'alert');

-- 4. 새 테이블 생성

-- Playbook 템플릿
CREATE TABLE "playbooks" (
    "id"          SERIAL PRIMARY KEY,
    "name"        VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category"    VARCHAR(50) NOT NULL DEFAULT 'general',
    "tags"        VARCHAR(500),
    "version"     INTEGER NOT NULL DEFAULT 1,
    "is_public"   BOOLEAN NOT NULL DEFAULT true,
    "variables"   TEXT,
    "created_by"  INTEGER NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);

-- 페이즈 (단계 그룹)
CREATE TABLE "playbook_phases" (
    "id"          SERIAL PRIMARY KEY,
    "playbook_id" INTEGER NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "color"       VARCHAR(20) NOT NULL DEFAULT '#1677ff',
    "order"       INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "playbook_phases_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE
);

-- 스텝 템플릿
CREATE TABLE "playbook_steps" (
    "id"               SERIAL PRIMARY KEY,
    "playbook_id"      INTEGER NOT NULL,
    "phase_id"         INTEGER,
    "title"            VARCHAR(300) NOT NULL,
    "instructions"     TEXT,
    "type"             "StepType" NOT NULL DEFAULT 'task',
    "order"            INTEGER NOT NULL DEFAULT 0,
    "estimated_mins"   INTEGER,
    "sla_mins"         INTEGER,
    "assignee_mode"    "StepAssigneeMode" NOT NULL DEFAULT 'unassigned',
    "assignee_user_id" INTEGER,
    "assignee_role"    "Role",
    "require_evidence" BOOLEAN NOT NULL DEFAULT false,
    "depends_on"       VARCHAR(500),
    "decision_options" TEXT,
    CONSTRAINT "playbook_steps_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE,
    CONSTRAINT "playbook_steps_phase_id_fkey"    FOREIGN KEY ("phase_id")    REFERENCES "playbook_phases"("id") ON DELETE SET NULL,
    CONSTRAINT "playbook_steps_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Run 인스턴스
CREATE TABLE "playbook_runs" (
    "id"               SERIAL PRIMARY KEY,
    "playbook_id"      INTEGER,
    "name"             VARCHAR(200) NOT NULL,
    "status"           "RunStatus" NOT NULL DEFAULT 'active',
    "severity"         "RunSeverity" NOT NULL DEFAULT 'none',
    "variable_values"  TEXT,
    "summary"          TEXT,
    "owner_id"         INTEGER NOT NULL,
    "created_by"       INTEGER NOT NULL,
    "due_at"           TIMESTAMP(3),
    "started_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at"         TIMESTAMP(3),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbook_runs_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE SET NULL,
    CONSTRAINT "playbook_runs_owner_id_fkey"    FOREIGN KEY ("owner_id")    REFERENCES "users"("id"),
    CONSTRAINT "playbook_runs_created_by_fkey"  FOREIGN KEY ("created_by")  REFERENCES "users"("id")
);

-- Run 스텝 인스턴스
CREATE TABLE "run_steps" (
    "id"               SERIAL PRIMARY KEY,
    "run_id"           INTEGER NOT NULL,
    "step_id"          INTEGER,
    "phase_id"         INTEGER,
    "title"            VARCHAR(300) NOT NULL,
    "instructions"     TEXT,
    "type"             "StepType" NOT NULL DEFAULT 'task',
    "order"            INTEGER NOT NULL DEFAULT 0,
    "status"           "RunStepStatus" NOT NULL DEFAULT 'pending',
    "assignee_id"      INTEGER,
    "due_at"           TIMESTAMP(3),
    "sla_mins"         INTEGER,
    "require_evidence" BOOLEAN NOT NULL DEFAULT false,
    "evidence"         TEXT,
    "started_at"       TIMESTAMP(3),
    "completed_at"     TIMESTAMP(3),
    "completed_by"     INTEGER,
    "decision_chosen"  VARCHAR(200),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_steps_run_id_fkey"       FOREIGN KEY ("run_id")       REFERENCES "playbook_runs"("id") ON DELETE CASCADE,
    CONSTRAINT "run_steps_step_id_fkey"      FOREIGN KEY ("step_id")      REFERENCES "playbook_steps"("id") ON DELETE SET NULL,
    CONSTRAINT "run_steps_assignee_id_fkey"  FOREIGN KEY ("assignee_id")  REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "run_steps_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Run 참여자
CREATE TABLE "run_participants" (
    "id"        SERIAL PRIMARY KEY,
    "run_id"    INTEGER NOT NULL,
    "user_id"   INTEGER NOT NULL,
    "role"      "RunParticipantRole" NOT NULL DEFAULT 'participant',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_participants_run_id_fkey"  FOREIGN KEY ("run_id")  REFERENCES "playbook_runs"("id") ON DELETE CASCADE,
    CONSTRAINT "run_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "run_participants_run_id_user_id_key" UNIQUE ("run_id", "user_id")
);

-- Run 업데이트 (댓글/알림)
CREATE TABLE "run_updates" (
    "id"         SERIAL PRIMARY KEY,
    "run_id"     INTEGER NOT NULL,
    "message"    TEXT NOT NULL,
    "type"       "RunUpdateType" NOT NULL DEFAULT 'note',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_updates_run_id_fkey"     FOREIGN KEY ("run_id")     REFERENCES "playbook_runs"("id") ON DELETE CASCADE,
    CONSTRAINT "run_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);

-- Run 타임라인 (감사 로그)
CREATE TABLE "run_timeline" (
    "id"         SERIAL PRIMARY KEY,
    "run_id"     INTEGER NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "run_timeline_run_id_fkey"     FOREIGN KEY ("run_id")     REFERENCES "playbook_runs"("id") ON DELETE CASCADE,
    CONSTRAINT "run_timeline_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 5. updated_at 자동 갱신 트리거 (playbook_runs, run_steps)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_playbooks_updated_at
    BEFORE UPDATE ON "playbooks"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playbook_runs_updated_at
    BEFORE UPDATE ON "playbook_runs"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_run_steps_updated_at
    BEFORE UPDATE ON "run_steps"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
