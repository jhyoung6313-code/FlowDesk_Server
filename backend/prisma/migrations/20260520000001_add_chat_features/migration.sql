-- User: 커스텀 상태 필드 추가
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status_emoji') THEN
    ALTER TABLE "users" ADD COLUMN "status_emoji" VARCHAR(10);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status_text') THEN
    ALTER TABLE "users" ADD COLUMN "status_text" VARCHAR(100);
  END IF;
END $$;

-- ChatRoom: 공지 배너 필드 추가
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_rooms' AND column_name='announcement') THEN
    ALTER TABLE "chat_rooms" ADD COLUMN "announcement" VARCHAR(500);
  END IF;
END $$;

-- 예약 발송 테이블 생성
CREATE TABLE IF NOT EXISTS "scheduled_chat_messages" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_chat_messages_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='scheduled_chat_messages_room_id_fkey'
  ) THEN
    ALTER TABLE "scheduled_chat_messages"
      ADD CONSTRAINT "scheduled_chat_messages_room_id_fkey"
      FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='scheduled_chat_messages_sender_id_fkey'
  ) THEN
    ALTER TABLE "scheduled_chat_messages"
      ADD CONSTRAINT "scheduled_chat_messages_sender_id_fkey"
      FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
