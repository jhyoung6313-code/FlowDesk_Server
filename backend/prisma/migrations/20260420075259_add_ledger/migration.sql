-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('income', 'expense');

-- CreateTable
CREATE TABLE "ledger_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "type" "LedgerType" NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT '#1677ff',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" SERIAL NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "memo" VARCHAR(300),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ledger_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
