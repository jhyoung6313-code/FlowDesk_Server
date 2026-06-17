-- 보드 멤버별 마지막 읽음 시각 (보드 안읽음 카운트용)
ALTER TABLE "board_members" ADD COLUMN "last_read_at" TIMESTAMP(3);

-- Playbook/Run 활동 안읽음 추적 (사용자별 마지막 확인 시각)
CREATE TABLE "playbook_read_states" (
    "user_id" INTEGER NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playbook_read_states_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "playbook_read_states" ADD CONSTRAINT "playbook_read_states_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 데이터 백필: 지금 시점을 기준으로 잡아 과거 항목이 한꺼번에 안읽음으로 집계되지 않도록 함
UPDATE "board_members" SET "last_read_at" = CURRENT_TIMESTAMP;
INSERT INTO "playbook_read_states" ("user_id", "last_read_at")
    SELECT "id", CURRENT_TIMESTAMP FROM "users";
