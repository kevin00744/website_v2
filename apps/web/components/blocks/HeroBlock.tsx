export interface HeroBlockProps {
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

/**
 * 純展示用元件，沒有任何 hooks/瀏覽器 API，所以同一份程式碼可以直接被兩邊共用：
 * 編輯器（PageContentEditor，client）拿來當即時預覽、前台公開頁面（BlockRenderer，server）拿來正式渲染。
 * 樣式（Tailwind class）寫死在這裡，管理員只能透過 puck-config.tsx 定義的表單欄位填資料，
 * 不能改版面/CSS——這是「區塊化」設計要解決的問題：不會被拖拉編輯器自由跑版破壞響應式版面。
 */
export function HeroBlock({ title, subtitle, imageUrl }: HeroBlockProps) {
  return (
    <section
      className="relative flex min-h-[420px] flex-col items-center justify-center gap-4 bg-slate-900 px-6 py-20 text-center text-white md:min-h-[520px]"
      style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {imageUrl && <div className="absolute inset-0 bg-black/40" aria-hidden="true" />}
      <div className="relative flex max-w-3xl flex-col items-center gap-4">
        <h1 className="text-3xl font-bold md:text-5xl">{title}</h1>
        {subtitle && <p className="text-lg text-white/90 md:text-xl">{subtitle}</p>}
      </div>
    </section>
  );
}
