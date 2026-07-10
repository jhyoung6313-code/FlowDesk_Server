-- CreateTable
CREATE TABLE "okr_cycles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "okr_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" SERIAL NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'team',
    "scope_ref_id" INTEGER,
    "owner_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'on_track',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "del_yn" CHAR(1) NOT NULL DEFAULT '0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_results" (
    "id" SERIAL NOT NULL,
    "objective_id" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "metric_type" VARCHAR(20) NOT NULL DEFAULT 'percent',
    "start_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "target_value" DECIMAL(14,2) NOT NULL DEFAULT 100,
    "current_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "auto_progress" BOOLEAN NOT NULL DEFAULT false,
    "owner_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_result_links" (
    "id" SERIAL NOT NULL,
    "key_result_id" INTEGER NOT NULL,
    "ref_type" VARCHAR(20) NOT NULL,
    "ref_id" INTEGER NOT NULL,

    CONSTRAINT "key_result_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_result_checkins" (
    "id" SERIAL NOT NULL,
    "key_result_id" INTEGER NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "confidence" INTEGER,
    "comment" VARCHAR(500),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_result_checkins_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "okr_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_result_links" ADD CONSTRAINT "key_result_links_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "key_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_result_checkins" ADD CONSTRAINT "key_result_checkins_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "key_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_result_checkins" ADD CONSTRAINT "key_result_checkins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
