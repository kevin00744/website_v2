'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContactMessageSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteContactMessage, listContactMessages, markContactMessageHandled } from '@/lib/contact-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { ForwardMessageModal } from '@/components/admin/contact/ForwardMessageModal';
import { formatDate } from '@/lib/format';

/** 對齊後端 ContactController：admin/system_admin 一律放行；dealer/manager 額外開放（範圍各自限縮） */
function canViewMessages(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'dealer' || role === 'manager';
}

/** 只有經銷商能把體驗諮詢轉給分店；admin/system_admin 不需要轉發功能（這是經銷商的工作流程） */
function canForward(role: AuthUser['role'] | undefined): boolean {
  return role === 'dealer';
}

/** 對齊後端 ContactController 的 admin/messages/:id 刪除路由 @Roles('system_admin')：只有 admin/system_admin 能刪 */
function canDeleteMessage(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 聯絡訊息：admin/system_admin 看全部；dealer 看自己區域的加盟＋體驗諮詢（加盟自己處理，
 * 體驗可以轉給分店）；manager 看已經轉給自己分店的體驗諮詢。打勾「標記已處理」是單純的
 * 待辦狀態，跟 RestockRequest 的「標記完成」同一種 UX 慣例。
 */
export default function ContactMessagesPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [messages, setMessages] = useState<ContactMessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [togglingId, setTogglingId] = useState<number>();
  const [forwardingMessage, setForwardingMessage] = useState<ContactMessageSummary>();
  const [deletingId, setDeletingId] = useState<number>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listContactMessages();
      setMessages(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canViewMessages(user?.role)) {
      void loadMessages();
    }
  }, [checkedAuth, user, loadMessages]);

  async function handleToggleHandled(message: ContactMessageSummary) {
    setTogglingId(message.id);
    try {
      const updated = await markContactMessageHandled(message.id, !message.isHandled);
      setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '更新狀態失敗，請稍後再試');
    } finally {
      setTogglingId(undefined);
    }
  }

  function handleForwarded(updated: ContactMessageSummary) {
    setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function handleDelete(message: ContactMessageSummary) {
    if (!window.confirm(`確定要刪除「${message.name}」的這筆聯絡訊息嗎？這個動作無法復原。`)) return;
    setDeletingId(message.id);
    try {
      await deleteContactMessage(message.id);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除失敗，請稍後再試');
    } finally {
      setDeletingId(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canViewMessages(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  const pending = messages.filter((message) => !message.isHandled);
  const handled = messages.filter((message) => message.isHandled);

  return (
    <div className="flex flex-col gap-8 pb-24 md:pb-0">
      <h1 className="text-kiosk-xl font-bold text-slate-900">聯絡訊息</h1>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}

      {!loading && !loadError && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-kiosk-lg font-bold text-slate-900">待處理（{pending.length}）</h2>
            {pending.length === 0 && <p className="text-kiosk-base text-slate-500">目前沒有待處理的訊息</p>}
            {pending.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onToggleHandled={() => handleToggleHandled(message)}
                togglingId={togglingId}
                onForward={canForward(user?.role) ? () => setForwardingMessage(message) : undefined}
                onDelete={canDeleteMessage(user?.role) ? () => handleDelete(message) : undefined}
                deletingId={deletingId}
              />
            ))}
          </section>

          {handled.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-kiosk-lg font-bold text-slate-900">已處理（{handled.length}）</h2>
              {handled.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  onToggleHandled={() => handleToggleHandled(message)}
                  togglingId={togglingId}
                  onDelete={canDeleteMessage(user?.role) ? () => handleDelete(message) : undefined}
                  deletingId={deletingId}
                />
              ))}
            </section>
          )}
        </>
      )}

      {forwardingMessage && (
        <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(undefined)} onForwarded={handleForwarded} />
      )}
    </div>
  );
}

interface MessageCardProps {
  message: ContactMessageSummary;
  onToggleHandled: () => void;
  togglingId?: number;
  onForward?: () => void;
  onDelete?: () => void;
  deletingId?: number;
}

function MessageCard({ message, onToggleHandled, togglingId, onForward, onDelete, deletingId }: MessageCardProps) {
  const canShowForward = onForward && message.categoryKind === 'experience' && !message.storeId;

  return (
    <div className="flex flex-col gap-2 rounded-kiosk border-2 border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-kiosk-base font-bold text-slate-900">
            {message.name} <span className="ml-1 text-sm font-normal text-slate-500">（{message.categoryName} · {message.city}）</span>
          </span>
          {message.phone && <span className="text-kiosk-base text-slate-600">電話：{message.phone}</span>}
          {message.email && <span className="text-kiosk-base text-slate-600">信箱：{message.email}</span>}
          {message.message && <span className="text-kiosk-base text-slate-600">內容：{message.message}</span>}
          {message.storeName && <span className="text-sm text-slate-400">已轉發給：{message.storeName}{message.forwardedByName && `（${message.forwardedByName} 轉發）`}</span>}
          <span className="text-sm text-slate-400">{formatDate(message.createdAt)}</span>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canShowForward && (
            <KioskButton variant="secondary" onClick={onForward}>
              轉發給分店
            </KioskButton>
          )}
          <KioskButton variant={message.isHandled ? 'ghost' : 'primary'} onClick={onToggleHandled} disabled={togglingId === message.id}>
            {togglingId === message.id ? '處理中…' : message.isHandled ? '取消標記' : '✓ 標記已處理'}
          </KioskButton>
          {onDelete && (
            <KioskButton variant="danger" onClick={onDelete} disabled={deletingId === message.id}>
              {deletingId === message.id ? '刪除中…' : '刪除'}
            </KioskButton>
          )}
        </div>
      </div>
    </div>
  );
}
