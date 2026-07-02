/**
 * 一次性修復腳本：之前的種子腳本把圖片網址寫成 http://localhost:3101/api/v2/cms/uploads/...
 * 這種絕對網址直接存進 Page/PageTemplate/Article 的 content JSON，訪客不是用 localhost 開站時
 * （手機連 LAN IP、tunnel 等）瀏覽器端會連不到，導致圖片整批顯示不出來。
 * 這裡把已經存在資料庫裡的絕對網址統一改成同源相對路徑 /api/v2/cms/uploads/...，
 * 之後讓 next.config.js 的 rewrites 轉發給 api 容器。
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ABSOLUTE_PREFIX_PATTERN = /https?:\/\/[^/"]+\/api\/v2\/cms\/uploads\//g;
const RELATIVE_REPLACEMENT = '/api/v2/cms/uploads/';

function fixContent(content: unknown): unknown {
  const text = JSON.stringify(content);
  const fixed = text.replace(ABSOLUTE_PREFIX_PATTERN, RELATIVE_REPLACEMENT);
  return fixed === text ? null : JSON.parse(fixed);
}

async function main() {
  const pages = await prisma.page.findMany();
  for (const page of pages) {
    const fixed = fixContent(page.content);
    if (fixed) {
      await prisma.page.update({ where: { id: page.id }, data: { content: fixed as Prisma.InputJsonValue } });
      console.log(`已修正頁面 /${page.slug}`);
    }
  }

  const templates = await prisma.pageTemplate.findMany();
  for (const template of templates) {
    const fixed = fixContent(template.content);
    if (fixed) {
      await prisma.pageTemplate.update({ where: { id: template.id }, data: { content: fixed as Prisma.InputJsonValue } });
      console.log(`已修正範本「${template.name}」`);
    }
  }

  const articles = await prisma.article.findMany();
  for (const article of articles) {
    const fixedContent = fixContent(article.content);
    const fixedCover = article.coverImageUrl?.replace(ABSOLUTE_PREFIX_PATTERN, RELATIVE_REPLACEMENT);
    if (fixedContent || (fixedCover && fixedCover !== article.coverImageUrl)) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          ...(fixedContent ? { content: fixedContent as Prisma.InputJsonValue } : {}),
          ...(fixedCover && fixedCover !== article.coverImageUrl ? { coverImageUrl: fixedCover } : {}),
        },
      });
      console.log(`已修正文章 /${article.slug}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
