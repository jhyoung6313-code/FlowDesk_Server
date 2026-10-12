-- CreateTable
CREATE TABLE "approval_approver_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "member_ids" INTEGER[],
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_approver_groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "approval_approver_groups" ADD CONSTRAINT "approval_approver_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
