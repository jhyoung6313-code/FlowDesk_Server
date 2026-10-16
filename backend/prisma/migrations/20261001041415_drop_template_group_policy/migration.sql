/*
  Warnings:

  - You are about to drop the column `group_policy_json` on the `approval_templates` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "approval_templates" DROP COLUMN "group_policy_json";
