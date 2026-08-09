# 專案檔案說明（all.md）

> 最後更新：2026-08-09
> 說明專案裡每一個重要檔案/資料夾的功能，方便之後修改時知道該改哪裡。

---

## 1. 根目錄

| 檔案 | 功能 |
|------|------|
| `docker-compose.yml` | 本機開發環境定義：`web`（Next.js）、`api`（NestJS）、`db`（Postgres 16）三個服務。容器主行程為 `tail -f /dev/null`（保持存活），NestJS 和 Next.js **需手動啟動**。 |
| `package.json` | 根目錄 workspace 設定（`apps/*`、`packages/*`）。 |
| `Start.md` | 啟動/關閉/重啟/build 完整操作手冊（含常見問題診斷）。 |
| `SYSTEM.md` | 完整系統說明（架構、DB 模型、API 端點、核心流程、設計決策）。 |
| `README.md` | 快速入門、技術棧、連線資訊、文件索引。 |
| `all.md` | 本檔案，逐檔說明專案結構。 |

---

## 2. `apps/api`（NestJS 後端）

### 根設定

| 檔案 | 功能 |
|------|------|
| `package.json` | 依賴與指令：`npm run build`（nest build，輸出 `dist/src/`）、`start:dev`（watch 模式） |
| `tsconfig.json` | TypeScript 設定，`outDir: ./dist`，strict 模式，輸出實際在 `dist/src/` |
| `nest-cli.json` | Nest CLI 設定（`sourceRoot: src`） |
| `dist/src/main.js` | **production 啟動點**（`node dist/src/main.js`），由 `npm run build` 產生 |

### `prisma/`

| 檔案 | 功能 |
|------|------|
| `schema.prisma` | **整個系統的資料表設計**，含所有 model 和 enum（Role、Region、ConsumptionType 等） |
| `migrations/` | Prisma migration 歷程，每次 schema 變更後追加 |
| `seed.ts` | 種子資料：系統管理員帳號、預設分店、同意書範本 |

### `src/` 各模組

| 模組 | 路徑 | 說明 |
|------|------|------|
| 進入點 | `main.ts` | port 3000，全域前綴 `/api/v2`，啟用 CORS，掛全域例外攔截器 |
| 根模組 | `app.module.ts` | 匯入所有子模組 |
| **auth** | `src/auth/` | JWT 認證（username 登入）、JwtAuthGuard、RolesGuard、`@Roles()`、`@CurrentUser()` |
| **users** | `src/users/` | 帳號 CRUD，帳號建立矩陣（CREATOR_CAN_ASSIGN），`PATCH /users/me` 個人設定，強制重設密碼 |
| **stores** | `src/stores/` | 分店 CRUD，區域代碼自動產生（pg advisory lock 防併發），功能開關（features JSON），負責代理商指派 |
| **customers** | `src/customers/` | 顧客 CRUD（姓名/身分證終身鎖定），顧客編號生成，療程紀錄，同意書 PDF，錢包，課程 |
| **customer-disclaimer** | `src/customers/customer-disclaimer.service.ts` | 同意書補簽流程（服務人員先簽/顧客後簽），PDF 建立與顧客補簽，contentSnapshot 凍結座標 |
| **disclaimer-pdf** | `src/customers/disclaimer-pdf.util.ts` | pdf-lib PDF 生成，embed 電子簽名圖，DisclaimerHeaderData（含 customerCode） |
| **customer-courses** | `src/customer-courses/` | 課程退費轉儲值金（`refund-to-credit`），課程轉換（`convert`） |
| **service-items** | `src/service-items/` | 服務品項 CRUD（全分店通用或分店專屬） |
| **service-records** | `src/service-records/` | POS 服務紀錄，三種消費方式，多重付款，核銷還原（`rollback`） |
| **financial** | `src/financial/` | 財務帳務（FinancialRecord），收入/支出，當日帳務摘要 |
| **petty-cash** | `src/petty-cash/` | 備用金獨立系統（PettyCashLog），手動增減，餘額快照 |
| **inventory** | `src/inventory/` | 各分店庫存，補貨請求（RestockRequest）流程，庫存調撥 |
| **attendance** | `src/attendance/` | 上下班打卡，月份考勤統計，業績統計 |
| **chat** | `src/chat/` | WebSocket 即時通訊，一對一對話，未讀數更新，依角色自動建立聯絡人清單 |
| **contact** | `src/contact/` | 聯絡訊息管理，詢問類別，轉發給分店 |
| **promotion-plans** | `src/promotion-plans/` | 促銷方案 CRUD，購買套餐 |
| **signature** | `src/signature/` | 電子簽名雜湊工具（contentHash + recordHash），tamper detection |
| **prisma** | `src/prisma/` | `PrismaService`（全域 singleton），`onModuleInit` 連線、`onModuleDestroy` 斷線 |
| **common** | `src/common/` | `AppError`（語意化錯誤碼 + statusCode），`GlobalExceptionFilter`（不洩漏 stack），`upload.util`（Multer 設定） |

