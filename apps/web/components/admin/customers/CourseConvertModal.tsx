'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { convertCourse, type CustomerCourseItem } from '@/lib/customers-api';
import { listServiceItems, type ServiceItemSummary } from '@/lib/service-records-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { KioskSelect } from '../kiosk/KioskSelect';

interface CourseConvertModalProps {
  open: boolean;
  course: CustomerCourseItem;
  storeId: number;
  onCompleted: () => void;
  onClose: () => void;
}

export function CourseConvertModal({
  open,
  course,
  storeId,
  onCompleted,
  onClose,
}: CourseConvertModalProps) {
  const [serviceItems, setServiceItems] = useState<ServiceItemSummary[]>([]);
  const [loadError, setLoadError] = useState<string>();

  const [newServiceItemId, setNewServiceItemId] = useState('');
  const [newTotalSessions, setNewTotalSessions] = useState('');
  const [newPurchasePrice, setNewPurchasePrice] = useState('');
  const [convertedSessions, setConvertedSessions] = useState(course.remainingSessions.toString());
  const [remark, setRemark] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    listServiceItems(storeId)
      .then((items) => setServiceItems(items))
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : '無法載入服務項目'),
      );
  }, [open, storeId]);

  function handleClose() {
    setNewServiceItemId('');
    setNewTotalSessions('');
    setNewPurchasePrice('');
    setConvertedSessions(course.remainingSessions.toString());
    setRemark('');
    setError(undefined);
    onClose();
  }

  const convertedNum = parseInt(convertedSessions, 10);
  const totalNum = parseInt(newTotalSessions, 10);
  const validConverted =
    !isNaN(convertedNum) && convertedNum > 0 && convertedNum <= course.remainingSessions;
  const validTotal = !isNaN(totalNum) && totalNum > 0;
  const validServiceItem = !!newServiceItemId && parseInt(newServiceItemId, 10) !== course.serviceItem.id;

  async function handleSubmit() {
    if (!validServiceItem) { setError('請選擇不同的新課程'); return; }
    if (!validConverted) { setError(`請輸入有效的轉換堂數（1～${course.remainingSessions}）`); return; }
    if (!validTotal) { setError('請輸入新課程總堂數'); return; }
    setError(undefined);
    setSubmitting(true);
    try {
      await convertCourse(course.id, {
        newServiceItemId: parseInt(newServiceItemId, 10),
        newTotalSessions: totalNum,
        newPurchasePrice: newPurchasePrice ? parseInt(newPurchasePrice, 10) : undefined,
        convertedSessions: convertedNum,
        remark: remark.trim() || undefined,
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '課程轉換失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  const serviceItemOptions = serviceItems
    .filter((s) => s.id !== course.serviceItem.id)
    .map((s) => ({ value: s.id.toString(), label: s.name }));

  return (
    <CenteredModal open={open} title="課程轉換" onClose={handleClose} maxWidthClassName="md:max-w-lg">
      <div className="flex flex-col gap-5 p-1">
        <div className="rounded-kiosk bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">原課程：{course.serviceItem.name}</p>
          <p className="mt-1">剩餘堂數：<strong>{course.remainingSessions}</strong> 堂</p>
        </div>

        {loadError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>
        )}

        <KioskSelect
          label="新課程"
          value={newServiceItemId}
          onChange={(e) => setNewServiceItemId(e.target.value)}
          options={serviceItemOptions}
          placeholder="請選擇新課程"
        />

        <KioskInput
          label="轉換堂數（從原課程扣除）"
          type="number"
          placeholder={`最多 ${course.remainingSessions} 堂`}
          value={convertedSessions}
          onChange={(e) => setConvertedSessions(e.target.value)}
          errorMessage={
            convertedSessions && !validConverted
              ? `請輸入 1～${course.remainingSessions} 之間的數字`
              : undefined
          }
          isValid={validConverted}
        />

        <KioskInput
          label="新課程總堂數"
          type="number"
          placeholder="請輸入新課程的總堂數"
          value={newTotalSessions}
          onChange={(e) => setNewTotalSessions(e.target.value)}
          errorMessage={newTotalSessions && !validTotal ? '請輸入有效堂數' : undefined}
          isValid={validTotal}
        />

        <KioskInput
          label="新課程購買金額（選填）"
          type="number"
          placeholder="如有差價補繳請填入"
          value={newPurchasePrice}
          onChange={(e) => setNewPurchasePrice(e.target.value)}
        />

        <KioskInput
          label="備註（選填）"
          placeholder="例：顧客要求轉換課程項目"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />

        {error && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>
        )}

        <div className="flex gap-3">
          <KioskButton variant="ghost" fullWidth onClick={handleClose} disabled={submitting}>
            取消
          </KioskButton>
          <KioskButton
            variant="primary"
            fullWidth
            onClick={() => void handleSubmit()}
            disabled={submitting || !validServiceItem || !validConverted || !validTotal}
          >
            {submitting ? '處理中…' : '確認課程轉換'}
          </KioskButton>
        </div>
      </div>
    </CenteredModal>
  );
}
