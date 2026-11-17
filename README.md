# 璨妍 ERP 後台管理系統

> 版本：website_v2　｜　最後更新：2026-11-17

網址：**https://www.tsanyentest.com**（後台首頁 `/admin`）

詳細操作見 [Start.md](./Start.md)，系統說明見 [SYSTEM.md](./SYSTEM.md)，逐檔說明見 [all.md](./all.md)。

---

## 快速操作（在伺服器上）

專案位置：`/opt/website_v2`

```bash
# 只重新啟動（程式沒改）
cd /opt/website_v2 && docker compose -p website_v2_prod -f docker-compose.prod.yml restart api web

# 改了程式碼：備份 → 建置 → 換版 → 重啟 → 檢查（自動套用資料庫 migration）
bash /opt/website_v2/deploy.sh
```

---

## 系統概述

璨妍生技的**單店 ERP 後台**（璨妍門市，store id 24，代碼 DEFAULT），供店長、員工、會計與總部管理員使用。iPad / iPhone 可「加入主畫面」當 App 全螢幕使用。

| 模組 | 功能 |
|------|------|
| 顧客管理（CRM） | 建檔、同意書雙方電子簽名、療程紀錄、照片、課程、儲值金、交易紀錄 |
| 預約行事曆 | 日（依服務人員）/ 週 / 月檢視，營業時間 13:00–21:00，拖曳改時間，快速帶入顧客 |
| POS 結帳 | 單次消費、扣儲值、扣堂（先買先用、可跨份）、購買套裝方案、直接儲值；結帳時可打折 / 折價券 / 調整堂數 |
| 交易紀錄 | 每筆結帳 / 方案 / 儲值 / 退費都有歷程；系統管理員可刪除並自動回溯 |
| 課程管理 | 退費（現金等）、退課轉儲值、課程轉換 |
| 同意書管理 | 線上編輯同意書內容（版本化），已簽署的保留當時版本 |
| 財務帳務 | 收入 / 支出、日結、CSV 匯出；備用金獨立管理 |
| 打卡 / 考勤 | 上下班打卡、月統計、業績 |
| LINE 官方帳號 | 顧客綁定、查詢堂數 / 儲值金 / 預約、線上預約申請、提醒推播 |
| 帳號管理 | 5 種角色、多帳號 PIN 切換、裝置記住登入 |

---

## 技術棧

| 層次 | 技術 |
|------|------|
| 後端 | NestJS 10（TypeScript），全域前綴 `/api/v2` |
| 前端 | Next.js 14 App Router（TypeScript）、Tailwind CSS |
| 資料庫 | PostgreSQL 16 + Prisma 5 |
| 執行環境 | Docker Compose（`docker-compose.prod.yml`，project 名稱 `website_v2_prod`） |
| 反向代理 | 主機上的 nginx + Let's Encrypt 憑證（certbot 自動續期） |
| PDF | pdf-lib（產生）、pdf.js（iPhone / iPad 上顯示） |
| 認證 | JWT（access + 180 天 refresh token） |

---

## 系統架構

```
瀏覽器 / iPad（加入主畫面）
        │ https://www.tsanyentest.com
        ▼
主機 nginx（Let's Encrypt）
   ├─ /api/、/socket.io/ → 127.0.0.1:3101 → api 容器（NestJS，node dist/src/main.js）
   └─ 其他路徑          → 127.0.0.1:3000 → web 容器（Next.js，next start）
                                              │
                         db 容器（PostgreSQL 16，volume website_v2_prod_db_data）
```

---

## 文件

| 檔案 | 內容 |
|------|------|
| [Start.md](./Start.md) | 部署、重啟、看 log、migration、一次性腳本、備份還原、常見問題 |
| [SYSTEM.md](./SYSTEM.md) | 架構、資料模型、角色權限、API、頁面、核心流程與設計決策 |
| [all.md](./all.md) | 專案每個重要檔案 / 資料夾的用途 |
| `deploy.sh` | 一鍵部署腳本 |
| `.trail/learnings/` | 開發過程留下的決策與注意事項 |