### 重要設計原則

- **Prisma select 而非 include**：用 `satisfies Prisma.XxxSelect` + `Prisma.XxxGetPayload<{ select: typeof CONST }>` 取得精確型別推斷
- **AppError**：所有業務邏輯錯誤用 `throw new AppError('ERROR_CODE', '訊息', statusCode)`，不拋裸 Error
- **財務雙軌**：外包支付和現金支出同一 transaction 同時寫 `FinancialRecord` + `PettyCashLog`

---

## 3. `apps/web`（Next.js 前端）

### 根設定

| 檔案 | 功能 |
|------|------|
| `package.json` | Next.js 14 依賴，Tailwind CSS，React Hook Form，Zod |
| `next.config.js` | Next.js 設定（API rewrite proxy，靜態檔案路徑） |
| `.next/` | Build 輸出（`npm run build` 產生），`next start apps/web -p 3000` 從這裡啟動 |

### `app/`（路由）

| 路徑 | 說明 |
|------|------|
| `app/page.tsx` | 根路徑 `/` → 重導向 `/admin/login` |
| `app/layout.tsx` | 全域 layout，PWA meta tags |
| `app/(admin)/login/` | 登入頁（username 帳號 + 密碼輸入） |
| `app/(admin)/customers/` | 顧客資料（左側列表 + 右側 CustomerDetailDrawer） |
| `app/(admin)/inventory/` | 庫存管理 |
| `app/(admin)/attendance/` | 打卡頁 |
| `app/(admin)/manager-dashboard/` | 考勤 & 業績統計（店長/會計） |
| `app/(admin)/financial/` | 財務帳務 |
| `app/(admin)/petty-cash/` | 備用金管理 |
| `app/(admin)/expenses/` | 支出管理 |
| `app/(admin)/stores/` | 分店管理（含負責代理商指派） |
| `app/(admin)/store-settings/` | 分店功能設定（店長勾選啟用模組） |
| `app/(admin)/store-staff/` | 員工帳號管理（店長專用） |
| `app/(admin)/store-service-items/` | 服務品項管理 |
| `app/(admin)/promotion-plans/` | 促銷方案管理 |
| `app/(admin)/contact-messages/` | 聯絡訊息（含轉發給分店） |
| `app/(admin)/contact-categories/` | 詢問類別管理（admin 專用） |
| `app/(admin)/users/` | 帳號管理（含負責代理商指派，dealer+） |
| `app/(admin)/chat-contacts/` | 聊天清單管理（admin 專用） |
| `app/(admin)/settings/` | 個人設定（姓名/Email/帳號/電話/密碼） |

### `components/admin/`

