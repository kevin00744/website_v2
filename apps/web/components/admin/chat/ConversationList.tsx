'use client';

import { CONVERSATION_TYPE_LABEL, type ConversationSummary } from '@website-v2/shared-types';
import { formatDate } from '@/lib/format';

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId?: number;
  onSelect: (conversationId: number) => void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  if (conversations.length === 0) {
    return <p className="text-kiosk-base text-slate-500">目前沒有任何對話</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {conversations.map((conversation) => {
        const isActive = conversation.id === selectedId;
        return (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={`flex flex-col gap-1 rounded-kiosk border-2 p-4 text-left transition-colors ${
              isActive ? 'border-kiosk-primary bg-kiosk-primary/5' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-kiosk-base font-bold text-slate-900">{conversation.title}</span>
              {conversation.unreadCount > 0 && (
                <span className="flex min-h-6 min-w-6 items-center justify-center rounded-full bg-kiosk-danger px-2 text-sm font-bold text-white">
                  {conversation.unreadCount}
                </span>
              )}
            </div>
            <span className="text-kiosk-base text-slate-500">{CONVERSATION_TYPE_LABEL[conversation.type]}</span>
            {conversation.lastMessage && (
              <span className="truncate text-kiosk-base text-slate-600">
                {conversation.lastMessage.senderName}：{conversation.lastMessage.body}
              </span>
            )}
            <span className="text-kiosk-base text-slate-400">{formatDate(conversation.updatedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
