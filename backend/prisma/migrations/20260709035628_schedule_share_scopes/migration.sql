-- CreateTable
CREATE TABLE "schedule_event_share_scopes" (
    "event_id" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "ref_id" INTEGER NOT NULL,

    CONSTRAINT "schedule_event_share_scopes_pkey" PRIMARY KEY ("event_id","kind","ref_id")
);

-- CreateIndex
CREATE INDEX "schedule_event_share_scopes_kind_ref_id_idx" ON "schedule_event_share_scopes"("kind", "ref_id");

-- AddForeignKey
ALTER TABLE "schedule_event_share_scopes" ADD CONSTRAINT "schedule_event_share_scopes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "schedule_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
