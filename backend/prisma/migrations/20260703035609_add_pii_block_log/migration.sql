-- CreateTable
CREATE TABLE "pii_block_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "username" VARCHAR(50),
    "pii_type" VARCHAR(30) NOT NULL,
    "field_path" VARCHAR(100),
    "masked" TEXT,
    "content_enc" TEXT,
    "endpoint" VARCHAR(120),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pii_block_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pii_block_logs_user_id_created_at_idx" ON "pii_block_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "pii_block_logs_pii_type_created_at_idx" ON "pii_block_logs"("pii_type", "created_at");

-- CreateIndex
CREATE INDEX "pii_block_logs_created_at_idx" ON "pii_block_logs"("created_at");

-- AddForeignKey
ALTER TABLE "pii_block_logs" ADD CONSTRAINT "pii_block_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
