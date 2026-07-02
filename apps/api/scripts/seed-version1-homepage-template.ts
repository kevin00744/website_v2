/**
 * 一次性腳本：把 Version 1（cms/tsanyen.com，WordPress 靜態站）首頁的真實文字內容，
 * 移植成 website_v2 CMS 的一個可重複套用範本（PageTemplate）。
 * 圖片素材已經先手動從 cms/tsanyen.com/wp-content/uploads 複製進
 * apps/api/storage/cms/uploads/（沿用使用者上傳會走的同一個資料夾/URL 慣例），
 * 這裡只是把文字跟區塊結構組起來、寫進資料庫。
 *
 * 文字內容是直接從 cms/tsanyen.com/index.html 的 <h1>/<h2>/<h3>/<p> 標籤擷取出來的真實文案，
 * 不是憑空編造的佔位文字。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_PUBLIC_BASE_URL = 'http://localhost:3101/api/v2';
const LOGO_URL = `${API_PUBLIC_BASE_URL}/cms/uploads/376122fa-2aab-4004-a33c-340efcfcf442.png`;
const HERO_IMAGE_URL = `${API_PUBLIC_BASE_URL}/cms/uploads/41c8a4bd-f610-4a30-b909-cf7298499960.png`;
const FEATURE_IMAGE_1_URL = `${API_PUBLIC_BASE_URL}/cms/uploads/0a7602b4-2f81-49c4-a379-d4e589d72970.png`;
const FEATURE_IMAGE_2_URL = `${API_PUBLIC_BASE_URL}/cms/uploads/29c5876e-53fc-47b6-9218-4343cd65798e.png`;

function blockId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

const content = {
  root: {},
  content: [
    {
      type: 'Image',
      props: { id: blockId('logo'), imageUrl: LOGO_URL, alt: '璨妍 tsanyen 標誌', imageFit: 'contain' },
    },
    {
      type: 'Hero',
      props: {
        id: blockId('hero'),
        title: '璨妍 tsanyen',
        subtitle: '真正的美麗，源於深層的修護。將實驗室級別的尖端科學，轉化為日常的高端修護體驗。',
        imageUrl: HERO_IMAGE_URL,
      },
    },
    {
      type: 'RichText',
      props: {
        id: blockId('intro'),
        text:
          '專注細胞再生的美學先驅\n\n' +
          '我們深知現代人面對歲月與環境的考驗，亟需更精準、高效的保養解方。因此，璨妍致力於探索最尖端的修復科技，' +
          '將極具突破性的高活性、高純度賦活因子，轉化為您日常的頂級護膚與養髮儀式。\n\n' +
          '科學實證：實驗室級別研發，數據見證改變。\n' +
          '極致純淨：嚴選高純度外泌體，屏除多餘負擔。\n' +
          '精準修護：奈米級微小分子，直達受損根源。\n\n' +
          '結合 BP-Exo™ 靶向技術，針對現代人最在意的掉髮與老化問題提供極致修復。',
      },
    },
    {
      type: 'Image',
      props: { id: blockId('feature-1'), imageUrl: FEATURE_IMAGE_1_URL, alt: '璨妍護髮原液', imageFit: 'cover' },
    },
    {
      type: 'RichText',
      props: {
        id: blockId('hair'),
        text:
          '科技賦活，雙效煥新\n\n璨妍護髮原液\n' +
          '從頭皮環境深入毛囊核心，延長毛髮生長期，強健髮根基底，重塑豐盈強韌的健康秀髮。',
      },
    },
    {
      type: 'Image',
      props: { id: blockId('feature-2'), imageUrl: FEATURE_IMAGE_2_URL, alt: '璨妍美容原液', imageFit: 'cover' },
    },
    {
      type: 'RichText',
      props: {
        id: blockId('face'),
        text:
          '璨妍美容原液\n' +
          '突破保養停滯期，深入肌底活化纖維母細胞，精準撫平歲月痕跡，重現肌膚澎潤與緊緻光澤。\n\n' +
          '突破保養極限，外泌體再生科技的頂級淬鍊。',
      },
    },
    {
      type: 'RichText',
      props: {
        id: blockId('faq'),
        text:
          'FAQ 常見問題\n\n' +
          '璨妍採用高純度、高活性的技術，有別於傳統保養品僅作用於表皮，外泌體具備奈米級的極小分子，' +
          '能直達肌底與毛囊深處，傳遞精準的修護訊號，從根源解決老化與受損困擾。\n\n' +
          '為了確保每位顧客都能獲得最符合自身狀況的保養方案，璨妍採專人諮詢制。請透過網站下方的表單留下您的需求，' +
          '我們的專業顧問將盡快與您聯繫，提供專屬的購買與保養建議。\n\n' +
          '根據科學實測與使用者回饋，持續使用 30 至 60 天，即可顯著感受肌膚彈力提升與髮根強韌度的改善。' +
          '實際效果將依個人體質與保養習慣而有所不同。',
      },
    },
    {
      type: 'ContactForm',
      props: {
        id: blockId('contact'),
        title: '準備好迎接專屬於您的煥新之旅了嗎？',
        subtitle: '深入了解璨妍育髮與美容原液的臨床奇蹟，開啟科學實證的賦活之旅',
        submitButtonText: '立即諮詢',
      },
    },
  ],
};

async function main() {
  const existing = await prisma.pageTemplate.findFirst({ where: { name: '璨妍官網首頁（Version 1 移植）' } });
  if (existing) {
    await prisma.pageTemplate.update({ where: { id: existing.id }, data: { content } });
    console.log(`已更新既有範本（id=${existing.id}）`);
    return;
  }

  const template = await prisma.pageTemplate.create({
    data: {
      name: '璨妍官網首頁（Version 1 移植）',
      description: '從舊版 tsanyen.com 首頁移植過來的真實文案與圖片，建立新頁面時可以直接套用這個版型',
      content,
    },
  });
  console.log(`已建立範本（id=${template.id}）`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
