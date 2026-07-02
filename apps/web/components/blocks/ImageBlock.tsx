export type ImageAlign = 'left' | 'center' | 'right';

export interface ImageBlockProps {
  imageUrl: string;
  alt: string;
  imageFit: 'cover' | 'contain';
  /** 寬度，管理員自填字串，例如 "50%"、"300px"、"100%"——故意不限制成數字欄位，因為百分比跟像素是兩種不同單位，交給 CSS 直接吃這個字串最簡單 */
  width: string;
  align: ImageAlign;
  rounded: boolean;
  shadow: boolean;
}

const ALIGN_CLASS: Record<ImageAlign, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

/**
 * width 套在外層容器的 style（不是 <img> 本身），<img> 永遠是 w-full h-auto max-w-full——
 * 這樣管理員不管填多誇張的數字（例如 200%），圖片最多也只會撐滿外層容器的寬度，不會在手機上
 * 把版面撐爆。真正決定「圖片實際多大」的是外層容器的 style.width，img 只是乖乖填滿容器。
 *
 * align 用 flex justify-* 控制外層容器在版面上的位置：圖片縮小後（width 給 50% 之類的值）
 * 才會看出置左/置中/置右的差異，圖片本身是 100% 寬時對齊方式不會有視覺差異（本來就撐滿一整排）。
 */
export function ImageBlock({ imageUrl, alt, imageFit, width, align, rounded, shadow }: ImageBlockProps) {
  if (!imageUrl) return null;
  return (
    <section className={`flex w-full ${ALIGN_CLASS[align] ?? ALIGN_CLASS.center}`}>
      <div style={{ width: width || '100%' }} className="max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- CMS 圖片來源是管理員自填的任意網址，無法交給 next/image 做靜態網域白名單檢查 */}
        <img
          src={imageUrl}
          alt={alt}
          className={`h-auto max-h-[600px] w-full max-w-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'} ${
            rounded ? 'rounded-2xl' : ''
          } ${shadow ? 'shadow-lg' : ''}`}
        />
      </div>
    </section>
  );
}
