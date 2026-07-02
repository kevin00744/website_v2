/** 全站共用頁尾，純展示用靜態內容——之後若要讓後台可編輯頁尾文字，再另外加一個「站台設定」資料表即可，目前先給固定版面 */
export function GlobalFooter() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-slate-500">
        <span className="font-semibold text-slate-700">璨妍 tsanyen</span>
        <span>tsanyen582@gmail.com</span>
        <span>&copy; {new Date().getFullYear()} 璨妍 tsanyen. All rights reserved.</span>
      </div>
    </footer>
  );
}
