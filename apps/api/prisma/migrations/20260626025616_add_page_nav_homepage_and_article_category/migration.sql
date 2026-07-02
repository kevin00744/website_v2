-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "category_page_id" INTEGER;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "is_homepage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nav_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "show_in_nav" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_page_id_fkey" FOREIGN KEY ("category_page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
