import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { AppError } from '../common/errors/app-error';

const PAGE_WIDTH = 595.28; // A4 @ 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;

/**
 * 簽名框座標（page 1 底部，左右並排：顧客在左，服務人員在右）。
 * 標籤故意用英文——標準 PDF 內建字型（Helvetica）只支援 Latin-1，沒有中文字形，
 * 要顯示中文需要額外嵌入一個 CJK 字型檔（例如 Noto Sans TC），這個專案目前還沒有附帶字型檔案，
 * 之後要做中文標籤的話要先把字型檔案放進 repo 再用 fontkit 嵌入。
 */
export const CUSTOMER_SIGNATURE_BOX = { x: MARGIN, y: 56, width: 220, height: 70 };
export const STAFF_SIGNATURE_BOX = { x: PAGE_WIDTH - MARGIN - 220, y: 56, width: 220, height: 70 };

function detectImageType(bytes: Buffer): 'jpg' | 'png' {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return isPng ? 'png' : 'jpg';
}

async function embedPhoto(pdfDoc: PDFDocument, bytes: Buffer): Promise<PDFImage> {
  try {
    return detectImageType(bytes) === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } catch {
    throw new AppError('DOCUMENT_PHOTO_INVALID', 'uploaded file is not a readable jpg/png image');
  }
}

function drawSignatureBox(
  page: PDFPage,
  box: { x: number; y: number; width: number; height: number },
  label: string,
  font: PDFFont,
) {
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 1,
  });
  page.drawText(label, {
    x: box.x,
    y: box.y + box.height + 6,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
}

/** 把上傳的照片各自排成一頁，page 1 額外保留顧客/服務人員兩個簽名框。 */
export async function buildDocumentPdf(photos: Buffer[]): Promise<Uint8Array> {
  if (photos.length === 0) {
    throw new AppError('DOCUMENT_PHOTOS_MISSING', 'at least one photo is required');
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const [index, photoBytes] of photos.entries()) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const image = await embedPhoto(pdfDoc, photoBytes);

    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const maxHeight = PAGE_HEIGHT - MARGIN * 2 - (index === 0 ? 140 : 0);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
      x: (PAGE_WIDTH - width) / 2,
      y: PAGE_HEIGHT - MARGIN - height,
      width,
      height,
    });

    if (index === 0) {
      drawSignatureBox(page, CUSTOMER_SIGNATURE_BOX, 'Customer Signature', font);
      drawSignatureBox(page, STAFF_SIGNATURE_BOX, 'Staff Signature', font);
    }
  }

  return pdfDoc.save();
}

/** 把簽名 PNG 疊到 page 1 對應的框框裡，置中縮放、不超出框線。 */
export async function applySignatureToPdf(
  pdfBytes: Buffer | Uint8Array,
  box: { x: number; y: number; width: number; height: number },
  signaturePngBytes: Buffer,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);

  let signatureImage: PDFImage;
  try {
    signatureImage = await pdfDoc.embedPng(signaturePngBytes);
  } catch {
    throw new AppError('SIGNATURE_IMAGE_MISSING', 'signature image must be a valid PNG');
  }

  const padding = 6;
  const innerWidth = box.width - padding * 2;
  const innerHeight = box.height - padding * 2;
  const scale = Math.min(innerWidth / signatureImage.width, innerHeight / signatureImage.height, 1);
  const width = signatureImage.width * scale;
  const height = signatureImage.height * scale;

  page.drawImage(signatureImage, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  });

  return pdfDoc.save();
}

export function decodeBase64Png(dataUrlOrBase64: string): Buffer {
  const base64 = dataUrlOrBase64.includes(',') ? dataUrlOrBase64.split(',')[1] : dataUrlOrBase64;
  return Buffer.from(base64, 'base64');
}
