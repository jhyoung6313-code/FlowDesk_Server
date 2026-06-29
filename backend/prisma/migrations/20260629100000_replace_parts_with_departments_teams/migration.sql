-- 조직 구조 개편: 기존 '파트(parts)'를 '부서(departments) > 팀(teams)' 구조로 전환한다.
-- 기존 parts 데이터/태스크 연결을 보존하기 위해 테이블을 rename 한다.

-- 1) 부서 테이블 생성
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- 2) 기존 파트 이전을 위한 기본 부서
INSERT INTO "departments" ("name", "description", "order") VALUES ('미지정', '기존 파트 이전용 기본 부서', 0);

-- 3) parts -> teams 로 rename (id/FK 보존)
ALTER TABLE "parts" RENAME TO "teams";
ALTER TABLE "teams" RENAME CONSTRAINT "parts_pkey" TO "teams_pkey";
DROP INDEX IF EXISTS "parts_name_key";

-- 4) 팀에 부서/정렬 컬럼 추가 후 기본 부서로 배정
ALTER TABLE "teams" ADD COLUMN "department_id" INTEGER;
ALTER TABLE "teams" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
UPDATE "teams" SET "department_id" = (SELECT "id" FROM "departments" WHERE "name" = '미지정' LIMIT 1);
ALTER TABLE "teams" ALTER COLUMN "department_id" SET NOT NULL;
CREATE UNIQUE INDEX "teams_department_id_name_key" ON "teams"("department_id", "name");
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) 사용자: 자유입력 department 제거, 부서/팀 FK 추가
ALTER TABLE "users" DROP COLUMN "department";
ALTER TABLE "users" ADD COLUMN "department_id" INTEGER;
ALTER TABLE "users" ADD COLUMN "team_id" INTEGER;
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
