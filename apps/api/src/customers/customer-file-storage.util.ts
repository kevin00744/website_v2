import { dirname, join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

/**
 * 目前用本機磁碟（容器內 /workspace/apps/api/storage，bind mount 回host，重啟容器不會消失）。
 * 之後要換成 S3/MinIO 物件儲存時，只要替換這三個函式的實作，呼叫端完全不用改。
 * 同一個顧客可能同時有 document.pdf（上傳照片合成）跟 disclaimer.pdf（動態排版的同意書），
 * 用 fileName 參數區分，存在同一個 storage/customers/{id}/ 資料夾下。
 */
const STORAGE_ROOT = join(process.cwd(), 'storage', 'customers');

export function customerFilePathFor(customerId: number, fileName: string): string {
  return join(STORAGE_ROOT, String(customerId), fileName);
}

export async function saveCustomerFile(customerId: number, fileName: string, bytes: Uint8Array): Promise<string> {
  const path = customerFilePathFor(customerId, fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return path;
}

export async function loadCustomerFile(customerId: number, fileName: string): Promise<Buffer> {
  return readFile(customerFilePathFor(customerId, fileName));
}
