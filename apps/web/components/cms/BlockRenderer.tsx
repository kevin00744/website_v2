import { Render, resolveAllData } from '@puckeditor/core/rsc';
// Data 只用 `import type`（純型別、編譯後會被完全移除），不會把完整版 @puckeditor/core 拉進這個
// Server Component 的執行期 bundle——rsc 子路徑（上面那行）才是實際在 runtime 執行的程式碼。
import type { Data } from '@puckeditor/core';
import type { PageContent } from '@website-v2/shared-types';
import { puckConfig, type PuckBlockProps } from '@/lib/puck/puck-config';

interface BlockRendererProps {
  content: PageContent;
}

type PuckData = Data<PuckBlockProps>;

const EMPTY_DATA: PuckData = { content: [], root: {} };

/**
 * 故意不用 dangerouslySetInnerHTML——資料庫存的是 Puck 編輯器存下來的結構化 JSON
 * （{ content: [{ type, props }], root }），不是現成的 HTML 字串。
 *
 * 用 `@puckeditor/core/rsc` 提供的 Render（跟 apps/web/components/admin/cms/PageContentEditor.tsx
 * 用的完整互動編輯器 `@puckeditor/core` 是分開打包的兩個 entry point）：這支只負責「照 puckConfig
 * 裡每個 type 對應的 render 函式畫出對應的 React 元件」，不含任何拖放/編輯邏輯，可以安全地在
 * Server Component 裡執行，不會把整套編輯器 UI 也送進公開頁面的瀏覽器端。
 *
 * render 函式用的是跟編輯器預覽同一份 HeroBlock/RichTextBlock（見 puck-config.tsx），
 * 保證「後台編輯時看到的畫面」跟「前台正式發布的畫面」永遠長得一樣。
 *
 * resolveAllData 是 Columns 區塊（巢狀 slot 排版）需要的額外一步：Render 本身只負責把已經
 * 解析好的資料畫成 React 元件，不會自己把 slot 欄位裡存的原始區塊陣列轉成可呼叫的元件——
 * 沒有先跑這支，Columns 裡面巢狀的區塊會在伺服器端渲染時直接出錯（Unsupported Server
 * Component type: undefined）。沒有用到 Columns 的頁面跑這支幾乎零成本，所以不額外判斷
 * 「這頁有沒有用到 Columns」，所有頁面一律先 resolve 再 Render。
 */
export async function BlockRenderer({ content }: BlockRendererProps) {
  const data = (content?.content ? content : EMPTY_DATA) as unknown as PuckData;
  // resolveAllData 的型別簽章沒有把 puckConfig 的自訂元件型別帶進回傳值（回傳的是預設的
  // DefaultComponents 泛型），但實際執行時就是用我們傳進去的 config 解析，型別上斷言回 PuckData 即可。
  const resolvedData = (await resolveAllData(data, puckConfig)) as unknown as PuckData;
  return <Render config={puckConfig} data={resolvedData} />;
}
