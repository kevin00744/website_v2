'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatContact, ConversationSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { listConversations, startConversation } from '@/lib/chat-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { ConversationList } from './ConversationList';
import { ConversationThread } from './ConversationThread';
import { ContactPicker } from './ContactPicker';

interface ChatInboxModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: number;
  /** 收件箱重新整理時（例如有新訊息）順便通知 AdminShell 更新側邊欄未讀數 */
  onConversationsRefreshed: (conversations: ConversationSummary[]) => void;
}

/**
 * 大尺寸 Modal：左邊對話列表、右邊聊天室，跟 KioskInput 等其他「置中大畫面」流程同一套視覺語言，
 * 不是縮在角落的小聊天泡泡——門市人員在 iPad 上操作，小視窗不利點擊跟閱讀。
 */
export function ChatInboxModal({ open, onClose, currentUserId, onConversationsRefreshed }: ChatInboxModalProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const [loadError, setLoadError] = useState<string>();
  const [startError, setStartError] = useState<string>();
  const [selectedId, setSelectedId] = useState<number>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const result = await listConversations();
      setConversations(result);
      onConversationsRefreshed(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '載入對話列表失敗，請稍後再試');
    }
  }, [onConversationsRefreshed]);

  useEffect(() => {
    if (open) {
      setPickerOpen(false);
      void loadConversations();
    }
  }, [open, loadConversations]);

  function handleSelect(conversationId: number) {
    setSelectedId(conversationId);
    // 點開某個對話後，當下看到的未讀數應該很快就會被 ConversationThread 標記已讀清掉，
    // 這裡先重新整理一次列表讓畫面立刻反映「未讀數歸零」，不用等下次 inbox:updated 推播。
    void loadConversations();
  }

  async function handleSelectContact(contact: ChatContact) {
    setStartError(undefined);
    setStarting(true);
    try {
      const { id } = await startConversation(contact.id);
      setPickerOpen(false);
      await loadConversations();
      setSelectedId(id);
    } catch (error) {
      setStartError(error instanceof ApiError ? error.message : '建立對話失敗，請稍後再試');
    } finally {
      setStarting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title="內部訊息" closeOnOverlayClick>
      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {!loadError && !conversations && <p className="text-kiosk-base text-slate-500">載入中…</p>}

      {conversations && (
        <div className="flex h-full flex-col gap-4 md:flex-row">
          <div className="flex flex-col gap-3 md:w-80 md:flex-shrink-0">
            <KioskButton variant="secondary" onClick={() => setPickerOpen(true)}>
              ＋ 新對話（找經銷商／管理員）
            </KioskButton>
            {startError && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
                ⚠️ {startError}
              </p>
            )}
            <div className="overflow-y-auto">
              <ConversationList conversations={conversations} selectedId={selectedId} onSelect={handleSelect} />
            </div>
          </div>
          <div className="flex-1 border-t border-slate-200 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            {pickerOpen ? (
              <ContactPicker onSelect={handleSelectContact} onCancel={() => setPickerOpen(false)} starting={starting} />
            ) : selectedId ? (
              <ConversationThread conversationId={selectedId} currentUserId={currentUserId} />
            ) : (
              <p className="text-kiosk-base text-slate-500">請選擇一個對話開始聊天，或按「新對話」找經銷商／管理員聊聊</p>
            )}
          </div>
        </div>
      )}
    </CenteredModal>
  );
}
