/**
 * 一次性腳本：合併「LINE 自助建檔」造成的重複顧客。
 *
 * 背景：後台建檔時電話被存成 0981-675-415（輸入框自動補 dash），LINE 綁定時用 0981675415 比對不到，
 * 於是 LINE 又建了一筆新顧客。電話格式已統一（純數字），此腳本把已經重複的資料併回原顧客。
 *
 * 合併條件（全部符合才會合併）：
 *   - 重複的那筆是 LINE 自助建檔（建立者 = line-bot 帳號，且備註為「LINE 自助建檔」）
 *   - 同店另有一筆「更早建立」的顧客，電話正規化後相同、姓名相同（忽略空白）
 *   - LINE 那筆沒有任何課程、錢包、消費、療程、簽名、庫存紀錄
 * 合併動作（單一 transaction）：
 *   - line_accounts 改指向原顧客（原顧客若已綁定其他 LINE，則跳過、列出人工處理）
 *   - LINE 那筆的預約改掛原顧客
 *   - LINE 那筆軟刪除
 *
 * 用法（在 apps/api 下，或 docker exec 進 api 容器）：
 *   npx ts-node scripts/merge-line-duplicate-customers.ts          ← 只列出（dry-run）
 *   npx ts-node scripts/merge-line-duplicate-customers.ts --apply  ← 真的合併
 */
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../src/common/phone.util';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BOT_USERNAME = process.env.LINE_BOT_USERNAME ?? 'line-bot';
const LINE_NOTE = 'LINE 自助建檔';

const clean = (s: string) => s.replace(/\s+/g, '');

async function hasOwnRecords(customerId: number): Promise<string[]> {
  const [courses, wallet, walletLogs, services, treatments, signatures, inventory] = await Promise.all([
    prisma.customerCourse.count({ where: { customerId } }),
    prisma.customerWallet.count({ where: { customerId } }),
    prisma.walletLog.count({ where: { customerId } }),
    prisma.serviceRecord.count({ where: { customerId } }),
    prisma.customerTreatmentRecord.count({ where: { customerId } }),
    prisma.signature.count({ where: { customerId } }),
    prisma.inventoryLog.count({ where: { customerId } }),
  ]);
  const found: string[] = [];
  if (courses) found.push(`課程 ${courses}`);
  if (wallet || walletLogs) found.push('錢包');
  if (services) found.push(`消費 ${services}`);
  if (treatments) found.push(`療程 ${treatments}`);
  if (signatures) found.push(`簽名 ${signatures}`);
  if (inventory) found.push(`庫存 ${inventory}`);
  return found;
}

async function main() {
  const bot = await prisma.user.findUnique({ where: { username: BOT_USERNAME }, select: { id: true } });
  if (!bot) {
    console.log(`找不到 ${BOT_USERNAME} 帳號，沒有需要處理的資料`);
    return;
  }

  const lineCreated = await prisma.customer.findMany({
    where: { createdBy: bot.id, note: LINE_NOTE, deletedAt: null },
    select: { id: true, name: true, phone: true, storeId: true, createdAt: true, lineAccount: { select: { id: true } } },
    orderBy: { id: 'asc' },
  });
  console.log(`LINE 自助建檔顧客：${lineCreated.length} 位${APPLY ? '' : '（dry-run，加 --apply 才會真的合併）'}\n`);

  let merged = 0;
  let manual = 0;
  for (const dup of lineCreated) {
    const phone = normalizePhone(dup.phone);
    if (!phone) continue;

    const candidates = await prisma.customer.findMany({
      where: { storeId: dup.storeId, deletedAt: null, id: { not: dup.id }, createdAt: { lt: dup.createdAt } },
      select: { id: true, name: true, phone: true, lineAccount: { select: { id: true } } },
      orderBy: { id: 'asc' },
    });
    const samePhone = candidates.filter((c) => normalizePhone(c.phone) === phone);
    if (samePhone.length === 0) continue; // 真的是新客，不用處理

    const label = `#${dup.id} ${dup.name} ${phone}`;
    const original = samePhone.find((c) => clean(c.name) === clean(dup.name));
    if (!original) {
      manual++;
      console.log(`⚠️  ${label}：同電話但姓名不同（${samePhone.map((c) => `#${c.id} ${c.name}`).join('、')}），請人工確認`);
      continue;
    }
    const records = await hasOwnRecords(dup.id);
    if (records.length) {
      manual++;
      console.log(`⚠️  ${label}：LINE 那筆已有 ${records.join('、')}，請人工確認後再處理`);
      continue;
    }
    if (dup.lineAccount && original.lineAccount) {
      manual++;
      console.log(`⚠️  ${label}：原顧客 #${original.id} 已綁定其他 LINE 帳號，請人工確認`);
      continue;
    }

    const apptCount = await prisma.appointment.count({ where: { customerId: dup.id } });
    console.log(
      `✅ 合併 ${label} → 原顧客 #${original.id} ${original.name}（${original.phone}）` +
        `${dup.lineAccount ? '，LINE 綁定轉移' : ''}${apptCount ? `，預約 ${apptCount} 筆轉移` : ''}`,
    );
    merged++;
    if (!APPLY) continue;

    await prisma.$transaction([
      ...(dup.lineAccount
        ? [prisma.lineAccount.update({ where: { id: dup.lineAccount.id }, data: { customerId: original.id } })]
        : []),
      prisma.appointment.updateMany({ where: { customerId: dup.id }, data: { customerId: original.id } }),
      prisma.customer.update({
        where: { id: dup.id },
        data: { deletedAt: new Date(), note: `${LINE_NOTE}（已合併至 #${original.id}）` },
      }),
    ]);
  }

  console.log(`\n${APPLY ? '已合併' : '可合併'} ${merged} 位，需人工確認 ${manual} 位`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
