'use client';

import { useEffect, useState } from 'react';
import { Puck, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { ApiError } from '@/lib/api-client';
import { puckConfig, type PuckBlockProps } from '@/lib/puck/puck-config';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { InsertHtmlButton } from './InsertHtmlButton';

export type PuckData = Data<PuckBlockProps>;
export const EMPTY_PUCK_DATA: PuckData = { content: [], root: {} };

interface ContentEditorOverlayProps {
  title: string;
  onClose: () => void;
  /** 不知道資料是頁面還是範本——呼叫端（PageContentEditor/TemplateContentEditor）自己決定打哪支 API */
  load: () => Promise<PuckData>;
  save: (data: PuckData) => Promise<void>;
}

/**
 * 全螢幕覆蓋層（z-50）取代一般 Modal——Puck 需要完整的螢幕寬度顯示區塊清單/畫布/設定表單三欄版面，
 * 塞進 CenteredModal 那種置中卡片版面會擠到沒辦法用。
 *
 * 頁面（Page.content）跟範本（PageTemplate.content）存的是同一種 Puck JSON 結構，編輯體驗也完全一樣，
 * 差別只在「存去哪一張表」，所以把 Puck 編輯器本身的接線（載入/存檔/狀態提示）抽成這個共用元件，
 * PageContentEditor/TemplateContentEditor 只負責提供對應的 load/save 函式。
 *
 * 「儲存」用的是 Puck 內建右上角的 Publish 按鈕（onPublish callback），不用自己刻一個存檔按鈕。
 */
export function ContentEditorOverlay({ title, onClose, load, save }: ContentEditorOverlayProps) {
  const [data, setData] = useState<PuckData>();
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof ApiError ? error.message : '載入編輯器失敗，請稍後再試');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load 在呼叫端用 useCallback 穩定下來，這裡只在掛載時跑一次
  }, []);

  async function handlePublish(latestData: PuckData) {
    setSaveError(undefined);
    setSaving(true);
    try {
      await save(latestData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-4">
          <KioskButton variant="ghost" onClick={onClose}>
            ← 返回列表
          </KioskButton>
          <span className="text-kiosk-lg font-bold text-slate-900">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {saveError}
            </span>
          )}
          {saved && !saveError && <span className="text-kiosk-base font-semibold text-kiosk-success">已儲存</span>}
          {saving && <span className="text-kiosk-base text-slate-500">儲存中…</span>}
        </div>
      </div>

      {loadError && (
        <p className="p-6 text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}

      {!loadError && !data && <p className="p-6 text-kiosk-base text-slate-500">載入中…</p>}

      {data && (
        <div className="flex-1 overflow-hidden">
          <Puck
            config={puckConfig}
            data={data}
            onPublish={handlePublish}
            headerTitle={title}
            overrides={{
              // 在 Puck 內建的 Publish 按鈕旁邊多加一顆「＋ 插入 HTML」——直接在圖形介面按一下
              // 就插入一個可以編輯 HTML 的區塊，不是讓管理員去區塊清單裡找一個新類別。
              headerActions: ({ children }) => (
                <>
                  <InsertHtmlButton />
                  {children}
                </>
              ),
            }}
          />
        </div>
      )}
    </div>
  );
}
