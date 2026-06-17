-- 플레이북 기본 참여자(JSON 배열의 user id) 저장 컬럼 추가
ALTER TABLE "playbooks" ADD COLUMN "default_participants" TEXT;
