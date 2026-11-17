/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 獨立的 kiosk 色票命名空間，跟官網的視覺色票分開，避免互相干擾。
        kiosk: {
          primary: '#0f766e',
          'primary-dark': '#0b5d56',
          success: '#16a34a',
          danger: '#dc2626',
        },
      },
      // 灰色輔助文字加深一階（只影響文字顏色，不影響 bg-/border- 的灰色）
      textColor: {
        slate: {
          400: '#64748b',
          500: '#475569',
        },
      },
      fontSize: {
        // 灰色輔助文字（說明、日期、標籤）幾乎都是 xs / sm，全站加大一階讓 iPad 上看得清楚
        xs: ['0.875rem', { lineHeight: '1.25rem' }],
        sm: ['1rem', { lineHeight: '1.5rem' }],
        // 後台專用字級，比 Tailwind 預設再放大一階，方便門市人員在 iPad 上閱讀。
        'kiosk-base': ['1.25rem', { lineHeight: '1.75rem' }],
        'kiosk-lg': ['1.5rem', { lineHeight: '2rem' }],
        'kiosk-xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      spacing: {
        // 最小觸控區 64px 起，遠高於一般 44px 標準。
        kiosk: '4rem',
        'kiosk-sm': '3.5rem',
      },
      borderRadius: {
        kiosk: '1rem',
      },
    },
  },
  plugins: [],
};
