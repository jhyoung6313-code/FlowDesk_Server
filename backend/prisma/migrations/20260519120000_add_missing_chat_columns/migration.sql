-- chat_rooms: description, is_archived 컬럼 추가
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_rooms' AND column_name = 'description') THEN
    ALTER TABLE "chat_rooms" ADD COLUMN "description" VARCHAR(500);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_rooms' AND column_name = 'is_archived') THEN
    ALTER TABLE "chat_rooms" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ChatRoomType enum에 public, private 값 추가
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'public' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ChatRoomType')) THEN
    ALTER TYPE "ChatRoomType" ADD VALUE 'public';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'private' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ChatRoomType')) THEN
    ALTER TYPE "ChatRoomType" ADD VALUE 'private';
  END IF;
END $$;

-- chat_room_members: is_favorite, is_muted, last_unread_at 컬럼 추가
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_room_members' AND column_name = 'is_favorite') THEN
    ALTER TABLE "chat_room_members" ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_room_members' AND column_name = 'is_muted') THEN
    ALTER TABLE "chat_room_members" ADD COLUMN "is_muted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_room_members' AND column_name = 'last_unread_at') THEN
    ALTER TABLE "chat_room_members" ADD COLUMN "last_unread_at" TIMESTAMP(3);
  END IF;
END $$;
