-- AlterTable
ALTER TABLE "bbs_posts" ADD COLUMN     "sensitivity" VARCHAR(20) NOT NULL DEFAULT 'public';

-- AlterTable
ALTER TABLE "wiki_docs" ADD COLUMN     "sensitivity" VARCHAR(20) NOT NULL DEFAULT 'public';
