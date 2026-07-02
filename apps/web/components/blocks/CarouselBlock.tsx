'use client';

import useEmblaCarousel from 'embla-carousel-react';

export interface CarouselImageItem {
  imageUrl: string;
  link?: string;
}

export interface CarouselBlockProps {
  images: CarouselImageItem[];
}

/**
 * Embla 是無樣式（unstyled）的輪播引擎，只負責滑動/拖曳邏輯，畫面完全是我們自己的 Tailwind class——
 * 跟區塊化架構的精神一致：管理員只填圖片網址跟連結，不會碰到任何排版/動畫設定。
 * 需要 useEmblaCarousel 這個 hook，所以這個區塊一定要是 client component（前台頁面其他區塊
 * 大多是 server component，Next.js 允許在一個 Server Component 樹裡混搭個別的 client 區塊）。
 */
export function CarouselBlock({ images }: CarouselBlockProps) {
  const [emblaRef] = useEmblaCarousel({ loop: true });

  if (!images || images.length === 0) return null;

  return (
    <section className="w-full overflow-hidden" ref={emblaRef}>
      <div className="flex">
        {images.map((image, index) => {
          const slide = (
            // eslint-disable-next-line @next/next/no-img-element -- 來源是管理員自填的任意網址
            <img src={image.imageUrl} alt="" className="h-[320px] w-full object-cover md:h-[480px]" />
          );
          return (
            <div key={`${image.imageUrl}-${index}`} className="min-w-0 flex-[0_0_100%]">
              {image.link ? <a href={image.link}>{slide}</a> : slide}
            </div>
          );
        })}
      </div>
    </section>
  );
}
