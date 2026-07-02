export interface RichTextBlockProps {
  text: string;
}

/** 跟 HeroBlock 一樣是純展示元件，編輯器預覽跟前台正式渲染共用同一份 */
export function RichTextBlock({ text }: RichTextBlockProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <p className="whitespace-pre-wrap text-lg leading-relaxed text-slate-700">{text}</p>
    </section>
  );
}
