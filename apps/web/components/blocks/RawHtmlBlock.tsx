export interface RawHtmlBlockProps {
  html: string;
}

/**
 * 給進階使用者（行銷/工程）直接貼 HTML 的逃生口，跟其他「填表單欄位」的區塊化區塊不同——
 * 故意只用 dangerouslySetInnerHTML 整段塞進去，不解析/不過濾，因為這個區塊只有 admin/system_admin
 * 在 Puck 編輯器裡才能新增/編輯（後台頁面管理本身就限定管理員才能進去，見 CmsController 的
 * @Roles('admin')），不是訪客輸入，不需要、也不該過度消毒成普通文字區塊那種安全模型。
 * 管理員要對自己貼進來的 HTML（含其中的 <script>）負責，這是刻意給的彈性，不是疏漏。
 */
export function RawHtmlBlock({ html }: RawHtmlBlockProps) {
  if (!html) return null;
  // eslint-disable-next-line react/no-danger -- 見上方註解，這個區塊存在的目的就是讓管理員直接寫 HTML
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
