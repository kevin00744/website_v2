'use client';

import { useEffect, useState } from 'react';
import { CONTACT_ROLE_LABEL, type ChatContact } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { listContacts } from '@/lib/chat-api';
import { KioskButton } from '../kiosk/KioskButton';

interface ContactPickerProps {
  onSelect: (contact: ChatContact) => void;
  onCancel: () => void;
  /** 選了之後打 API 的那段時間鎖住按鈕，避免連點生出多筆重複的開始對話請求 */
  starting: boolean;
}

const REGION_LABEL: Record<string, string> = { north: '北區', central: '中區', south: '南區' };

/** 「找人聊天」的聯絡人清單：只列經銷商/管理員/系統管理員，對齊業務上的溝通方向（向上反映問題） */
export function ContactPicker({ onSelect, onCancel, starting }: ContactPickerProps) {
  const [contacts, setContacts] = useState<ChatContact[]>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    listContacts()
      .then(setContacts)
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : '載入聯絡人清單失敗，請稍後再試'));
  }, []);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-kiosk-lg font-bold text-slate-900">選擇聯絡人</h3>
        <KioskButton variant="ghost" onClick={onCancel}>
          取消
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {!loadError && !contacts && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {contacts && contacts.length === 0 && <p className="text-kiosk-base text-slate-500">目前沒有可以聯絡的經銷商或管理員</p>}

      <div className="flex flex-col gap-2 overflow-y-auto">
        {contacts?.map((contact) => (
          <button
            key={contact.id}
            type="button"
            disabled={starting}
            onClick={() => onSelect(contact)}
            className="flex items-center justify-between rounded-kiosk border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-kiosk-base font-bold text-slate-900">{contact.name}</span>
            <span className="text-kiosk-base text-slate-500">
              {CONTACT_ROLE_LABEL[contact.role]}
              {contact.region ? `・${REGION_LABEL[contact.region]}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
