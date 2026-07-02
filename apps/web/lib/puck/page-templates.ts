import type { Data } from '@puckeditor/core';
import type { PuckBlockProps } from './puck-config';

export type PageTemplateKey = 'blank' | 'news-article' | 'landing-page';

export const PAGE_TEMPLATE_OPTIONS: { value: PageTemplateKey; label: string }[] = [
  { value: 'blank', label: '空白頁面' },
  { value: 'news-article', label: '最新消息版型（公告＋Hero＋文字內容＋消息清單）' },
  { value: 'landing-page', label: '首頁／活動頁版型（輪播＋Hero＋聯絡表單）' },
];

type PuckData = Data<PuckBlockProps>;

function blockId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * 「版型」只是預先排好的一組區塊初始值，本質上跟管理員自己手動一個個拖拉新增區塊完全一樣——
 * 選了版型之後存進 content 的 JSON，跟手動排版出來的結構沒有任何差別。所以套版完全不需要後端
 * 知道「版型」這個概念：純粹是前端在呼叫 POST /admin/pages 之前，自己把對應的初始 JSON 準備好，
 * 當作 content 一起送出（CmsService.createPage 本來就接受 content 這個選填欄位）。
 *
 * landing-page 版型原本規劃是「Carousel + Feature + ContactForm」，但目前的區塊庫還沒有
 * FeatureList 這個區塊（這次任務只擴充了 Image/Announcement/Button/Carousel/ContactForm/NewsList
 * 這 6 種），先用已經存在的 Hero 區塊代替 Feature 的位置；之後補上 FeatureList 區塊時，
 * 只要改這裡的版型定義即可，不影響任何已經建立的頁面。
 */
export function buildTemplateContent(template: PageTemplateKey): PuckData {
  switch (template) {
    case 'news-article':
      return {
        root: {},
        content: [
          { type: 'Announcement', props: { id: blockId('announcement'), text: '最新消息公告', type: 'info' } },
          { type: 'Hero', props: { id: blockId('hero'), title: '最新消息標題', subtitle: '', imageUrl: '' } },
          { type: 'RichText', props: { id: blockId('richtext'), text: '在這裡輸入消息內容' } },
          { type: 'ArticleList', props: { id: blockId('articlelist'), title: '更多消息', limit: 5 } },
        ],
      };
    case 'landing-page':
      return {
        root: {},
        content: [
          { type: 'Carousel', props: { id: blockId('carousel'), images: [] } },
          { type: 'Hero', props: { id: blockId('hero'), title: '活動主標題', subtitle: '活動副標題', imageUrl: '' } },
          { type: 'ContactForm', props: { id: blockId('contactform'), title: '聯絡我們', subtitle: '', submitButtonText: '送出' } },
        ],
      };
    case 'blank':
    default:
      return { root: {}, content: [] };
  }
}
