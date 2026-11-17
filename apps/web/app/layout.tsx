import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TEXT_SIZE_BOOT_SCRIPT } from '@/lib/text-size';

export const metadata: Metadata = {
  title: '璨妍管理系統',
  description: '璨妍生技 ERP 後台',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '璨妍後台',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // 主畫面 App 全螢幕時內容延伸到瀏海 / Home 條，搭配 globals.css 的 .pt-safe / .pb-safe 讓開
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        {/* 文字大小：在畫面繪製前就套用這台裝置的設定，避免閃一下 */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOT_SCRIPT }} />
        {/* PWA：iOS Safari 不讀 manifest.json 的 icons，需要額外的 apple-touch-icon（180×180） */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
