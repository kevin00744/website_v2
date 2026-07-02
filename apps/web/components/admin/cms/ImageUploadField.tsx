'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { uploadCmsImage } from '@/lib/cms-api';

interface ImageUploadFieldProps {
  value?: string;
  onChange: (value: string) => void;
}

/**
 * Puck 的自訂欄位（type: 'custom'）：管理員上傳檔案，圖片實際存到後端磁碟（見 cms-upload.util.ts），
 * 這裡的 value 永遠是後端回傳、組合好的完整網址字串——跟「直接貼網址」的文字欄位相比，
 * 門市/行銷人員不需要自己找圖床、複製貼上連結，上傳完直接看到縮圖即用。
 *
 * 這個元件只會被 Puck 編輯器（client）呼叫，不會出現在前台公開頁面的渲染路徑——
 * BlockRenderer.tsx 用的 Render 只執行 ComponentConfig.render，從來不會執行 field.render。
 */
export function ImageUploadField({ value, onChange }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    setUploading(true);
    try {
      const url = await uploadCmsImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element -- 編輯器內的縮圖預覽，來源是上傳後的任意網址
        <img src={value} alt="" className="h-24 w-full rounded border border-slate-200 object-cover" />
      )}
      <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} className="text-sm" />
      {uploading && <span className="text-xs text-slate-500">上傳中…</span>}
      {error && <span className="text-xs font-semibold text-red-600">⚠️ {error}</span>}
    </div>
  );
}
