-- 보드 배경색(bg_color)이 그라데이션 문자열(예: "linear-gradient(135deg,#e0f2fe,#bae6fd)", 39자)을
-- 담기에 VarChar(30)은 짧아 보드 생성이 실패하던 문제 수정. 100자로 확장.
-- ALTER ... TYPE 은 멱등(이미 VARCHAR(100)이면 no-op).
ALTER TABLE "boards" ALTER COLUMN "bg_color" TYPE VARCHAR(100);
