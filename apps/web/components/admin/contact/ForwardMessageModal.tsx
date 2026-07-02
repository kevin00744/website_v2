'use client';

import { useEffect, useState } from 'react';
import type { ContactMessageSummary, StoreSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { forwardContactMessage } from '@/lib/contact-api';
import { listStores } from '@/lib/stores-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

interface ForwardMessageModalProps {
  message: ContactMessageSummary;
  onClose: () => void;
  onForwarded: (message: ContactMessageSummary) => void;
}

/** 經銷商把體驗諮詢轉給特定分店：分店清單會自動限縮在經銷商自己的區域（listStores 對 dealer 角色本來就只回自己區域） */
export function ForwardMessageModal({ message, onClose, onForwarded }: ForwardMessageModalProps) {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, []);

  async function handleSubmit() {
    if (!storeId) {
      setSubmitError('請選擇要轉發的分店');
      return;
    }
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const updated = await forwardContactMessage(message.id, Number(storeId));
      onForwarded(updated);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '轉發失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open onClose={onClose} title={`轉發「${message.name}」的體驗諮詢`} maxWidthClassName="md:max-w-md">
      <div className="flex flex-1 flex-col gap-5">
        <KioskSelect
          label="轉發給哪間分店"
          required
          options={stores.map((store) => ({ value: String(store.id), label: `${store.code} ${store.name}` }))}
          placeholder="請選擇分店"
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
        />

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? '轉發中…' : '確認轉發'}
          </KioskButton>
          <KioskButton variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </div>
    </CenteredModal>
  );
}
