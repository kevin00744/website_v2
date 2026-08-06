import { join } from 'path';
import { readFile } from 'fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import { decodeBase64Png } from './document-pdf.util';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

const FONT_PATH = join(process.cwd(), 'assets', 'fonts', 'NotoSansTC-Regular.ttf');
let fontBytesCache: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  if (!fontBytesCache) fontBytesCache = readFile(FONT_PATH);
  return fontBytesCache;
}

export interface ExosomeConsentPdfData {
  customerName: string;
  customerCode: string | null;
  nationalId: string | null;
  phone: string | null;
  storeName: string;
  signedAt: Date;
  signatureImageUrl: string | null;
}

export async function buildExosomeConsentPdf(data: ExosomeConsentPdfData): Promise<Buffer> {
  const fontBytes = await loadFont();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function text(str: string, x: number, yPos: number, size: number, color = rgb(0, 0, 0)) {
    page.drawText(str, { x, y: yPos, size, font, color });
  }

  function line(yPos: number) {
    page.drawLine({ start: { x: MARGIN, y: yPos }, end: { x: PAGE_WIDTH - MARGIN, y: yPos }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  }

  // Title
  text('外泌體使用同意書', MARGIN, y, 18);
  y -= 36;
  line(y);
  y -= 20;

  // Customer info
  const rows: [string, string][] = [
    ['顧客姓名', data.customerName],
    ['顧客編號', data.customerCode ?? '—'],
    ['身份證字號', data.nationalId ?? '—'],
    ['聯絡電話', data.phone ?? '—'],
    ['所屬分店', data.storeName],
    ['簽署日期', data.signedAt.toLocaleDateString('zh-TW')],
  ];

  for (const [label, value] of rows) {
    text(`${label}：${value}`, MARGIN, y, 11);
    y -= 22;
  }

  y -= 16;
  line(y);
  y -= 24;

  // Consent text
  const CONTENT_TEXT = [
    '本人已充分了解外泌體相關療程之使用說明、注意事項及可能之風險，',
    '並同意依照醫美專業人員之指示配合療程進行，確認以下事項：',
    '',
    '一、本人已詳閱外泌體產品之成分說明及使用方式。',
    '二、本人已告知服務人員個人過敏史及相關病史。',
    '三、本人同意在療程過程中如有不適，立即告知服務人員。',
    '四、本人了解療程效果因個人體質而異，並無法保證特定結果。',
    '五、本人同意授權分店保存本同意書作為療程紀錄之用。',
  ];

  for (const line_ of CONTENT_TEXT) {
    text(line_, MARGIN, y, 10.5);
    y -= 18;
  }

  y -= 20;

  // Signature section
  text('顧客簽名', MARGIN, y, 12);
  y -= 100;

  if (data.signatureImageUrl) {
    try {
      const sigBytes = decodeBase64Png(data.signatureImageUrl);
      const sigImage = await pdfDoc.embedPng(sigBytes);
      const sigDims = sigImage.scaleToFit(200, 80);
      page.drawImage(sigImage, { x: MARGIN, y: y, width: sigDims.width, height: sigDims.height });
    } catch {
      text('[簽名圖片無法顯示]', MARGIN, y + 40, 10, rgb(0.5, 0.5, 0.5));
    }
  }

  page.drawRectangle({ x: MARGIN, y: y, width: 220, height: 90, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });

  text(`簽署時間：${data.signedAt.toLocaleString('zh-TW')}`, MARGIN, y - 20, 9, rgb(0.4, 0.4, 0.4));

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
