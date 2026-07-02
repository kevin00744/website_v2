export type AnnouncementType = 'info' | 'warning' | 'urgent';

export interface AnnouncementBlockProps {
  text: string;
  type: AnnouncementType;
}

/** 對應不同緊急程度的背景色，通常放在頁面最上方第一個區塊 */
const TYPE_CLASS: Record<AnnouncementType, string> = {
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  urgent: 'bg-red-50 text-red-800 border-red-300',
};

export function AnnouncementBlock({ text, type }: AnnouncementBlockProps) {
  if (!text) return null;
  return (
    <div className={`w-full border-b px-6 py-3 text-center text-sm font-semibold md:text-base ${TYPE_CLASS[type]}`}>{text}</div>
  );
}
