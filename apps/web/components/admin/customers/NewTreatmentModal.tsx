'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { listProducts } from '@/lib/inventory-api';
import { createTreatmentRecord, uploadTreatmentPhotos } from '@/lib/customers-api';
import { KioskButton } from '../kiosk/KioskButton';
import { CenteredModal } from '../kiosk/CenteredModal';

interface NewTreatmentModalProps {
  open: boolean;
  customerId: number;
  onClose: () => void;
  onCreated: () => void;
}

export function NewTreatmentModal({ open, customerId, onClose, onCreated }: NewTreatmentModalProps) {
  const [products, setProducts] = useState<ProductSummary[]>();
  const [productId, setProductId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [photos, setPhotos] = useState<File[]>();
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    listProducts().then(setProducts).catch(() => {/* 商品載入失敗不阻擋開啟 */});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setProductId('');
      setNote('');
      setPerformedAt(new Date().toISOString().slice(0, 10));
      setPhotos(undefined);
      setPreviews([]);
      setError(undefined);
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos(files);
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev?.filter((_, i) => i !== index));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (!productId) { setError('請選擇商品'); return; }
    setError(undefined);
    setSubmitting(true);
    try {
      const record = await createTreatmentRecord(customerId, {
        productId: Number(productId),
        note: note.trim() || undefined,
        performedAt: new Date(performedAt).toISOString(),
      });
      if (photos && photos.length > 0) {
        await uploadTreatmentPhotos(customerId, record.id, photos);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '新增失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} title="新增療程紀錄" onClose={onClose}>
      <div className="flex flex-col gap-5 p-1">
        {/* 商品選單 */}
        <div className="flex flex-col gap-1">
          <label className="text-kiosk-base font-semibold text-slate-700">使用商品 *</label>
          {!products ? (
            <p className="text-kiosk-base text-slate-400">商品載入中…</p>
          ) : (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-kiosk border border-slate-300 bg-white px-4 py-3 text-kiosk-base text-slate-900 focus:border-kiosk-primary focus:outline-none"
            >
              <option value="">請選擇商品…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.unit ? `（${p.unit}）` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 服務日期 */}
        <div className="flex flex-col gap-1">
          <label className="text-kiosk-base font-semibold text-slate-700">服務日期</label>
          <input
            type="date"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            className="w-full rounded-kiosk border border-slate-300 bg-white px-4 py-3 text-kiosk-base text-slate-900 focus:border-kiosk-primary focus:outline-none"
          />
        </div>

        {/* 備註 */}
        <div className="flex flex-col gap-1">
          <label className="text-kiosk-base font-semibold text-slate-700">備註（選填）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="療程說明、特殊狀況等…"
            className="w-full rounded-kiosk border border-slate-300 bg-white px-4 py-3 text-kiosk-base text-slate-900 focus:border-kiosk-primary focus:outline-none resize-none"
          />
        </div>

        {/* 上傳照片 */}
        <div className="flex flex-col gap-2">
          <label className="text-kiosk-base font-semibold text-slate-700">療程照片（選填）</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <KioskButton variant="secondary" onClick={() => fileInputRef.current?.click()}>
            選擇照片
          </KioskButton>
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`預覽 ${i + 1}`} className="w-20 h-20 rounded object-cover border border-slate-200" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-kiosk-danger text-white text-xs flex items-center justify-center leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>}

        <div className="flex gap-3 pt-2">
          <KioskButton variant="ghost" onClick={onClose} fullWidth disabled={submitting}>
            取消
          </KioskButton>
          <KioskButton variant="primary" onClick={() => void handleSubmit()} fullWidth disabled={submitting}>
            {submitting ? '儲存中…' : '儲存'}
          </KioskButton>
        </div>
      </div>
    </CenteredModal>
  );
}
