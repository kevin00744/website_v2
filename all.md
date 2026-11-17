# 專案檔案說明（all.md）

> 最後更新：2026-11-17
> 說明專案裡每個重要檔案 / 資料夾的用途，方便修改時知道該改哪裡。架構與流程見 [SYSTEM.md](./SYSTEM.md)，操作見 [Start.md](./Start.md)。

---

## 1. 根目錄

| 檔案 | 用途 |
|------|------|
| `docker-compose.prod.yml` | **正式環境**：`db`、`api`、`web` 三個容器，project 名稱 `website_v2_prod`，自動重啟 |
| `deploy.sh` | 一鍵部署：備份 → 建置 API / 網站 → 換版 → 重啟 → 檢查 |
| `.env` | 環境變數（網域、資料庫密碼、JWT、LINE），不進版控 |
| `docker-compose.yml`、`docker/nginx/` | 舊的開發用設定（自簽憑證），正式環境不使用；正式 HTTPS 由主機 nginx + Let's Encrypt 負責 |
| `package.json` | npm workspace（`apps/*`、`packages/*`） |
| `.trail/learnings/` | 開發過程的決策、排除過的做法與注意事項 |
| `README.md`、`Start.md`、`SYSTEM.md`、`all.md` | 文件 |

---

## 2. `apps/api`（NestJS 後端）

| 檔案 / 資料夾 | 用途 |
|------|------|
| `prisma/schema.prisma` | 全部資料表設計 |
| `prisma/migrations/` | migration 歷程；API 啟動時自動 `migrate deploy` |
| `dist/` | 建置輸出，正式環境執行 `node dist/src/main.js` |
| `storage/customers/<id>/` | 顧客的同意書 PDF（`disclaimer.pdf`）與照片 |
| `storage/cms/uploads/` | 舊 CMS 上傳檔 |
| `assets/fonts/NotoSansTC-Regular.ttf` | PDF 用中文字型 |
| `scripts/` | 一次性維運腳本（見 Start.md 第五節） |
| `richmenu.png` | LINE 圖文選單圖片（`scripts/line-richmenu.ts` 使用） |

### `src/` 模組

| 模組 | 用途 |
|------|------|
| `main.ts`、`app.module.ts` | 進入點（port 3000、前綴 `/api/v2`、CORS）、匯入所有模組 |
| `auth/` | 登入、refresh token、JwtAuthGuard、RolesGuard、SystemAdminGuard、`role-access.util.ts` |
| `users/`、`stores/` | 帳號、分店、員工、功能開關 |
| `customers/` | 顧客 CRUD、錢包、課程列表、療程紀錄、同意書簽署（`customer-disclaimer.service.ts`）、PDF 排版（`disclaimer-pdf.util.ts`，含 `CURRENT_LAYOUT_VERSION`） |
| `consent-templates/` | 同意書管理（版本、啟用、PDF 預覽） |
| `customer-courses/` | 課程退費、退課轉儲值、課程轉換、退費試算 |
| `customer-transactions/` | 交易主表 helper（`transaction-ledger.ts`）、交易列表、刪除回溯 |
| `service-records/` | POS 結帳（扣堂先買先用、可跨份）、查詢、核銷還原 |
| `promotion-plans/` | 套裝方案 CRUD 與購買（可調整金額 / 堂數） |
| `appointments/` | 預約 CRUD、撞期檢查、LINE 預約可見範圍 |
| `line/` | Webhook、LIFF、後台管理、Flex 訊息、推播提醒 |
| `financial/`、`petty-cash/` | 收支、日結、CSV、外包給付、備用金 |
| `inventory/`、`attendance/`、`service-items/`、`contact/`、`chat/` | 庫存、打卡考勤、服務品項、聯絡訊息、即時通訊 |
| `signature/` | 簽名雜湊與驗證工具 |
| `common/` | `AppError`、例外過濾器、`phone.util.ts`（電話正規化）、上傳工具 |
| `prisma/` | `PrismaService` |

---

## 3. `apps/web`（Next.js 前端）

| 檔案 / 資料夾 | 用途 |
|------|------|
| `next.config.js` | 轉譯共用套件、CMS 圖片轉發、pdf.js 的 `canvas` 別名 |
| `tailwind.config.js` | kiosk 色票與字級；`xs` / `sm` 字級加大、灰字加深 |
| `middleware.ts` | 未登入導向 `/login`、部分頁面的角色限制 |
| `public/manifest.json`、`public/icons/` | 加入主畫面設定與圖示（含 180×180 apple-touch-icon） |
| `app/layout.tsx` | 全域 layout、PWA meta、文字大小啟動腳本 |
| `app/globals.css` | 文字大小（`html[data-text-size]`）、安全區域 `.pt-safe` / `.pb-safe` |

