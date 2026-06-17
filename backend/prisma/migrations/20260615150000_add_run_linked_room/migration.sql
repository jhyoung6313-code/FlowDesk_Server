-- 런별 전용 채팅방 연결 (보드의 linked_room_id와 동일한 용도)
ALTER TABLE "playbook_runs" ADD COLUMN "linked_room_id" INTEGER;
