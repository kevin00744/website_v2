'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, MessageReadEvent } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { listMessages } from '@/lib/chat-api';
import { getChatSocket } from '@/lib/chat-socket';
import { formatDate } from '@/lib/format';
import { KioskButton } from '../kiosk/KioskButton';

interface ConversationThreadProps {
  conversationId: number;
  currentUserId: number;
}

/**
 * 進入聊天室的流程：① 先用 REST 拿歷史訊息（分頁/離線也看得到），② 同時送出 conversation:join
 * 讓後端把這個 socket 加入該對話的 room（之後新訊息才會即時收到）。
 * 這個元件不負責管理 socket 連線本身（getChatSocket() 是整個 admin 區域共用的單一連線），
 * 只負責訂閱/取消訂閱跟這個 conversationId 有關的事件。
 */
export function ConversationThread({ conversationId, currentUserId }: ConversationThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>();
  const [loadError, setLoadError] = useState<string>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 中文（或其他需要選字的）輸入法在「按 Enter 確認選字」時，瀏覽器也會觸發同一個 keydown 事件，
  // 如果不分辨這個狀態，就會在選字還沒結束時把當下還沒更新完的字串送出去——這個旗標用來分辨
  // 「現在這個 Enter 是選字用的」還是「真的要送出訊息」。
  const isComposingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setMessages(undefined);
    setLoadError(undefined);

    async function loadHistory() {
      try {
        const result = await listMessages(conversationId);
        if (active) setMessages(result);
      } catch (error) {
        if (active) setLoadError(error instanceof ApiError ? error.message : '載入訊息紀錄失敗，請稍後再試');
      }
    }
    void loadHistory();

    const socket = getChatSocket();
    socket.emit('conversation:join', { conversationId });

    function handleReceived(message: ChatMessage) {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => (prev ? [...prev, message] : [message]));
    }

    function handleRead(payload: MessageReadEvent) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev?.map((message) => (payload.messageIds.includes(message.id) ? { ...message, status: 'read' } : message)),
      );
    }

    socket.on('message:received', handleReceived);
    socket.on('message:read', handleRead);

    return () => {
      active = false;
      socket.off('message:received', handleReceived);
      socket.off('message:read', handleRead);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

    // 進到這個對話、或有新訊息進來時，自動回報「我已讀到最新一筆」——
    // 後端 markRead 對自己送的訊息是 no-op，所以這裡不用特別判斷最後一筆是不是自己發的。
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      getChatSocket().emit('message:read', { conversationId, upToMessageId: lastMessage.id });
    }
  }, [messages, conversationId]);

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    // 之後要接 S3/MinIO 附件上傳時，這裡多帶一個 attachmentUrl 欄位即可，
    // 後端 ChatService.createMessage 跟 Message schema 都已經預留好這個欄位。
    getChatSocket().emit('message:send', { conversationId, body });
    setDraft('');
    setSending(false);
  }

  if (loadError) {
    return (
      <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
        ⚠️ {loadError}
      </p>
    );
  }

  if (!messages) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 overflow-y-auto rounded-kiosk bg-slate-50 p-4">
        {messages.length === 0 && <p className="text-kiosk-base text-slate-500">還沒有任何訊息，開始聊聊吧</p>}
        <div className="flex flex-col gap-3">
          {messages.map((message) => {
            const isMine = message.senderId === currentUserId;
            return (
              <div key={message.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <span className="text-kiosk-base text-slate-500">{message.senderName}</span>
                <div
                  className={`max-w-[80%] rounded-kiosk px-4 py-2 text-kiosk-base ${
                    isMine ? 'bg-kiosk-primary text-white' : 'bg-white text-slate-900'
                  }`}
                >
                  {message.body}
                </div>
                <span className="text-kiosk-base text-slate-400">
                  {formatDate(message.createdAt)}
                  {isMine && message.status === 'read' ? ' · 已讀' : ''}
                </span>
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(event) => {
            // event.nativeEvent.isComposing 是跨瀏覽器最可靠的判斷方式，isComposingRef 是給某些
            // 舊版瀏覽器（isComposing 不一定即時更新）多一層保險，兩個都檢查才不會漏放過選字中的 Enter。
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !isComposingRef.current) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="輸入訊息…"
          className="min-h-kiosk flex-1 rounded-kiosk border-4 border-slate-300 bg-white px-5 text-kiosk-base text-slate-900 outline-none focus:border-kiosk-primary"
        />
        <KioskButton variant="primary" onClick={handleSend} disabled={sending || !draft.trim()}>
          送出
        </KioskButton>
      </div>
    </div>
  );
}
