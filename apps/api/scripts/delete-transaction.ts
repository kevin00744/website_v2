/**
 * 一次性腳本：以系統管理員身分刪除一筆顧客交易（與網頁「交易紀錄 → 刪除紀錄」完全相同的回溯邏輯）。
 *
 * 用法（預設只預覽，不寫入）：
 *   ts-node -T scripts/delete-transaction.ts <交易id> <系統管理員userId> "<原因>"
 * 確認預覽結果後加上 --yes 才真的刪除：
 *   ts-node -T scripts/delete-transaction.ts <交易id> <系統管理員userId> "<原因>" --yes
 *
 * 直接 new service（不啟動整個 AppModule），避免順便啟動 LINE 提醒排程、聊天 gateway 等背景工作。
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { CustomerTransactionsService } from '../src/customer-transactions/customer-transactions.service';
import type { AuthenticatedUser } from '../src/auth/types';

async function main() {
  const [idArg, userArg, reason, flag] = process.argv.slice(2);
  const id = Number(idArg);
  const userId = Number(userArg);
  if (!id || !userId || !reason?.trim()) {
    console.error('用法：delete-transaction.ts <交易id> <系統管理員userId> "<原因>" [--yes]');
    process.exit(2);
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'system_admin' || user.deletedAt) {
      throw new Error(`使用者 #${userId} 不是有效的系統管理員`);
    }
    const actor: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      storeFeatures: null,
    };
    const service = new CustomerTransactionsService(prisma);

    const txn = await prisma.customerTransaction.findUnique({
      where: { id },
      include: { customer: { select: { name: true } } },
    });
    if (!txn) throw new Error(`找不到交易 #${id}`);
    console.log(`交易 #${id}｜${txn.customer.name}｜${txn.kind}｜金額 $${txn.amount}｜legacy=${txn.legacy}`);

    const { summary } = await service.previewDelete(actor, id);
    console.log('刪除後會回溯：', JSON.stringify(summary));

    if (flag !== '--yes') {
      console.log('（預覽模式，沒有寫入。確認無誤後加上 --yes 執行）');
      return;
    }
    const result = await service.remove(actor, id, reason);
    console.log(`✅ 已刪除交易 #${id}，刪除時間 ${result.deletedAt}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌', e?.message ?? e);
  process.exit(1);
});
