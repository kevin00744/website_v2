/**
 * 一次性腳本：把 Version 1（cms/tsanyen.com）剩下的 4 個頁面（about/face/hair/tech）
 * 真實文字內容移植成 website_v2 的 Page。文字直接從對應的 .html 擷取，圖片已經先手動
 * 從 wp-content/uploads 複製進 apps/api/storage/cms/uploads/。
 *
 * 跟首頁（seed-version1-homepage-template.ts）不同的地方：這裡直接建立/更新 Page，
 * 不另外存一份 PageTemplate——這 4 頁是一次性的既有頁面搬遷，不是「之後可能重複套用」的版型。
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_PUBLIC_BASE_URL = 'http://localhost:3101/api/v2';
const uploadUrl = (fileName: string) => `${API_PUBLIC_BASE_URL}/cms/uploads/${fileName}`;

const LOGO_URL = uploadUrl('376122fa-2aab-4004-a33c-340efcfcf442.png');
const ABOUT_IMAGE_URL = uploadUrl('152422eb-5240-4c34-b4ed-020cd8a05c48.png');
const FACE_IMAGE_URL = uploadUrl('6f94cfab-7a78-400a-bea7-be3e1ed4bbb1.png');
const HAIR_IMAGE_URL = uploadUrl('c1813d87-ca39-446e-a82e-a7e7e71c0694.png');
const TECH_IMAGE_URL = uploadUrl('de467ffd-a884-4ff2-b502-3d65ebdd2803.png');

function blockId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

interface PageSeed {
  slug: string;
  title: string;
  metaDescription: string;
  content: { root: Record<string, never>; content: Array<{ type: string; props: Record<string, unknown> }> };
}

const pages: PageSeed[] = [
  {
    slug: 'about',
    title: '關於我們 | 璨妍 tsanyen',
    metaDescription: '璨妍 (CANYAN) 的誕生，源於一個純粹而堅定的信念：真正的美麗，不該只是表層的修飾，而是來自深層的覺醒。',
    content: {
      root: {},
      content: [
        { type: 'Image', props: { id: blockId('logo'), imageUrl: LOGO_URL, alt: '璨妍 tsanyen 標誌', imageFit: 'contain' } },
        {
          type: 'Hero',
          props: {
            id: blockId('hero'),
            title: '關於我們',
            subtitle: '源起 ─ 解鎖青春的科學之鑰',
            imageUrl: ABOUT_IMAGE_URL,
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('origin'),
            text:
              '璨妍 (CANYAN) 的誕生，源於一個純粹而堅定的信念：真正的美麗，不該只是表層的修飾，而是來自深層的覺醒。\n\n' +
              '面對歲月與環境的無聲侵襲，傳統保養往往難以突破吸收的瓶頸。我們深信，科學是解開這道難題的唯一解答。\n\n' +
              '因此，璨妍團隊致力於探索再生科學領域中最具突破性的「奈米級賦活科技」。\n\n' +
              '我們將過去僅存在於專業實驗室的頂尖技術，完美轉化為您日常生活中極致奢華的保養儀式。\n\n' +
              '璨妍不盲從流行，只專注於深層的喚活對話，為您的每一吋肌膚與髮絲，帶來無創且真實的重生體驗。',
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('philosophy'),
            text:
              '核心理念｜淬鍊極致，回歸本質\n\n' +
              '我們不僅追求極致的效果，更在乎您每一次使用的安心與純粹。璨妍以三大核心理念，構築無可妥協的保養標準：\n\n' +
              '淬鍊極致，回歸本質：我們深知肌膚與頭皮的脆弱，因此嚴選極高純度的高活性修護因子，屏除一切不必要的化學負擔與多餘添加。\n\n' +
              '深入根源，無損傳導：透過 30-150nm 極小奈米級的微囊特性，璨妍的活性因子能輕易突破吸收屏障，直接鎖定受損與老化的根源部位。\n\n' +
              '科學見證，真實改變：璨妍拒絕虛幻的承諾。我們的每一項功效，皆建立在嚴謹的科學數據與反覆的測試之上。',
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('quality'),
            text:
              '品質承諾 ─ 國際級的安心把關\n\n' +
              '在追求極致修護的同時，您的安全始終是璨妍的首要考量。\n\n' +
              '我們的全系列原液皆採用最高規格的嚴密環境生產，並通過 SGS 等國際級第三方公正機構的嚴格檢驗，確保無重金屬、無有害微生物殘留。\n\n' +
              '無論是針對敏弱肌膚的深層撫紋，或是脆弱頭皮的活化強健，璨妍都能提供最溫和的頂級呵護。我們對品質的極致苛求，只為讓您在每一次的煥新旅程中，都能從容、自信且安心。',
          },
        },
        {
          type: 'ContactForm',
          props: {
            id: blockId('contact'),
            title: '深入了解璨妍的修護奇蹟',
            subtitle: '想知道更多關於璨妍的故事與科學實證，歡迎與我們聯繫',
            submitButtonText: '立即諮詢',
          },
        },
      ],
    },
  },
  {
    slug: 'face',
    title: '璨妍美容原液 | 璨妍 tsanyen',
    metaDescription: '璨妍美容原液滿載高純度的「奈米級賦活因子」，能輕易穿透吸收屏障，將強大的修護訊號直送受損根源，精準對抗老化痕跡。',
    content: {
      root: {},
      content: [
        { type: 'Image', props: { id: blockId('logo'), imageUrl: LOGO_URL, alt: '璨妍 tsanyen 標誌', imageFit: 'contain' } },
        {
          type: 'Hero',
          props: {
            id: blockId('hero'),
            title: '璨妍美容原液',
            subtitle: '喚醒生機，從根源豐盈強韌',
            imageUrl: FACE_IMAGE_URL,
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('intro'),
            text:
              '突破停滯期，解鎖青春密碼\n\n' +
              '當日常保養再也無法帶來改變，您需要的是直達肌底的煥活能量。\n\n' +
              '璨妍美容原液滿載高純度的「奈米級賦活因子」，能輕易穿透吸收屏障，將強大的修護訊號直送受損根源，精準對抗老化痕跡。\n\n' +
              '澎潤緊緻 (Firm & Plump)：實驗室實測證實，高活性微囊能深度活化肌底，帶來高達 250% 至 1320% 的關鍵彈力指標提升，精準撫平細紋，重塑立體輪廓。\n\n' +
              '深層煥亮 (Deep Radiance)：改善暗沉與膚色不均，將豐沛的水分與修護能量鎖在底層，由內而外散發澄淨透亮的無瑕光澤。\n\n' +
              '屏障強健 (Barrier Repair)：為敏弱與受損肌膚重建健康防護網，舒緩乾燥泛紅，恢復肌膚的穩定與強韌。',
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('evidence'),
            text:
              '卓越的修復力與視覺對比實證\n\n' +
              '實驗證實 BP-Exo™ 能顯著下調酪氨酸酶活性（阻斷黑色素）。在臨床應用上，針對術後受損與長期暗沉，展現出強大的修復與煥白能力：\n\n' +
              '術後修復：顯著縮短紅腫期，快速重建屏障功能。\n' +
              '煥白淡斑：有效減少黑色素沉澱，提升肌膚淨度。',
          },
        },
        {
          type: 'ContactForm',
          props: {
            id: blockId('contact'),
            title: '專屬您的肌膚煥新儀式',
            subtitle: '渴望突破保養停滯期、在意細紋與鬆弛、肌膚暗沉無光，或極需深層修護的追求極致者',
            submitButtonText: '立即諮詢',
          },
        },
      ],
    },
  },
  {
    slug: 'hair',
    title: '璨妍護髮原液 | 璨妍 tsanyen',
    metaDescription: '璨妍護髮原液蘊含極高濃度的「奈米級賦活因子」，能精準穿透頭皮屏障，直達毛囊深處，為疲憊的髮根注入源源不絕的青春能量。',
    content: {
      root: {},
      content: [
        { type: 'Image', props: { id: blockId('logo'), imageUrl: LOGO_URL, alt: '璨妍 tsanyen 標誌', imageFit: 'contain' } },
        {
          type: 'Hero',
          props: {
            id: blockId('hero'),
            title: '璨妍護髮原液',
            subtitle: '喚醒生機，從根源豐盈強韌',
            imageUrl: HAIR_IMAGE_URL,
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('intro'),
            text:
              '深入核心，逆轉脆弱危機\n\n' +
              '健康的秀髮，源自於充滿活力的頭皮環境。\n\n' +
              '璨妍護髮原液蘊含極高濃度的「奈米級賦活因子」，能精準穿透頭皮屏障，直達毛囊深處，為疲憊的髮根注入源源不絕的青春能量。\n\n' +
              '活化基底 (Revitalize)：優化頭皮微環境，喚醒沉睡的髮根活力，延長髮絲的健康豐盈期。\n\n' +
              '強韌防護 (Strengthen)：深層修護脆弱髮絲，大幅降低日常梳理時的斷裂與掉落，重現強健韌性。\n\n' +
              '濃縮滋養 (Nourish)：輕盈好吸收的純淨原液質地，深層滋養不黏膩，賦予髮根清爽的蓬鬆感。',
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('evidence'),
            text:
              'SGS 臨床實證：60 天看見改變\n\n' +
              '數據證明，使用 8 週後脫髮改善率達 46.5%。透過顯微觀測，毛囊密度與髮絲強韌度均有顯著提升。\n\n' +
              '使用步驟：\n' +
              '清潔：每日洗髮後，將頭皮與髮絲多餘水分擦乾。\n' +
              '滴注：取適量護髮原液，精準滴於頭皮需加強保養之處（如髮際線或頂部）。\n' +
              '喚活：以指腹輕柔畫圈按摩頭皮，幫助修護微囊深層吸收，無須沖洗，隨後吹乾髮絲即可。',
          },
        },
        {
          type: 'ContactForm',
          props: {
            id: blockId('contact'),
            title: '專屬您的頭皮煥新儀式',
            subtitle: '適合髮絲細軟脆弱、髮量視覺稀疏、在意頭皮老化，或渴望擁有豐盈蓬鬆感的使用者',
            submitButtonText: '立即諮詢',
          },
        },
      ],
    },
  },
  {
    slug: 'tech',
    title: '核心技術 | 璨妍 tsanyen',
    metaDescription: '璨妍引以為傲的核心技術，是一種源於尖端生物科技的「奈米級高活性修護微囊」，能輕易穿透肌膚與頭皮的表層屏障。',
    content: {
      root: {},
      content: [
        { type: 'Image', props: { id: blockId('logo'), imageUrl: LOGO_URL, alt: '璨妍 tsanyen 標誌', imageFit: 'contain' } },
        {
          type: 'Hero',
          props: {
            id: blockId('hero'),
            title: '核心技術',
            subtitle: '揭密核心 ─ 奈米級的「青春信使」',
            imageUrl: TECH_IMAGE_URL,
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('intro'),
            text:
              '保養的成效，取決於肌膚與頭皮的吸收深度。\n\n' +
              '璨妍引以為傲的核心技術，是一種源於尖端生物科技的「奈米級高活性修護微囊」。這些微囊的尺寸僅有 30 至 150 奈米（nm），約為一般細胞的數百分之一。\n\n' +
              '憑藉著極微小的體積與絕佳的親膚性，這些微囊能輕易穿透肌膚與頭皮的表層屏障，宛如精準的「青春信使」，將關鍵的修護訊號與豐沛營養，直接傳遞至受損的老化根源，從底層喚醒原生修護力。',
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('edge'),
            text:
              '璨妍的技術優勢\n\n' +
              '亮點 1：極致純度，蘊含高濃度賦活因子\n' +
              '透過極嚴苛的實驗室多重純化技術，我們成功萃取出純淨無雜質的修護微囊，並在其中完整保留了高濃度的關鍵賦活因子。\n\n' +
              '亮點 2：常溫封存科技，滴滴皆是活性巔峰\n' +
              '璨妍突破技術壁壘，採用獨家「常溫穩定封存技術」，確保微囊中的修護能量在常溫下依然維持最高活性。',
          },
        },
        {
          type: 'RichText',
          props: {
            id: blockId('validation'),
            text:
              '實驗室實測見證\n\n' +
              '數據亮點 A：肌膚煥新\n' +
              '實驗室數據證實，高活性微囊能有效深入肌底作用。實測指標顯示，關鍵的「膠原」與「彈力」相關指標能達到 250% 至最高 1320% 的顯著提升力。\n\n' +
              '數據亮點 B：髮根賦活\n' +
              '針對脆弱髮根與頭皮環境進行的 60 天追蹤實測顯示，修護微囊能幫助延緩毛囊的休止期，使髮根更穩固。',
          },
        },
        {
          type: 'ContactForm',
          props: {
            id: blockId('contact'),
            title: '感受奈米級的修護奇蹟',
            subtitle: '尋找適合您的專屬原液',
            submitButtonText: '立即諮詢',
          },
        },
      ],
    },
  },
];

async function main() {
  for (const page of pages) {
    const existing = await prisma.page.findUnique({ where: { slug: page.slug } });
    if (existing) {
      await prisma.page.update({
        where: { slug: page.slug },
        data: { title: page.title, metaDescription: page.metaDescription, content: page.content as Prisma.InputJsonValue, isPublished: true },
      });
      console.log(`已更新既有頁面 /${page.slug}`);
    } else {
      await prisma.page.create({
        data: {
          slug: page.slug,
          title: page.title,
          metaDescription: page.metaDescription,
          content: page.content as Prisma.InputJsonValue,
          isPublished: true,
        },
      });
      console.log(`已建立頁面 /${page.slug}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
