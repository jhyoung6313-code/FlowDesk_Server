-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "recurring_id" INTEGER;

-- CreateTable
CREATE TABLE "ledger_budgets" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_recurrings" (
    "id" SERIAL NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "memo" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_recurrings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_budgets_category_id_year_month_key" ON "ledger_budgets"("category_id", "year", "month");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "ledger_recurrings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ledger_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_recurrings" ADD CONSTRAINT "ledger_recurrings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ledger_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_recurrings" ADD CONSTRAINT "ledger_recurrings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
