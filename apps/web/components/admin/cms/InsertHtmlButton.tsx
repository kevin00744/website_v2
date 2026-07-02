'use client';

import { usePuck } from '@puckeditor/core';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

/**
 * 掛在 Puck 編輯器頂部工具列（ContentEditorOverlay.tsx 的 overrides.headerActions）的按鈕——
 * 按下去直接在畫布最後面插入一個 RawHtml 區塊，管理員馬上就能在右側欄填 HTML 內容，
 * 不需要去「新增區塊」清單裡找一個叫 HTML 的類別（RawHtml 在 puck-config.tsx 裡故意設成
 * categories.other.visible = false，不會出現在那份清單裡）。這支必須在 <Puck> 的 render tree
 * 內才能呼叫 usePuck()，所以只能透過 overrides 傳進去，不能在 ContentEditorOverlay 外面直接用。
 */
export function InsertHtmlButton() {
  const { appState, dispatch } = usePuck();

  function handleClick() {
    dispatch({
      type: 'insert',
      componentType: 'RawHtml',
      destinationIndex: appState.data.content.length,
      destinationZone: 'root:default-zone',
    });
  }

  return (
    <KioskButton variant="secondary" onClick={handleClick}>
      ＋ 插入 HTML
    </KioskButton>
  );
}