| 元件 | 說明 |
|------|------|
| `AdminShell.tsx` | 側欄 shell，依 `navigationConfig` + 角色 + storeFeatures 動態渲染導覽，固定顯示內部訊息按鈕（WebSocket 未讀數） |
| `customers/CustomerDetailDrawer.tsx` | 顧客詳情側拉板（含同意書狀態、POS 按鈕、療程、課程、錢包） |
| `customers/POSCheckoutModal.tsx` | POS 結帳 Modal（三種消費方式、多重付款、電子簽名、exosomeBlocked 邏輯） |
| `customers/ExosomeConsentModal.tsx` | 外泌體同意書補簽 Modal（服務人員 + 顧客雙簽署流程） |
| `customers/TreatmentRecordTab.tsx` | 療程紀錄列表（含照片、核銷還原按鈕） |
| `stores/StoreTable.tsx` | 分店列表（含負責代理商欄位，可點擊指派） |
| `stores/StoreCardList.tsx` | 分店卡片列表（行動裝置用） |
| `users/UserTable.tsx` | 帳號列表（含負責代理商欄位） |
| `users/UserCardList.tsx` | 帳號卡片列表 |
| `shared/AssignDealerModal.tsx` | 指派/更換負責代理商 Modal（分店和帳號共用） |
| `kiosk/` | 共用 UI 元件（KioskButton、KioskInput、KioskModal 等 kiosk 風格元件） |

### `lib/`（API client 與工具）

| 檔案 | 說明 |
|------|------|
| `api-client.ts` | `apiRequest()` 封裝（帶 JWT Cookie），`resolveApiBaseUrl()` 依 `window.location.hostname` 動態組 API URL（**不寫死 localhost**） |
| `auth.ts` | `saveAuth()` / `getAuthUser()` 操作 JWT Cookie，`AuthUser` 型別定義（含 storeFeatures） |
| `navigationConfig.ts` | 統一導覽設定，含 `featureKey`（需分店啟用）和 `roleGuard`（角色守門） |
| `customers-api.ts` | 顧客相關 API 呼叫 |
| `stores-api.ts` | 分店相關 API 呼叫（含 `assignStoreDealer`） |
| `users-api.ts` | 帳號相關 API 呼叫（含 `assignUserDealer`） |
| `service-records-api.ts` | POS 服務紀錄、核銷還原 |
| `petty-cash-api.ts` | 備用金操作 |
| `financial-api.ts` | 財務帳務 |
| `inventory-api.ts` | 庫存管理 |

### `hooks/`

| 檔案 | 說明 |
|------|------|
| `useStoreFeatures.ts` | 讀取當前登入者 `storeFeatures` 的 hook，含 `hasFeature()` 工具函式（admin 永遠通過） |

---

## 4. `packages/`（前後端共用）

### `packages/shared-types/`

| 檔案 | 說明 |
|------|------|
| `auth.ts` | 登入 schema（Zod）、`AuthUser` 型別（含 storeFeatures） |
| `customer.ts` | `CustomerSummary`、`CustomerDetail`（含 disclaimerFullySigned、exosome 相關欄位） |
| `store.ts` | `StoreSummary`（含 `dealerId`、`dealerName`） |
| `user.ts` | `UserSummary`、Role enum、Region enum、帳號建立/更新 schema |
| `service-record.ts` | `ServiceRecord` 型別、付款方式 enum |

> `shared-types` 是 monorepo workspace package（`@website-v2/shared-types`），前後端都可 import，統一型別避免手刻字串造成 typo。

---

## 5. 重要設計慣例（快速參考）

| 問題 | 正確做法 |
|------|---------|
| 瀏覽器端 API URL | `resolveApiBaseUrl()`，**不寫死 localhost** |
| 登入/登出後導頁 | `window.location.href = '/admin'`，不用 `router.push`（避免快取問題） |
| Prisma 含關聯的查詢型別 | `satisfies Prisma.XxxSelect` + `Prisma.XxxGetPayload<{ select: typeof CONST }>` |
| 呼叫空 body 的 PATCH/POST | 帶 `Content-Type: application/json` + body `'{}'`，否則 NestJS 415 |
| Schema 加新欄位後 | 進 api 容器執行 `npx prisma generate` 再重新 build |
| API build 輸出路徑 | `dist/src/main.js`（不是 `dist/main.js`） |
| Web build 啟動指令 | `node_modules/next/dist/bin/next start apps/web -p 3000`（從 `/workspace` 執行） |