### `app/(admin)/` 頁面

| 路徑 | 用途 |
|------|------|
| `login/` | 登入 |
| `admin/` | 首頁 |
| `customers/` | 顧客資料 |
| `calendar/` | 預約行事曆 |
| `consent-templates/` | 同意書管理 |
| `financial/`、`manager-dashboard/`、`petty-cash/`、`expenses/` | 財務、考勤業績、備用金、支出 |
| `store-staff/`、`store-service-items/`、`promotion-plans/`、`store-settings/` | 員工、服務品項、方案、分店設定 |
| `line/`、`line-test/` | LINE 後台管理、測試頁 |
| `attendance/`、`inventory/`、`settings/`、`users/`、`stores/`、`contact-*`、`chat-contacts/` | 打卡、庫存、個人設定（含 PIN）、帳號、分店、聯絡訊息、聊天聯絡人 |
| `app/liff/` | 顧客在 LINE 開啟的頁面：`bind`、`me`、`booking` |

### `components/admin/`

| 元件 | 用途 |
|------|------|
| `AdminShell.tsx` | 側欄、手機頂部列、文字大小、安裝提示；`/login` 不套外框 |
| `AccountSwitcher.tsx` | 多帳號 PIN 切換、登出 |
| `TextSizeControl.tsx` | 文字大小（側欄三格「A」、手機「Aa」浮層） |
| `InstallHint.tsx` | iOS「加入主畫面」提示 |
| `PdfViewer.tsx` | iPhone / iPad 的 PDF 檢視器（pdf.js，可捲動、分享 / 儲存） |
| `calendar/` | `CalendarViews`（時間格 / 月曆）、`AppointmentFormModal`（新增 / 編輯預約）、`AppointmentDetailModal` |
| `customers/CustomerDetailDrawer.tsx` | 顧客詳細資料（基本資料、同意書、使用紀錄、課程管理、交易紀錄） |
| `customers/POSCheckoutModal.tsx` | POS 結帳 |
| `customers/AdjustQuickPicks.tsx` | 打折 / 折價券 / 折抵快速選單（結帳、退費共用） |
| `customers/TransactionsTab.tsx`、`TransactionDetailModal.tsx` | 交易紀錄、歷程、刪除回溯 |
| `customers/CourseRefundModal.tsx` | 課程退費 / 退課轉儲值 |
| `customers/CourseConvertModal.tsx` | 課程轉換 |
| `customers/ExosomeConsentModal.tsx`、`DisclaimerSignSection.tsx`、`SignatureCanvasStep.tsx`、`StaffSignatureStep.tsx`、`InlineSignaturePad.tsx` | 同意書雙方簽署與簽名板 |
| `customers/NewCustomerWizard.tsx`、`RecentlyDeletedModal.tsx` | 新增顧客、最近刪除 |
| `kiosk/` | 共用 UI：`CenteredModal`、`KioskButton`、`KioskInput`、`KioskSelect`、`MaskedInput`、`PinPad` |

### `lib/`

| 檔案 | 用途 |
|------|------|
| `api-client.ts` | `apiRequest()`、`apiRequestBlob()`（支援 POST）、自動用 refresh token 換新 |
| `auth.ts`、`auth-api.ts`、`multi-account.ts` | 登入狀態、登入 API、多帳號 PIN |
| `navigationConfig.ts` | 側欄項目與角色限制 |
| `*-api.ts` | 各模組 API client（customers、appointments、customer-transactions、consent-templates、service-records、promotion-plans、financial、petty-cash、line-admin、liff 等） |
| `calendar-utils.ts` | 日期工具、營業時間 `BUSINESS_HOURS`、服務人員配色 |
| `pdf-viewer.ts` | 開 PDF（電腦開新分頁、iPhone / iPad 用檢視器） |
| `pwa.ts` | 判斷 iOS / 主畫面模式 |
| `text-size.ts` | 文字大小設定 |
| `format.ts`、`use-debounce.ts` | 格式化、debounce |

---

## 4. `packages/`（前後端共用）

| 檔案 | 用途 |
|------|------|
| `copy/zh-TW.ts` | 錯誤碼 → 中文訊息。新增 `AppError` 代碼時要在這裡補一筆 |
| `shared-types/` | `auth.ts`、`customer.ts`、`store.ts`、`user.ts` 等共用型別與 Zod schema |
