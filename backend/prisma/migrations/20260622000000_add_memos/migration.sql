-- CreateTable
CREATE TABLE "memos" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200),
    "content" TEXT NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT 'yellow',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "pos_x" INTEGER NOT NULL DEFAULT 0,
    "pos_y" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memos_created_by_idx" ON "memos"("created_by");

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
