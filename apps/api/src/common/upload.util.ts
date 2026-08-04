import { extname, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const UPLOAD_ROOT = join(process.cwd(), 'storage', 'uploads');

export function generateUploadFileName(originalName: string): string {
  return `${randomUUID()}${extname(originalName) || '.bin'}`;
}

export async function saveUploadFile(fileName: string, data: Buffer): Promise<void> {
  const dir = UPLOAD_ROOT;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), data);
}

export function uploadFilePath(fileName: string): string {
  return join(UPLOAD_ROOT, fileName);
}
