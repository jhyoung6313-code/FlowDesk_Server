-- Fix 1: wbs_projects.created_by → users(id) FK 추가
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wbs_projects_created_by_fkey'
  ) THEN
    ALTER TABLE "wbs_projects"
      ADD CONSTRAINT "wbs_projects_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Fix 2: wbs_issues.created_by → users(id) FK 추가
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wbs_issues_created_by_fkey'
  ) THEN
    ALTER TABLE "wbs_issues"
      ADD CONSTRAINT "wbs_issues_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Fix 3: chat_messages 누락 컬럼 추가 + 자기참조 FK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'parent_id') THEN
    ALTER TABLE "chat_messages" ADD COLUMN "parent_id" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'is_deleted') THEN
    ALTER TABLE "chat_messages" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'edited_at') THEN
    ALTER TABLE "chat_messages" ADD COLUMN "edited_at" TIMESTAMP(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'forwarded_from_id') THEN
    ALTER TABLE "chat_messages" ADD COLUMN "forwarded_from_id" INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_parent_id_fkey') THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_forwarded_from_id_fkey') THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_forwarded_from_id_fkey"
      FOREIGN KEY ("forwarded_from_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Fix 4: chat_message_reactions 테이블 생성
CREATE TABLE IF NOT EXISTS "chat_message_reactions" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "emoji" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_message_reactions_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_message_reactions_message_id_fkey') THEN
    ALTER TABLE "chat_message_reactions"
      ADD CONSTRAINT "chat_message_reactions_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_message_reactions_user_id_fkey') THEN
    ALTER TABLE "chat_message_reactions"
      ADD CONSTRAINT "chat_message_reactions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chat_message_reactions_message_id_user_id_emoji_key') THEN
    CREATE UNIQUE INDEX "chat_message_reactions_message_id_user_id_emoji_key"
      ON "chat_message_reactions"("message_id", "user_id", "emoji");
  END IF;
END $$;

-- Fix 5: chat_saved_messages 테이블 생성
CREATE TABLE IF NOT EXISTS "chat_saved_messages" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message_id" INTEGER NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_saved_messages_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_saved_messages_message_id_fkey') THEN
    ALTER TABLE "chat_saved_messages"
      ADD CONSTRAINT "chat_saved_messages_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_saved_messages_user_id_fkey') THEN
    ALTER TABLE "chat_saved_messages"
      ADD CONSTRAINT "chat_saved_messages_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chat_saved_messages_user_id_message_id_key') THEN
    CREATE UNIQUE INDEX "chat_saved_messages_user_id_message_id_key"
      ON "chat_saved_messages"("user_id", "message_id");
  END IF;
END $$;

-- Fix 6: chat_pinned_messages 테이블 생성
CREATE TABLE IF NOT EXISTS "chat_pinned_messages" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "message_id" INTEGER NOT NULL,
    "pinned_by" INTEGER NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_pinned_messages_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_pinned_messages_room_id_fkey') THEN
    ALTER TABLE "chat_pinned_messages"
      ADD CONSTRAINT "chat_pinned_messages_room_id_fkey"
      FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_pinned_messages_message_id_fkey') THEN
    ALTER TABLE "chat_pinned_messages"
      ADD CONSTRAINT "chat_pinned_messages_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_pinned_messages_pinned_by_fkey') THEN
    ALTER TABLE "chat_pinned_messages"
      ADD CONSTRAINT "chat_pinned_messages_pinned_by_fkey"
      FOREIGN KEY ("pinned_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chat_pinned_messages_room_id_message_id_key') THEN
    CREATE UNIQUE INDEX "chat_pinned_messages_room_id_message_id_key"
      ON "chat_pinned_messages"("room_id", "message_id");
  END IF;
END $$;

-- Fix 7: run_steps.phase_id → playbook_phases(id) FK 추가
UPDATE "run_steps"
SET "phase_id" = NULL
WHERE "phase_id" IS NOT NULL
  AND "phase_id" NOT IN (SELECT "id" FROM "playbook_phases");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'run_steps_phase_id_fkey'
  ) THEN
    ALTER TABLE "run_steps"
      ADD CONSTRAINT "run_steps_phase_id_fkey"
      FOREIGN KEY ("phase_id") REFERENCES "playbook_phases"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
