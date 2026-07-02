import { dirname, extname, join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

/**
 * 跟 customer-file-storage.util.ts 同一套模式（本機磁碟，容器內路徑 bind mount 回 host，
 * 重啟容器不會消失），之後要換成 S3/MinIO 物件儲存時只要替換這三個函式的實作。
 * 跟顧客檔案分開一個 storage/cms/uploads 資料夾，因為這些圖片是公開素材（官網頁面用），
 * 不像顧客文件需要權限控管下載。
 */
const STORAGE_ROOT = join(process.cwd(), 'storage', 'cms', 'uploads');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** 檔名一律由伺服器產生（uuid + 副檔名），不採信使用者上傳的原始檔名——避免路徑穿越攻擊跟檔名衝突 */
export function generateCmsUploadFileName(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`unsupported file extension: ${ext}`);
  }
  return `${randomUUID()}${ext}`;
}

/** fileName 一律是 generateCmsUploadFileName() 產生的格式，這裡仍多一層檢查防止意外傳入帶路徑分隔符的字串 */
function assertSafeFileName(fileName: string): void {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error(`unsafe upload file name: ${fileName}`);
  }
}

export function cmsUploadPathFor(fileName: string): string {
  assertSafeFileName(fileName);
  return join(STORAGE_ROOT, fileName);
}

export async function saveCmsUpload(fileName: string, bytes: Buffer): Promise<void> {
  const path = cmsUploadPathFor(fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function loadCmsUpload(fileName: string): Promise<Buffer> {
  return readFile(cmsUploadPathFor(fileName));
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function mimeTypeForCmsUpload(fileName: string): string {
  return MIME_TYPE_BY_EXTENSION[extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}
