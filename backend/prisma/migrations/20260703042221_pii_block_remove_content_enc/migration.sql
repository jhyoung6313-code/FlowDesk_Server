/*
  Warnings:

  - You are about to drop the column `content_enc` on the `pii_block_logs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "pii_block_logs" DROP COLUMN "content_enc";
