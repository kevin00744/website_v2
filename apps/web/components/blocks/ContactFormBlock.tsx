'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { contactMessageSchema, TAIWAN_CITIES, type ContactCategoryOption, type ContactMessageInput } from '@website-v2/shared-types';
import { resolveApiBaseUrl } from '@/lib/api-client';

export interface ContactFormBlockProps {
  title: string;
  subtitle?: string;
  submitButtonText: string;
}

/**
 * 真正會把資料送進後端的聯絡表單（取代舊版純展示、onSubmit 只 preventDefault 的版本）。
 * 詢問類別（categoryId）從 GET /contact/categories 即時抓（後台「詢問類別管理」新增/下架會
 * 直接反映在這裡，不需要改這個元件）；所在地區固定用台灣縣市清單（TAIWAN_CITIES，跟後端
 * 換算 region 用的是同一份資料，前端不需要、也不會自己算 region，後端收到 city 自己換算）。
 *
 * 'use client' 是因為要呼叫 useState/useForm/useEffect 抓資料並送出表單，跟 ArticleListBlock
 * 同一種「個別區塊自己決定要不要 client-side 邏輯」的慣例，不影響 puck-config.tsx 本身。
 */
export function ContactFormBlock({ title, subtitle, submitButtonText }: ContactFormBlockProps) {
  const [categories, setCategories] = useState<ContactCategoryOption[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactMessageInput>({
    resolver: zodResolver(contactMessageSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    fetch(`${resolveApiBaseUrl()}/contact/categories`)
      .then((response) => {
        if (!response.ok) throw new Error('failed to load categories');
        return response.json();
      })
      .then(setCategories)
      .catch(() => setLoadError('表單載入失敗，請重新整理頁面再試一次'));
  }, []);

  async function onSubmit(values: ContactMessageInput) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error('submit failed');
      setDone(true);
      reset({ name: '', phone: '', email: '', city: '', categoryId: undefined, message: '' });
    } catch {
      setSubmitError('送出失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">{title}</h2>
        {subtitle && <p className="text-slate-600">{subtitle}</p>}
      </div>

      {loadError && <p className="mt-6 text-center text-sm font-semibold text-red-600">{loadError}</p>}

      {!loadError && (
        <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <input
              type="text"
              placeholder="姓名"
              className="min-h-[56px] w-full rounded-xl border-2 border-slate-300 px-4 text-base outline-none focus:border-kiosk-primary"
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-sm font-semibold text-red-600">{errors.name.message}</p>}
          </div>

          <input
            type="tel"
            placeholder="聯絡電話（選填）"
            className="min-h-[56px] w-full rounded-xl border-2 border-slate-300 px-4 text-base outline-none focus:border-kiosk-primary"
            {...register('phone')}
          />

          <div>
            <input
              type="email"
              placeholder="聯絡信箱"
              className="min-h-[56px] w-full rounded-xl border-2 border-slate-300 px-4 text-base outline-none focus:border-kiosk-primary"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-sm font-semibold text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <select
              defaultValue=""
              className="min-h-[56px] w-full rounded-xl border-2 border-slate-300 px-4 text-base outline-none focus:border-kiosk-primary"
              {...register('categoryId', { valueAsNumber: true })}
            >
              <option value="" disabled>
                請選擇詢問類別
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="mt-1 text-sm font-semibold text-red-600">{errors.categoryId.message}</p>}
          </div>

          <div>
            <select
              defaultValue=""
              className="min-h-[56px] w-full rounded-xl border-2 border-slate-300 px-4 text-base outline-none focus:border-kiosk-primary"
              {...register('city')}
            >
              <option value="" disabled>
                請選擇所在地區
              </option>
              {TAIWAN_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            {errors.city && <p className="mt-1 text-sm font-semibold text-red-600">{errors.city.message}</p>}
          </div>

          <textarea
            placeholder="您想說的話（選填）"
            rows={4}
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-base outline-none focus:border-kiosk-primary"
            {...register('message')}
          />

          {submitError && <p className="text-center text-sm font-semibold text-red-600">{submitError}</p>}
          {done && !submitError && <p className="text-center text-sm font-semibold text-kiosk-success">已收到您的訊息，我們會盡快與您聯繫</p>}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[56px] rounded-full bg-kiosk-primary px-8 font-bold text-white hover:bg-kiosk-primary-dark disabled:opacity-60"
          >
            {submitting ? '送出中…' : submitButtonText}
          </button>
        </form>
      )}
    </section>
  );
}
