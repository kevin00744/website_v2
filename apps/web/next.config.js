/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/copy 跟 packages/shared-types 是 workspace 內的原始 TS 套件（沒有預先編譯），
  // 需要讓 Next.js 的編譯器一併處理，否則 import 進來的會是沒轉譯過的 TS 語法。
  transpilePackages: ['@website-v2/copy', '@website-v2/shared-types'],
  async rewrites() {
    return [
      // CMS 圖片故意走「同源」相對路徑，不直接給瀏覽器絕對網址 http://localhost:3101——
      // 一旦使用者不是用 localhost 開這個網站（例如用手機連同一台機器的 LAN IP、或透過
      // tunnel/不同網域開發測試），瀏覽器端的 localhost:3101 完全連不到，圖片就會整批失敗。
      // 這裡讓 Next.js 伺服器自己（在 web 容器內部，永遠連得到 api 容器）幫忙轉發，
      // 不管使用者從哪個網域/IP 開網站，圖片網址都是相對路徑，一定會打回同一個來源。
      {
        source: '/api/v2/cms/uploads/:fileName',
        destination: `${process.env.CMS_API_INTERNAL_URL ?? 'http://api:3000/api/v2'}/cms/uploads/:fileName`,
      },
    ];
  },
};

module.exports = nextConfig;
