-- CreateTable
CREATE TABLE "forms" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "multi_response" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "del_yn" CHAR(1) NOT NULL DEFAULT '0',

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" SERIAL NOT NULL,
    "form_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" VARCHAR(20) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_responses" (
    "id" SERIAL NOT NULL,
    "form_id" INTEGER NOT NULL,
    "respondent_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_answers" (
    "id" SERIAL NOT NULL,
    "response_id" INTEGER NOT NULL,
    "field_id" INTEGER NOT NULL,
    "value" TEXT,

    CONSTRAINT "form_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forms_status_del_yn_idx" ON "forms"("status", "del_yn");

-- CreateIndex
CREATE INDEX "form_fields_form_id_order_idx" ON "form_fields"("form_id", "order");

-- CreateIndex
CREATE INDEX "form_responses_form_id_idx" ON "form_responses"("form_id");

-- CreateIndex
CREATE INDEX "form_answers_response_id_idx" ON "form_answers"("response_id");

-- CreateIndex
CREATE INDEX "form_answers_field_id_idx" ON "form_answers"("field_id");

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "form_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "form_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
