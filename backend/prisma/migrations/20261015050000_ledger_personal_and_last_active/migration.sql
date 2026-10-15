-- 가계부 개인화: 예산(ledger_budgets)에 소유자(user_id) 추가. 기존 예산은 소유자를 알 수 없어 NOT NULL 추가가 실패하므로
-- 예산 행이 있는 환경에서는 사전에 백업 후 정리(또는 소유자 지정)가 필요하다. (개발 DB는 0건 확인 후 적용)

-- DropIndex
DROP INDEX "ledger_budgets_category_id_year_month_key";

-- AlterTable
ALTER TABLE "ledger_budgets" ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ledger_categories" ADD COLUMN     "user_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_active_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_budgets_user_id_category_id_year_month_key" ON "ledger_budgets"("user_id", "category_id", "year", "month");

-- CreateIndex
CREATE INDEX "ledger_categories_user_id_idx" ON "ledger_categories"("user_id");

-- AddForeignKey
ALTER TABLE "ledger_categories" ADD CONSTRAINT "ledger_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

