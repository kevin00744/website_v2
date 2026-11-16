import { redirect } from 'next/navigation';

/** LIFF Endpoint 根路徑：預設進「我的資料」 */
export default function LiffIndex() {
  redirect('/liff/me');
}
