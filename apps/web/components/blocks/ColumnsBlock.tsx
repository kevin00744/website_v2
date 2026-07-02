import type { SlotComponent } from '@puckeditor/core';

export type ColumnsLayout = '1-1' | '1-2' | '2-1' | '1-1-1';

const LAYOUT_RATIOS: Record<ColumnsLayout, number[]> = {
  '1-1': [1, 1],
  '1-2': [1, 2],
  '2-1': [2, 1],
  '1-1-1': [1, 1, 1],
};

export interface ColumnsBlockRenderProps {
  layout: ColumnsLayout;
  col1: SlotComponent;
  col2: SlotComponent;
  col3: SlotComponent;
}

/**
 * 多欄佈局：col1/col2/col3 是 Puck 的「slot」欄位（在 puck-config.tsx 設成 `type: 'slot'`）——
 * 這是 Puck 現在官方推薦取代手動管理 DropZone zone 字串的巢狀排版機制，管理員一樣可以把
 * Image/RichText/Button 等區塊拖進每一欄，差別是 Puck 直接把每一欄解析好的內容包成一個
 * 可呼叫的元件（SlotComponent）傳進來，不用我們自己拼 zone id。
 *
 * 這裡用 col1/col2/col3 固定三個欄位（不夠用的欄位由 layout 決定要不要渲染），是因為 Puck 的
 * fields 是靜態結構，沒辦法依 layout 動態長出第三個欄位欄——固定宣告三個、渲染時用 layout
 * 的比例陣列長度決定要顯示幾欄，是在「欄位 schema 固定」跟「畫面欄數可變」之間最簡單的折衷。
 *
 * 公開頁面這邊（BlockRenderer.tsx）渲染前要先呼叫 @puckeditor/core/rsc 的 resolveAllData()
 * 把這些 slot 解析成可渲染的元件，光用 Render 本身不會自動處理巢狀 slot 內容。
 */
export function ColumnsBlock({ layout, col1: Col1, col2: Col2, col3: Col3 }: ColumnsBlockRenderProps) {
  const ratios = LAYOUT_RATIOS[layout] ?? LAYOUT_RATIOS['1-1'];
  const slots = [Col1, Col2, Col3];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 md:flex-row">
      {ratios.map((ratio, index) => {
        // 跟 puck-config.tsx 註解同樣的理由：@puckeditor/core 內部打包了自己的一份 @types/react@19，
        // 跟專案用的 react 18 對不上，SlotComponent 的型別在 TSX 裡會被判定成不合法的 JSX 元件，
        // 純粹是型別宣告衝突，不影響實際執行，這裡用斷言收斂成我們專案的 React 型別。
        const Slot = slots[index] as unknown as () => JSX.Element;
        return (
          <div key={index} style={{ flexGrow: ratio, flexBasis: 0 }} className="min-w-0">
            <Slot />
          </div>
        );
      })}
    </div>
  );
}
