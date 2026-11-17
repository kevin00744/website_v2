import { join } from 'path';
import { readFile } from 'fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';

const PAGE_WIDTH = 595.28; // A4 @ 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 16;
const HEADING_SIZE = 13;
const BODY_SIZE = 10.5;
const BODY_LINE_HEIGHT = 16;
const HEADING_LINE_HEIGHT = 20;
const SIGNATURE_BOX_WIDTH = 160;

/**
 * 版面版本：
 * - 1：簽名欄跟一般文字行一樣高（16pt），簽名被縮得很小
 * - 2：簽名欄保留 46pt 高、220pt 寬，簽名貼著底線放大顯示
 * 顧客簽名時是「用服務人員簽署當下的快照重算座標，再蓋到磁碟上那份 PDF」，所以快照要記住版面版本，
 * 舊快照（沒有 layoutVersion）一律當作 1，避免兩次簽名的座標對不齊。
 */
export const CURRENT_LAYOUT_VERSION = 2;
const SIGNATURE_ROW_HEIGHT = 46;
const SIGNATURE_BOX_WIDTH_V2 = 220;

export const DISCLAIMER_FILE_NAME = 'disclaimer.pdf';

export function formatDateLabel(date: Date): string {
  // 一律用台灣時間：伺服器是 UTC，凌晨 0–8 點簽署的日期會差一天
  return date.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

const FONT_PATH = join(process.cwd(), 'assets', 'fonts', 'NotoSansTC-Regular.ttf');
let fontBytesPromise: Promise<Buffer> | null = null;

function loadFontBytes(): Promise<Buffer> {
  if (!fontBytesPromise) {
    fontBytesPromise = readFile(FONT_PATH);
  }
  return fontBytesPromise;
}

export interface DisclaimerSection {
  heading: string;
  paragraphs: string[];
  /** 切換這個布林值就是「設定簽名位置」的唯一機制，座標完全由排版引擎自動算出 */
  requiresSignature: boolean;
}

export interface DisclaimerHeaderData {
  customerName: string;
  customerCode: string | null;
  nationalId: string;
  phone: string | null;
  address: string | null;
  storeName: string;
  storeCode: string;
}

export interface SignatureAnchor {
  page: number;
  role: 'customer' | 'staff';
  x: number;
  y: number;
  width: number;
  height: number;
  /** 只有全文最後的客戶/服務人員簽名旁邊才有日期欄 */
  dateAnchor?: { x: number; y: number };
}

interface BuildResult {
  pdfBytes: Uint8Array;
  anchors: SignatureAnchor[];
}

/** CJK 沒有空白分詞，逐字符量寬度換行，是最簡單也最不會出錯的做法 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    const candidate = current + char;
    if (current.length > 0 && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * 依 DisclaimerTemplate.sections 動態排版產生 PDF。
 * 簽名錨點（anchors）是排版時「邊畫邊記」算出來的，不是事後用座標常數或文字搜尋去猜——
 * 這保證錨點跟畫面上實際印出來的線完全對齊，且未來改 sections 內容（加減段落、文字變長換行/換頁）
 * 重新呼叫這個函式就會自動算出新的正確座標，不需要任何人工維護的 x/y 數字。
 */
export async function buildDisclaimerPdf(
  template: { title: string; sections: DisclaimerSection[] },
  headerData: DisclaimerHeaderData,
  layoutVersion: number = CURRENT_LAYOUT_VERSION,
): Promise<BuildResult> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // subset:true 在這顆字型上會悄悄丟掉日期用到的部分 ASCII glyph（0/6/5//），文字擷取看起來正常但畫面缺字，
  // 寧可吃下完整字型的檔案大小也要避免再發生這個問題。
  const font = await pdfDoc.embedFont(await loadFontBytes(), { subset: false });

  const anchors: SignatureAnchor[] = [];
  let pageIndex = 0;
  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(neededHeight: number) {
    if (y - neededHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageIndex += 1;
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawWrappedText(text: string, size: number, lineHeight: number) {
    const lines = wrapText(text, font, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= lineHeight;
    }
  }

  /** 畫「標籤：____」這種一行內含簽名/日期空格的列，回傳空格框的座標 */
  function drawBlankLine(label: string, boxWidth: number) {
    ensureSpace(BODY_LINE_HEIGHT);
    const lineY = y - BODY_SIZE;
    page.drawText(label, { x: MARGIN, y: lineY, size: BODY_SIZE, font, color: rgb(0.1, 0.1, 0.1) });
    const labelWidth = font.widthOfTextAtSize(label, BODY_SIZE);
    const boxX = MARGIN + labelWidth + 4;
    page.drawLine({
      start: { x: boxX, y: lineY - 2 },
      end: { x: Math.min(boxX + boxWidth, PAGE_WIDTH - MARGIN), y: lineY - 2 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= BODY_LINE_HEIGHT;
    return { x: boxX, y: lineY - 4, width: Math.min(boxWidth, PAGE_WIDTH - MARGIN - boxX) };
  }

  /**
   * 簽名列：v2 先在上方留出簽名的空間，標籤與底線畫在這一列底部，回傳「底線上方」整塊區域當簽名框；
   * v1 沿用一般文字行（舊快照重算座標用）。
   */
  function drawSignatureLine(label: string): { x: number; y: number; width: number; height: number } {
    if (layoutVersion < 2) {
      const box = drawBlankLine(label, SIGNATURE_BOX_WIDTH);
      return { ...box, height: BODY_LINE_HEIGHT };
    }
    ensureSpace(SIGNATURE_ROW_HEIGHT);
    y -= SIGNATURE_ROW_HEIGHT - BODY_LINE_HEIGHT;
    const box = drawBlankLine(label, SIGNATURE_BOX_WIDTH_V2);
    // 底線在 lineY - 2；簽名框從底線往上，涵蓋為簽名預留的高度
    return { x: box.x, y: box.y + 2, width: box.width, height: SIGNATURE_ROW_HEIGHT - 6 };
  }

  // 標題
  const titleWidth = font.widthOfTextAtSize(template.title, TITLE_SIZE);
  ensureSpace(TITLE_SIZE + 16);
  page.drawText(template.title, {
    x: (PAGE_WIDTH - titleWidth) / 2,
    y: y - TITLE_SIZE,
    size: TITLE_SIZE,
    font,
  });
  y -= TITLE_SIZE + 20;

  // 頁首固定欄位（從 Customer/Store 既有資料自動帶入，不是 section，不可編輯）
  drawWrappedText(`客戶姓名：${headerData.customerName}　　客戶編號：${headerData.customerCode ?? ''}`, BODY_SIZE, BODY_LINE_HEIGHT);
  drawWrappedText(`身分證字號/統一編號：${headerData.nationalId}`, BODY_SIZE, BODY_LINE_HEIGHT);
  drawWrappedText(`聯絡電話：${headerData.phone ?? ''}`, BODY_SIZE, BODY_LINE_HEIGHT);
  drawWrappedText(`聯絡地址：${headerData.address ?? ''}`, BODY_SIZE, BODY_LINE_HEIGHT);
  drawWrappedText(`服務店家（以下稱乙方）：${headerData.storeName}　　商家編號：${headerData.storeCode}`, BODY_SIZE, BODY_LINE_HEIGHT);
  y -= 8;
  drawWrappedText(
    `本人（以下稱客戶）同意在 ${headerData.storeName} 接受由乙方提供之服務，並知悉且同意以下免責事項：`,
    BODY_SIZE,
    BODY_LINE_HEIGHT,
  );
  y -= 8;

  // 條款段落（動態，admin 之後可編輯）
  for (const section of template.sections) {
    ensureSpace(HEADING_LINE_HEIGHT);
    drawWrappedText(section.heading, HEADING_SIZE, HEADING_LINE_HEIGHT);
    for (const paragraph of section.paragraphs) {
      drawWrappedText(paragraph, BODY_SIZE, BODY_LINE_HEIGHT);
    }

    if (section.requiresSignature) {
      const box = drawSignatureLine('是，了解。客戶簽名：');
      anchors.push({ page: pageIndex, role: 'customer', x: box.x, y: box.y, width: box.width, height: box.height });
      y -= 8;
    } else {
      y -= 8;
    }
  }

  // 全文結尾固定區塊：客戶最終簽名+日期、服務人員簽名+日期（永遠存在，不是可關閉的 section）
  y -= 8;
  const customerFinalBox = drawSignatureLine('客戶簽名：');
  const customerFinalAnchor: SignatureAnchor = {
    page: pageIndex,
    role: 'customer',
    x: customerFinalBox.x,
    y: customerFinalBox.y,
    width: customerFinalBox.width,
    height: customerFinalBox.height,
  };
  anchors.push(customerFinalAnchor);
  const customerDateBox = drawBlankLine('日期：', 120);
  customerFinalAnchor.dateAnchor = { x: customerDateBox.x, y: customerDateBox.y + 4 };

  y -= 16;
  const staffFinalBox = drawSignatureLine('服務人員簽章：');
  const staffFinalAnchor: SignatureAnchor = {
    page: pageIndex,
    role: 'staff',
    x: staffFinalBox.x,
    y: staffFinalBox.y,
    width: staffFinalBox.width,
    height: staffFinalBox.height,
  };
  anchors.push(staffFinalAnchor);
  const staffDateBox = drawBlankLine('日期：', 120);
  staffFinalAnchor.dateAnchor = { x: staffDateBox.x, y: staffDateBox.y + 4 };

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, anchors };
}

export interface SignatureStamp {
  role: 'customer' | 'staff';
  signaturePngBytes: Buffer;
  dateLabel?: string;
}

/**
 * 把簽名圖疊到對應 role 的所有錨點（顧客只簽一次，系統自動蓋到全部 5 個客戶錨點）。
 * anchors 是呼叫端用 buildDisclaimerPdf() 重新算出來的最新一份，跟存在磁碟上那份 PDF
 * 的版面保證一致（同一個 template + headerData 重算結果完全相同）。
 */
export async function applySignaturesToDisclaimerPdf(
  pdfBytes: Buffer | Uint8Array,
  anchors: SignatureAnchor[],
  stamps: SignatureStamp[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(await loadFontBytes(), { subset: false });

  for (const anchor of anchors) {
    const stamp = stamps.find((s) => s.role === anchor.role);
    if (!stamp) continue;

    const page = pdfDoc.getPage(anchor.page);
    const signatureImage = await pdfDoc.embedPng(stamp.signaturePngBytes);

    // 大簽名框（版面 v2）：簽名貼著底線、允許放大到 2 倍；舊的單行框維持置中、不放大
    const tall = anchor.height > BODY_LINE_HEIGHT + 4;
    const padding = tall ? 2 : 4;
    const innerWidth = anchor.width - padding * 2;
    const innerHeight = anchor.height - padding * 2;
    const scale = Math.min(innerWidth / signatureImage.width, innerHeight / signatureImage.height, tall ? 2 : 1);
    const width = signatureImage.width * scale;
    const height = signatureImage.height * scale;

    page.drawImage(signatureImage, {
      x: anchor.x + (anchor.width - width) / 2,
      y: tall ? anchor.y + padding : anchor.y + (anchor.height - height) / 2,
      width,
      height,
    });

    if (anchor.dateAnchor && stamp.dateLabel) {
      page.drawText(stamp.dateLabel, {
        x: anchor.dateAnchor.x,
        y: anchor.dateAnchor.y,
        size: BODY_SIZE,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }

  return pdfDoc.save();
}
