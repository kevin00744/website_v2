import type { Config, Slot } from '@puckeditor/core';
import { HeroBlock, type HeroBlockProps } from '@/components/blocks/HeroBlock';
import { RichTextBlock, type RichTextBlockProps } from '@/components/blocks/RichTextBlock';
import { ImageBlock, type ImageBlockProps } from '@/components/blocks/ImageBlock';
import { AnnouncementBlock, type AnnouncementBlockProps } from '@/components/blocks/AnnouncementBlock';
import { ButtonBlock, type ButtonBlockProps } from '@/components/blocks/ButtonBlock';
import { CarouselBlock, type CarouselBlockProps } from '@/components/blocks/CarouselBlock';
import { ContactFormBlock, type ContactFormBlockProps } from '@/components/blocks/ContactFormBlock';
import { ArticleListBlock, type ArticleListBlockProps } from '@/components/blocks/ArticleListBlock';
import { FaqListBlock, type FaqListBlockProps } from '@/components/blocks/FaqListBlock';
import { ColumnsBlock, type ColumnsLayout } from '@/components/blocks/ColumnsBlock';
import { RawHtmlBlock, type RawHtmlBlockProps } from '@/components/blocks/RawHtmlBlock';
import { ImageUploadField } from '@/components/admin/cms/ImageUploadField';
import { CategoryPageSelectField } from '@/components/admin/cms/CategoryPageSelectField';

export type PuckBlockProps = {
  Hero: HeroBlockProps;
  RichText: RichTextBlockProps;
  Image: ImageBlockProps;
  Announcement: AnnouncementBlockProps;
  Button: ButtonBlockProps;
  Carousel: CarouselBlockProps;
  ContactForm: ContactFormBlockProps;
  ArticleList: ArticleListBlockProps;
  FaqList: FaqListBlockProps;
  /** col1/col2/col3 存的是 Puck 的 Slot 原始資料（未解析的巢狀區塊陣列），render 時 Puck 會自動轉成可呼叫的元件 */
  Columns: { layout: ColumnsLayout; col1: Slot; col2: Slot; col3: Slot };
  RawHtml: RawHtmlBlockProps;
};

/**
 * 整個拖拉編輯器「能放什麼區塊、每個區塊能填什麼欄位」都在這份設定裡決定——管理員只能從這個清單挑
 * 預先做好的區塊，右側欄只會出現這裡列出的表單欄位，不會出現任何 CSS/樣式相關的控制項，
 * 這就是區塊化（component-based）跟 GrapesJS 那種自由畫布（canvas-based）的根本差異。
 *
 * render 用的元件都跟前台 BlockRenderer.tsx 渲染正式頁面時用的是同一份，保證「編輯器裡看到的預覽」
 * 跟「存檔發布後的正式畫面」永遠長得一樣，不會有編輯器跟前台各自一套渲染邏輯導致跑版不一致的風險。
 * 這個檔案本身沒有任何 hooks/瀏覽器 API，不需要 'use client'，可以同時被 client（編輯器）跟
 * server（前台 RSC）兩種元件 import；個別區塊元件如果自己需要瀏覽器 API（如 CarouselBlock 用到
 * embla-carousel-react 的 hook），會在那個元件檔案自己標 'use client'，不影響這份設定檔本身。
 *
 * imageUrl 欄位用 type:'custom' 接 ImageUploadField（'use client'）：這只會出現在
 * fields.imageUrl.render（編輯器右側表單欄位），跟 components[type].render（畫面正式內容）
 * 是兩條不同的程式路徑——BlockRenderer.tsx 的 Render 只會執行後者，從來不會呼叫到
 * field 的 render，所以即使這個設定檔被前台 Server Component import，也不會在公開頁面
 * 執行到任何上傳相關的程式碼，只是模組圖裡多一個沒被用到的 client reference。
 */
