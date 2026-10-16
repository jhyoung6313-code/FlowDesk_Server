-- CreateIndex
CREATE INDEX "chat_messages_room_id_created_at_idx" ON "chat_messages"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_parent_id_idx" ON "chat_messages"("parent_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_del_yn_created_at_idx" ON "notifications"("del_yn", "created_at");

-- CreateIndex
CREATE INDEX "tasks_del_yn_status_idx" ON "tasks"("del_yn", "status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_created_by_idx" ON "tasks"("created_by");
