-- CreateTable
CREATE TABLE "wiki_spaces" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(20),
    "color" VARCHAR(20),
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'public',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_docs" (
    "id" SERIAL NOT NULL,
    "space_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "title" VARCHAR(200) NOT NULL DEFAULT '제목 없음',
    "content" TEXT,
    "icon" VARCHAR(20),
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "del_yn" CHAR(1) NOT NULL DEFAULT '0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_doc_versions" (
    "id" SERIAL NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT,
    "edited_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_doc_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_doc_comments" (
    "id" SERIAL NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "del_yn" CHAR(1) NOT NULL DEFAULT '0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_doc_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "wiki_spaces" ADD CONSTRAINT "wiki_spaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_docs" ADD CONSTRAINT "wiki_docs_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "wiki_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_docs" ADD CONSTRAINT "wiki_docs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "wiki_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_docs" ADD CONSTRAINT "wiki_docs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_doc_versions" ADD CONSTRAINT "wiki_doc_versions_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "wiki_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_doc_comments" ADD CONSTRAINT "wiki_doc_comments_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "wiki_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_doc_comments" ADD CONSTRAINT "wiki_doc_comments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
