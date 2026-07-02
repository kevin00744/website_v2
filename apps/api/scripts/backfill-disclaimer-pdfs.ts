/**
 * 一次性腳本：重新產生所有顧客的 disclaimer.pdf。
 * 背景：「2026/6/25」這種日期字串先前用變動字型(variable font)+subset 嵌入時，
 * 某些字符的 glyph 會在儲存階段被錯誤丟棄，導致畫面只剩「2  2  2」。
 * 字型/設定本身已經修好（改用 NotoSansTC-Regular.ttf 靜態字型），
 * 但「已經簽署完成」的舊顧客，PDF 檔案是先前那次生成時就寫死存在磁碟上的，
 * 不會因為程式碼修好而自動更新——所以要逐筆讀回當時凍結的 contentSnapshot + 簽名圖，重新跑一次排版引擎覆寫舊檔案。
 */
import { PrismaClient } from '@prisma/client';
import {
  applySignaturesToDisclaimerPdf,
  buildDisclaimerPdf,
  DISCLAIMER_FILE_NAME,
  formatDateLabel,
  type DisclaimerHeaderData,
  type DisclaimerSection,
} from '../src/customers/disclaimer-pdf.util';
import { decodeBase64Png } from '../src/customers/document-pdf.util';
import type { SignatureStamp } from '../src/customers/disclaimer-pdf.util';
import { saveCustomerFile } from '../src/customers/customer-file-storage.util';

const prisma = new PrismaClient();

interface FrozenSnapshot {
  templateVersion: string;
  title: string;
  sections: DisclaimerSection[];
  headerData: DisclaimerHeaderData;
  signedAt: string;
}

async function main() {
  const customers = await prisma.customer.findMany({
    where: { disclaimerPath: { not: null } },
    select: { id: true, name: true },
  });

  console.log(`找到 ${customers.length} 位有 disclaimer.pdf 的顧客，開始重新產生...`);

  let success = 0;
  let skipped = 0;

  for (const customer of customers) {
    const customerSignature = await prisma.signature.findFirst({
      where: { customerId: customer.id, documentType: 'disclaimer', signerRole: 'customer' },
      orderBy: { signedAt: 'desc' },
    });
    if (!customerSignature) {
      console.warn(`顧客 ${customer.id}（${customer.name}）找不到客戶簽名紀錄，跳過`);
      skipped++;
      continue;
    }

    const staffSignature = await prisma.signature.findFirst({
      where: { customerId: customer.id, documentType: 'disclaimer', signerRole: 'staff' },
      orderBy: { signedAt: 'desc' },
    });

    const snapshot = customerSignature.contentSnapshot as unknown as FrozenSnapshot;
    const { pdfBytes, anchors } = await buildDisclaimerPdf(
      { title: snapshot.title, sections: snapshot.sections },
      snapshot.headerData,
    );

    const stamps: SignatureStamp[] = [
      {
        role: 'customer',
        signaturePngBytes: decodeBase64Png(customerSignature.signatureImageUrl),
        dateLabel: formatDateLabel(customerSignature.signedAt),
      },
    ];
    if (staffSignature) {
      stamps.push({
        role: 'staff',
        signaturePngBytes: decodeBase64Png(staffSignature.signatureImageUrl),
        dateLabel: formatDateLabel(staffSignature.signedAt),
      });
    }

    const signedPdfBytes = await applySignaturesToDisclaimerPdf(pdfBytes, anchors, stamps);
    await saveCustomerFile(customer.id, DISCLAIMER_FILE_NAME, signedPdfBytes);
    console.log(`顧客 ${customer.id}（${customer.name}）重新產生完成`);
    success++;
  }

  console.log(`完成：成功 ${success} 筆，跳過 ${skipped} 筆`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
