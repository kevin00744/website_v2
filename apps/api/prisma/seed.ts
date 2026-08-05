import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { DisclaimerSection } from '../src/customers/disclaimer-pdf.util';

const prisma = new PrismaClient();

/** 純開發用測試密碼，所有種子帳號共用，正式環境上線前務必要求每個人自己改密碼 */
const DEV_PASSWORD = 'Passw0rd!1';

const DISCLAIMER_SECTIONS: DisclaimerSection[] = [
  {
    heading: '一、產品性質與效果差異',
    paragraphs: [
      '1. 非醫療藥物：外泌體屬生物活性保養成分，非醫療用藥物，不具備治療疾病（如皺紋、鬆弛、色斑等）之醫療功效，僅屬美容保養範疇。',
      '2. 效果個別差異：療程效果因人個體質、膚況、年齡、荷爾蒙狀態及術後居家保養而異。',
      '店家對效果之承諾，以「客戶依囑咐完成完整療程且術後保養得當」為前提。',
      '若因客戶個人體質差異導致效果未達預期，店家及供應商不負退費或賠償責任。',
    ],
    requiresSignature: true,
  },
  {
    heading: '二、常見暫時性反應',
    paragraphs: [
      '施打後 1-7 天內出現以下反應屬正常現象，通常會自行消退，客戶不得據此要求退費或賠償：',
      '1. 施打部位微紅、輕微腫脹、癢感。',
      '2. 輕微瘀青（因個人凝血機能或施打深度所致）。',
      '3. 短暫脫皮、乾燥、細小顆粒感（代謝反應）。',
      '4. 暫時性敏感或發紅。',
    ],
    requiresSignature: true,
  },
  {
    heading: '三、禁忌症與健康聲明',
    paragraphs: [
      '客戶確認無以下禁忌症，若有隱匿病史導致後遺症，由客戶自負：',
      '1. 無懷孕、哺乳中女性。',
      '2. 無療程部位有開放性傷口、急性皮膚病、嚴重過敏史或牛皮癬。',
      '3. 無近期（半年內）曾接受過肉毒桿菌、填充劑、電波或音波拉皮者（需經醫師評估）。',
      '4. 無自身為凝血功能異常者，或正在服用抗凝血藥物、阿斯匹靈者。',
      '5. 無有過敏性體質或對蛋白、酵母等生物成分過敏者。',
      '6. 無七日內有做過侵入性的皮膚保養，不得導入外泌體。',
      '7. 無七日內有做過臉部手術者，不得導入外泌體。',
    ],
    requiresSignature: true,
  },
  {
    heading: '四、術前/術後注意事項',
    paragraphs: [
      '客戶同意嚴格遵守術前/術後保養規範：',
      '1. 施打前應徹底清潔部位，使用無侵入性導入外泌體後，建議 10-12 小時內避免洗臉、游泳、三溫暖、桑拿、激烈運動等易出汗或外物觸碰術位行為。',
      '2. 避免使用含酸類（A 酸、果酸、水楊酸）、酒精、香精或刺激性保養品。',
      '3. 加強保濕與防曬。',
      '免責事項：若因客戶未遵守上述事項導致感染、效果不佳、反黑或過敏，責任由客戶自負。',
    ],
    requiresSignature: true,
  },
  {
    heading: '五、設備與耗材免責',
    paragraphs: [
      '1. 機器因素：系爭導入機設備由供應商提供，若因機器自然故障導致服務中斷，店家應協助安排補時或更換，但不賠償間接損失（如誤工費）。',
      '2. 耗材責任：供應商保證所供產品於效期內且包裝完整。若開封後因保存不當（如高溫、陽光直射）導致變質，由客戶或店家自負。',
    ],
    requiresSignature: false,
  },
  {
    heading: '六、照片授權與隱私',
    paragraphs: [
      '客戶同意店家拍攝治療前後對比照，並授權店家於官網、FB、IG、宣傳單張等渠道使用，以作為廣告宣傳。客戶若欲隱藏面部特徵，店家得進行打馬賽克處理。',
    ],
    requiresSignature: false,
  },
  {
    heading: '七、其他免責',
    paragraphs: [
      '1. 因天災、停電、停水、網路中斷等不可抗力因素導致服務延誤或取消，店家不負違約責任。',
      '2. 客戶自行攜帶之保養品若與外泌體產生交互作用導致過敏，由店家協助處理，但供應商不負賠償責任。',
    ],
    requiresSignature: false,
  },
];

/**
 * 種一套涵蓋 RBAC 五種角色的測試帳號，密碼統一是 DEV_PASSWORD，方便直接拿去打
 * POST /api/v2/auth/login 測試各角色的權限邊界（dealer 只看得到自己區域、manager 只看得到自己店、
 * editor 完全進不去顧客模組）。正式上線前這份 seed 要重新檢視，不能照搬到生產環境。
 */
async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const store = await prisma.store.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: {
      code: 'DEFAULT',
      name: '預設門店',
      region: 'A',
      regionSequence: 1,
    },
  });

  const systemAdmin = await prisma.user.upsert({
    where: { email: 'system@website-v2.local' },
    update: { password: passwordHash },
    create: {
      username: 'system_admin',
      name: '系統管理員',
      email: 'system@website-v2.local',
      password: passwordHash,
      role: 'system_admin',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@website-v2.local' },
    update: { password: passwordHash },
    create: {
      username: 'admin',
      name: '管理員',
      email: 'admin@website-v2.local',
      password: passwordHash,
      role: 'admin',
    },
  });

  const dealer = await prisma.user.upsert({
    where: { email: 'dealer-north@website-v2.local' },
    update: { password: passwordHash },
    create: {
      username: 'dealer_north',
      name: '北部代理',
      email: 'dealer-north@website-v2.local',
      password: passwordHash,
      role: 'dealer',
      region: 'A',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager-default@website-v2.local' },
    update: { password: passwordHash },
    create: {
      username: 'manager_default',
      name: '預設門店店長',
      email: 'manager-default@website-v2.local',
      password: passwordHash,
      role: 'manager',
      storeId: store.id,
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: 'editor@website-v2.local' },
    update: { password: passwordHash },
    create: {
      username: 'editor',
      name: '網站編輯',
      email: 'editor@website-v2.local',
      password: passwordHash,
      role: 'editor',
    },
  });

  const template = await prisma.disclaimerTemplate.upsert({
    where: { version: 'v1' },
    update: { sections: DISCLAIMER_SECTIONS as object },
    create: {
      version: 'v1',
      title: '「璨妍生化外泌體 免責聲明書」',
      sections: DISCLAIMER_SECTIONS as object,
      isActive: true,
    },
  });

  console.log(`Seeded store #${store.id} (${store.code}), disclaimer template ${template.version}`);
  console.log(`Seeded users (password for all: ${DEV_PASSWORD}):`);
  for (const u of [systemAdmin, admin, dealer, manager, editor]) {
    console.log(`  #${u.id} ${u.email} (${u.role})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
