-- 내 프로필 조직 정보(관리부서/직책/직급) 컬럼 추가
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" VARCHAR(100);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" VARCHAR(100);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_grade" VARCHAR(100);
