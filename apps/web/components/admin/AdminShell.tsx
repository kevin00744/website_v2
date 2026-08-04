'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConversationSummary, InboxUpdatedEvent } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { clearAuth, getAuthUser, type AuthUser } from '@/lib/auth';
import { listConversations } from '@/lib/chat-api';
import { disconnectChatSocket, getChatSocket } from '@/lib/chat-socket';
import { NAVIGATION_CONFIG } from '@/lib/navigationConfig';
import { useStoreFeatures, hasFeature } from '@/hooks/useStoreFeatures';
import { KioskButton } from './kiosk/KioskButton';
import { ChatInboxModal } from './chat/ChatInboxModal';

const ROLE_LABEL: Record<AuthUser['role'], string> = {
  system_admin: '系統管理員',
  admin: '管理員',
  editor: '編輯',
  dealer: '經銷商',
  manager: '店長',
  staff: '服務人員',
};

function sumUnread(conversations: ConversationSummary[]): number {
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
}

/**
 * iPad/桌機：固定側邊欄 + 內容區。
 * 手機（<768px）：頂部列 + 漢堡選單，點開後蓋滿全螢幕（避免擠成一排小字看不清楚）。
 *
 * 選單渲染邏輯：遍歷 NAVIGATION_CONFIG，雙層 filter：
 * 1. roleGuard：角色不符直接排除
 * 2. featureKey：分店未啟用此功能排除（admin/system_admin 自動通過 hasFeature 超集邏輯）
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState<AuthUser>();
  const storeFeatures = useStoreFeatures();

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const conversations = await listConversations();
      setUnreadCount(sumUnread(conversations));
    } catch (error) {
      // 收件箱未讀數只是個小提示，拿不到就維持原值，不打擾使用者跳錯誤訊息
      if (!(error instanceof ApiError)) throw error;
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    void refreshUnreadCount();

    // 整個 admin 區域共用同一條連線（getChatSocket 是 singleton）；這裡訂閱的是
    // 「不含訊息內容、只是個信號」的 inbox:updated 事件——即使使用者還沒打開過某個對話，
    // 側邊欄未讀數也能即時更新，不用每隔幾秒就打 REST API 輪詢。
    const socket = getChatSocket();
    function handleInboxUpdated(_payload: InboxUpdatedEvent) {
      void refreshUnreadCount();
    }
    socket.on('inbox:updated', handleInboxUpdated);

    return () => {
      socket.off('inbox:updated', handleInboxUpdated);
    };
  }, [user, refreshUnreadCount]);

  function handleLogout() {
    disconnectChatSocket();
    clearAuth();
    window.location.href = '/login';
  }

  function handleChatClosed() {
    setChatOpen(false);
    void refreshUnreadCount();
  }

  // 雙層 filter：先角色守門，再 feature 守門
  const navItems = user
    ? NAVIGATION_CONFIG.filter((item) => {
        if (item.roleGuard && !item.roleGuard(user.role)) return false;
        if (item.featureKey && !hasFeature(storeFeatures, item.featureKey, user.role)) return false;
        return true;
      })
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-slate-200 md:bg-white">
        <div className="px-6 py-6 text-kiosk-lg font-bold text-kiosk-primary">店員後台</div>
        <nav className="flex flex-col gap-1 px-3">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex min-h-kiosk-sm items-center rounded-kiosk px-4 text-kiosk-base font-semibold text-slate-700 hover:bg-kiosk-primary/10"
            >
              {item.label}
            </a>
          ))}
          {user && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex min-h-kiosk-sm items-center justify-between rounded-kiosk px-4 text-kiosk-base font-semibold text-slate-700 hover:bg-kiosk-primary/10"
            >
              <span>內部訊息</span>
              {unreadCount > 0 && (
                <span className="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-kiosk-danger px-2 text-sm font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </nav>
        {user && (
          <div className="mt-auto flex flex-col gap-3 border-t border-slate-200 p-4">
            <div className="text-kiosk-base text-slate-600">
              {user.name}（{ROLE_LABEL[user.role]}）
            </div>
            <KioskButton variant="ghost" fullWidth onClick={handleLogout}>
              登出
            </KioskButton>
          </div>
        )}
      </aside>

      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="text-kiosk-base font-bold text-kiosk-primary">店員後台</span>
        <div className="flex items-center gap-2">
          {user && (
            <button
              type="button"
              aria-label="內部訊息"
              onClick={() => setChatOpen(true)}
              className="relative flex h-12 w-12 items-center justify-center rounded-kiosk text-2xl"
            >
              💬
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-kiosk-danger px-1 text-xs font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            aria-label="開啟選單"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-kiosk text-2xl"
          >
            ☰
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="text-kiosk-base font-bold text-kiosk-primary">選單</span>
            <KioskButton variant="ghost" onClick={() => setMobileNavOpen(false)} aria-label="關閉選單">
              ✕
            </KioskButton>
          </div>
          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className="flex min-h-kiosk items-center rounded-kiosk bg-slate-50 px-5 text-kiosk-base font-semibold text-slate-800"
              >
                {item.label}
              </a>
            ))}
          </nav>
          {user && (
            <div className="border-t border-slate-200 p-4">
              <p className="mb-3 text-kiosk-base text-slate-500">
                {user.name}（{ROLE_LABEL[user.role]}）
              </p>
              <KioskButton variant="ghost" fullWidth onClick={handleLogout}>
                登出
              </KioskButton>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 px-4 py-4 md:px-8 md:py-8">{children}</main>

      {user && (
        <ChatInboxModal
          open={chatOpen}
          onClose={handleChatClosed}
          currentUserId={user.id}
          onConversationsRefreshed={(conversations) => setUnreadCount(sumUnread(conversations))}
        />
      )}
    </div>
  );
}
