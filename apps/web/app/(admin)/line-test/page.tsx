import { redirect } from 'next/navigation';

/** 舊路徑：「LINE 測試」頁已改名為「LINE」 */
export default function LineTestRedirect() {
  redirect('/line');
}