export const puckConfig: Config<PuckBlockProps> = {
  /**
   * RawHtml 故意歸進 `other` 這個保留分類並設 visible: false——不要讓它出現在管理員拖拉選區塊
   * 用的「新增區塊」清單裡（那是「新增類別」的使用方式，使用者明確要求不要這樣做）。
   * 它還是一個正常註冊、可以渲染/可以編輯欄位的元件，只是「插入」這個動作改成由
   * InsertHtmlButton.tsx（掛在 Puck 編輯器頂部工具列的按鈕，見 ContentEditorOverlay.tsx 的
   * overrides.headerActions）直接呼叫 dispatch({ type: 'insert', componentType: 'RawHtml', ... })
   * 程式化插入，管理員是「按一個按鈕」就直接進入 HTML 編輯，不是去區塊清單裡找一個新類別。
   */
  categories: {
    basic: {
      title: '基本內容',
      components: ['Hero', 'RichText', 'Image', 'Announcement'],
    },
    interactive: {
      title: '互動元件',
      components: ['Button', 'Carousel', 'ContactForm'],
    },
    dynamic: {
      title: '動態內容',
      components: ['ArticleList', 'FaqList'],
    },
    layout: {
      title: '排版',
      components: ['Columns'],
    },
    other: {
      visible: false,
      components: ['RawHtml'],
    },
  },
  components: {
    Hero: {
      label: 'Hero 大圖看板',
      fields: {
        title: { type: 'text', label: '主標題' },
        subtitle: { type: 'text', label: '副標題（選填）' },
        imageUrl: { type: 'custom', label: '背景圖片（選填）', render: ({ value, onChange }) => <ImageUploadField value={value} onChange={onChange} /> },
      },
      defaultProps: {
        title: '輸入主標題',
        subtitle: '',
        imageUrl: '',
      },
      render: ({ title, subtitle, imageUrl }) => <HeroBlock title={title} subtitle={subtitle} imageUrl={imageUrl} />,
    },
    RichText: {
      label: '文字內容區',
      fields: {
        text: { type: 'textarea', label: '內容文字' },
      },
      defaultProps: {
        text: '輸入內容文字',
      },
      render: ({ text }) => <RichTextBlock text={text} />,
    },
    Image: {
      label: '單張圖片',
      fields: {
        imageUrl: { type: 'custom', label: '圖片', render: ({ value, onChange }) => <ImageUploadField value={value} onChange={onChange} /> },
        alt: { type: 'text', label: '替代文字（給螢幕閱讀器/SEO用）' },
        imageFit: {
          type: 'select',
          label: '顯示方式',
          options: [
            { label: '裁切填滿（cover）', value: 'cover' },
            { label: '完整顯示（contain）', value: 'contain' },
          ],
        },
        width: { type: 'text', label: '顯示寬度（例如 50%、300px、100%）' },
        align: {
          type: 'select',
          label: '對齊方式（寬度縮小時才看得出差異）',
          options: [
            { label: '靠左', value: 'left' },
            { label: '置中', value: 'center' },
            { label: '靠右', value: 'right' },
          ],
        },
        rounded: { type: 'radio', label: '圓角', options: [{ label: '開', value: true }, { label: '關', value: false }] },
        shadow: { type: 'radio', label: '陰影', options: [{ label: '開', value: true }, { label: '關', value: false }] },
      },
      defaultProps: {
        imageUrl: '',
        alt: '',
        imageFit: 'cover',
        width: '100%',
        align: 'center',
        rounded: false,
        shadow: false,
      },
      render: ({ imageUrl, alt, imageFit, width, align, rounded, shadow }) => (
        <ImageBlock imageUrl={imageUrl} alt={alt} imageFit={imageFit} width={width} align={align} rounded={rounded} shadow={shadow} />
      ),
    },
    Announcement: {
      label: '公告橫幅',
      fields: {
        text: { type: 'text', label: '公告文字' },
        type: {
          type: 'select',
          label: '緊急程度',
          options: [
            { label: '一般', value: 'info' },
            { label: '警告', value: 'warning' },
            { label: '緊急', value: 'urgent' },
          ],
        },
      },
      defaultProps: {
        text: '輸入公告內容',
        type: 'info',
      },
      render: ({ text, type }) => <AnnouncementBlock text={text} type={type} />,
    },
    Button: {
      label: '連結按鈕',
      fields: {
        label: { type: 'text', label: '按鈕文字' },
        url: { type: 'text', label: '連結網址' },
        variant: {
          type: 'select',
          label: '按鈕樣式',
          options: [
            { label: '主色', value: 'primary' },
            { label: '外框', value: 'outline' },
          ],
        },
        alignment: {
          type: 'select',
          label: '對齊方式',
          options: [
            { label: '靠左', value: 'left' },
            { label: '置中', value: 'center' },
            { label: '靠右', value: 'right' },
          ],
        },
      },
      defaultProps: {
        label: '了解更多',
        url: '',
        variant: 'primary',
        alignment: 'center',
      },
      render: ({ label, url, variant, alignment }) => <ButtonBlock label={label} url={url} variant={variant} alignment={alignment} />,
    },
    Carousel: {
      label: '廣告圖片輪播',
      fields: {
        images: {
          type: 'array',
          label: '輪播圖片',
          arrayFields: {
            imageUrl: { type: 'custom', label: '圖片', render: ({ value, onChange }) => <ImageUploadField value={value} onChange={onChange} /> },
            link: { type: 'text', label: '點擊後連結（選填）' },
          },
          defaultItemProps: { imageUrl: '', link: '' },
          getItemSummary: (item, index) => item.imageUrl || `圖片 ${(index ?? 0) + 1}`,
        },
      },
      defaultProps: {
        images: [],
      },
      render: ({ images }) => <CarouselBlock images={images} />,
    },
    ContactForm: {
      label: '聯絡表單',
      fields: {
        title: { type: 'text', label: '標題' },
        subtitle: { type: 'text', label: '副標題（選填）' },
        submitButtonText: { type: 'text', label: '送出按鈕文字' },
      },
      defaultProps: {
        title: '聯絡我們',
        subtitle: '',
        submitButtonText: '送出',
      },
      render: ({ title, subtitle, submitButtonText }) => (
        <ContactFormBlock title={title} subtitle={subtitle} submitButtonText={submitButtonText} />
      ),
    },
    ArticleList: {
      label: '最新消息清單（自動帶入文章管理發布的文章）',
      fields: {
        title: { type: 'text', label: '標題' },
        limit: { type: 'number', label: '顯示篇數' },
      },
      defaultProps: {
        title: '最新消息',
        limit: 5,
      },
      render: ({ title, limit }) => <ArticleListBlock title={title} limit={limit} />,
    },
    FaqList: {
      label: '常見問題清單（自動帶入文章管理發布的文章，按 more 看完整說明）',
      fields: {
        title: { type: 'text', label: '標題' },
        categoryPageId: {
          type: 'custom',
          label: '只顯示哪個分類的文章（選填）',
          render: ({ value, onChange }) => <CategoryPageSelectField value={value} onChange={onChange} />,
        },
        limit: { type: 'number', label: '顯示題數' },
      },
      defaultProps: {
        title: '常見問題',
        categoryPageId: undefined,
        limit: 20,
      },
      render: ({ title, categoryPageId, limit }) => <FaqListBlock title={title} categoryPageId={categoryPageId} limit={limit} />,
    },
    Columns: {
      label: '多欄佈局（Columns）',
      fields: {
        layout: {
          type: 'select',
          label: '欄位比例',
          options: [
            { label: '兩欄（1:1）', value: '1-1' },
            { label: '兩欄（1:2）', value: '1-2' },
            { label: '兩欄（2:1）', value: '2-1' },
            { label: '三欄（1:1:1）', value: '1-1-1' },
          ],
        },
        // type: 'slot' 讓這個欄位變成一個可以拖拉放其他區塊進去的巢狀容器（取代手動管理 DropZone zone 字串）
        col1: { type: 'slot', label: '第一欄' },
        col2: { type: 'slot', label: '第二欄' },
        col3: { type: 'slot', label: '第三欄' },
      },
      defaultProps: {
        layout: '1-1',
        col1: [],
        col2: [],
        col3: [],
      },
      render: ({ layout, col1, col2, col3 }) => <ColumnsBlock layout={layout} col1={col1} col2={col2} col3={col3} />,
    },
    RawHtml: {
      label: 'HTML 原始碼（進階）',
      fields: {
        html: { type: 'textarea', label: 'HTML 內容（會直接輸出到頁面上，請小心使用）' },
      },
      defaultProps: {
        html: '',
      },
      render: ({ html }) => <RawHtmlBlock html={html} />,
    },
  },
};
