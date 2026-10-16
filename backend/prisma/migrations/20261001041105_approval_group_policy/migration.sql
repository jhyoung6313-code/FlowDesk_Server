-- AlterTable
ALTER TABLE "approval_documents" ADD COLUMN     "group_policy_json" TEXT;

-- AlterTable
ALTER TABLE "approval_templates" ADD COLUMN     "group_policy_json" TEXT;
