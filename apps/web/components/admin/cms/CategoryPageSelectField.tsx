'use client';

import { useEffect, useState } from 'react';
import type { PageOption } from '@website-v2/shared-types';
import { listCmsPageOptions } from '@/lib/cms-api';

interface CategoryPageSelectFieldProps {
  value?: number;
  onChange: (value: number | undefined) => void;
}

const NO_CATEGORY_VALUE = '';

/**
 * Puck 的自訂欄位（type: 'custom'）：給 FaqList 區塊選「要抓哪一個分類底下的文章」用，
 * 跟 ArticleSettingsModal 裡「放在哪一個頁面底下」是同一份頁面清單（PageOption），
 * 只是這裡是反過來——文章設定畫面選的是「這篇文章屬於誰」，這裡選的是「這個區塊要撈出屬於誰的文章」。
 * 跟 ImageUploadField 一樣，只會被編輯器（client）呼叫，不會出現在前台公開頁面的渲染路徑。
 */
export function CategoryPageSelectField({ value, onChange }: CategoryPageSelectFieldProps) {
  const [options, setOptions] = useState<PageOption[]>([]);

  useEffect(() => {
    listCmsPageOptions()
      .then(setOptions)
      .catch(() => setOptions([])); // 拿不到頁面清單不影響其他欄位填寫，安靜降級成只能選「不分類」
  }, []);

  return (
    <select
      value={value ?? NO_CATEGORY_VALUE}
      onChange={(event) => onChange(event.target.value === NO_CATEGORY_VALUE ? undefined : Number(event.target.value))}
      className="w-full rounded border border-slate-300 p-2 text-sm"
    >
      <option value={NO_CATEGORY_VALUE}>不分類（顯示所有已發布文章）</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.title}
        </option>
      ))}
    </select>
  );
}
