# 專案檔案說明（all.md）

> 最後更新：2026-11-15
> 說明專案裡每一個重要檔案/資料夾的功能，方便之後修改時知道該改哪裡。

---

## 1. 根目錄

| 檔案 | 功能 |
|------|------|
| `docker-compose.yml` | 四個服務：`nginx`（SSL 反向代理）、`web`（Next.js）、`api`（NestJS）、`db`（Postgres 16）。容器主行程為 `tail -f /dev/null`，NestJS 和 Next.js **需手動啟動**。 |
| `docker/nginx/default.conf` | nginx 設定：port 80 → HTTPS redirect；port 443 → SSL 終止 → proxy 到 web:3000 |
| `docker/nginx/ssl/` | SSL 憑證（自簽）：`selfsigned.crt` + `selfsigned.key` |
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
| `package.json` | 依賴與指令：`npm run build`（nest build，輸出 `dist/src/`） |
| `tsconfig.json` | TypeScript 設定，`outDir: ./dist`，strict 模式 |
| `nest-cli.json` | Nest CLI 設定（`sourceRoot: src`） |
| `dist/src/main.js` | **production 啟動點**（`node dist/src/main.js`），由 `npm run build` 產生 |

### `prisma/`

| 檔案 | 功能 |
|------|------|
| `schema.prisma` | **整個系統的資料表設計**。角色：`system_admin/admin/manager/accountant/staff`（無 dealer/general_agent/editor/region）。email 為 nullable。Store 無 region/dealerId。 |
| `migrations/` | Prisma migration 歷程 |
| `seed.ts` | 種子資料：`kevin00744`（system_admin）+ 璨妍門市（DEFAULT）分店。upsert 用 `where: { username }` 而非 `where: { email }`。 |

### `src/` 各模組

| 模組 | 路徑 | 說明 |
|------|------|------|
| 進入點 | `main.ts` | port 3000，全域前綴 `/api/v2`，啟用 CORS |
| 根模組 | `app.module.ts` | 匯入所有子模組 |
| **auth** | `src/auth/` | JWT 認證（username 登入）、JwtAuthGuard、RolesGuard。`AuthenticatedUser` 型別無 region/dealerId。`auth.service.ts` 登入時查 storeFeatures。 |
| **users** | `src/users/` | 帳號 CRUD。manager 可建 accountant。email 選填。`PATCH /users/me` 個人設定（username/phone/password）。 |
| **stores** | `src/stores/` | 分店 CRUD。無 region/dealer。`setActive()`、`deleteStoreStaff()`、`updateStoreFeatures()`。 |
| **customers** | `src/customers/` | 顧客 CRUD（姓名/身分證終身鎖定），顧客編號生成，療程紀錄，同意書 PDF，錢包，課程 |
| **customer-disclaimer** | `src/customers/customer-disclaimer.service.ts` | 同意書補簽流程（contentSnapshot 凍結座標） |
| **disclaimer-pdf** | `src/customers/disclaimer-pdf.util.ts` | pdf-lib PDF 生成 |
| **customer-courses** | `src/customer-courses/` | 課程退費轉儲值金（`refund-to-credit`），課程轉換（`convert`） |
| **service-items** | `src/service-items/` | 服務品項 CRUD |
| **service-records** | `src/service-records/` | POS 服務紀錄，三種消費方式，多重付款，核銷還原（`rollback`） |
| **financial** | `src/financial/` | 財務帳務（FinancialRecord） |
| **petty-cash** | `src/petty-cash/` | 備用金系統（PettyCashLog），手動增減，設定目標金額 |
| **inventory** | `src/inventory/` | 各分店庫存，補貨請求。已移除 dealer region 篩選。 |
| **attendance** | `src/attendance/` | 上下班打卡，月份考勤統計，業績統計 |
| **chat** | `src/chat/` | WebSocket 即時通訊，一對一對話。已移除 region room 邏輯。 |
| **contact** | `src/contact/` | 聯絡訊息管理（`contact_messages` 仍有 region 欄位，映射台灣縣市→A/B/C，與 AuthenticatedUser.region 無關） |
| **promotion-plans** | `src/promotion-plans/` | 促銷方案 CRUD |
| **signature** | `src/signature/` | 電子簽名雜湊工具 |
| **prisma** | `src/prisma/` | `PrismaService`（全域 singleton） |
| **common** | `src/common/` | `AppError`、`GlobalExceptionFilter`、`upload.util` |

---

## 3. `apps/web`（Next.js 前端）

### 根設定

| 檔案 | 功能 |
|------|------|
| `package.json` | Next.js 14 依賴，Tailwind CSS，React Hook Form，Zod |
| `next.config.js` | Next.js 設定（API rewrite proxy，靜態檔案路徑） |
| `.next/` | Build 輸出，`PORT=3000 next start` 從這裡啟動 |

### `app/`（路由）

| 路徑 | 說明 |
|------|------|
| `app/page.tsx` | 根路徑 `/` → 重導向 `/admin/login` |
| `app/layout.tsx` | 全域 layout，PWA meta tags |
| `app/(admin)/login/` | 登入頁（username + 密碼 + 記住此裝置 checkbox） |
| `app/(admin)/customers/` | 顧客資料（左側列表 + 右側 CustomerDetailDrawer） |
| `app/(admin)/inventory/` | 庫存管理 |
| `app/(admin)/attendance/` | 打卡頁 |
| `app/(admin)/manager-dashboard/` | 考勤 & 業績統計 |
| `app/(admin)/financial/` | 財務帳務 |
| `app/(admin)/petty-cash/` | 備用金（移除 storeName 顯示，含設定目標金額功能） |
| `app/(admin)/expenses/` | 支出管理 |
| `app/(admin)/stores/` | 分店管理 |
| `app/(admin)/store-settings/` | 分店功能設定（店長勾選啟用模組） |
| `app/(admin)/store-staff/` | 員工帳號管理（店長專用） |
| `app/(admin)/store-service-items/` | 服務品項管理 |
| `app/(admin)/promotion-plans/` | 促銷方案管理 |
| `app/(admin)/contact-messages/` | 聯絡訊息 |
| `app/(admin)/contact-categories/` | 詢問類別管理（admin 專用） |
| `app/(admin)/users/` | 帳號管理（admin 用） |
| `app/(admin)/settings/` | 個人設定（4 tabs：基本資料/安全性/分店設定/**切換 PIN**） |

### `components/admin/`

| 元件 | 說明 |
|------|------|
| `AdminShell.tsx` | 側欄 shell。頂部有「帳號管理 / 登出」按鈕開啟 AccountSwitcher。依 `navigationConfig` + 角色 + storeFeatures 動態渲染導覽。 |
| `AccountSwitcher.tsx` | 多帳號切換元件。4 個視圖：帳號列表（含目前帳號）/ PIN 輸入 / 新帳號登入 / 登出確認。 |
| `customers/CustomerDetailDrawer.tsx` | 顧客詳情側拉板 |
| `customers/POSCheckoutModal.tsx` | POS 結帳 Modal |
| `customers/TreatmentRecordTab.tsx` | 療程紀錄（含核銷還原按鈕） |
| `kiosk/PinPad.tsx` | 4 位數 PIN 輸入鍵盤元件 |
| `kiosk/` | 共用 UI 元件（KioskButton、KioskInput、KioskModal 等） |

### `lib/`（API client 與工具）

| 檔案 | 說明 |
|------|------|
| `api-client.ts` | `apiRequest()` + `resolveApiBaseUrl()`（依 `window.location.hostname:3101`，**不寫死 localhost**） |
| `auth.ts` | `saveAuth(token, user, rememberDays?)` / `getAuthUser()` 操作 JWT Cookie。`rememberDays` 預設 1，「記住此裝置」時傳 30。 |
| `multi-account.ts` | 多帳號 localStorage 儲存：`saveAccount(token, user, pin)`、`validatePin(userId, pin)`、`listAccounts()`、`removeAccount(userId)` |
| `navigationConfig.ts` | 統一導覽設定，含 `featureKey` 和 `roleGuard`（已移除 dealer/general_agent 相關項目） |
| `customers-api.ts` | 顧客相關 API 呼叫 |
| `stores-api.ts` | 分店相關 API 呼叫（`updateStoreFeatures` 等） |
| `users-api.ts` | 帳號相關 API 呼叫 |
| `service-records-api.ts` | POS 服務紀錄、核銷還原（`rollbackServiceRecord`） |
| `petty-cash-api.ts` | 備用金操作 |
| `financial-api.ts` | 財務帳務 |
| `inventory-api.ts` | 庫存管理 |

### `hooks/`

| 檔案 | 說明 |
|------|------|
| `useStoreFeatures.ts` | 讀取當前登入者 `storeFeatures` 的 hook，含 `hasFeature()`（admin 永遠通過） |

---

## 4. `packages/`（前後端共用）

### `packages/shared-types/`

| 檔案 | 說明 |
|------|------|
| `auth.ts` | 登入 schema（Zod）、`AuthUser` 型別（含 storeFeatures，無 region/dealerId） |
| `customer.ts` | `CustomerSummary`、`CustomerDetail` |
| `store.ts` | `StoreSummary`（無 dealerId/dealerName/region） |
| `user.ts` | `UserSummary`、Role enum（`system_admin/admin/manager/accountant/staff`）、帳號建立/更新 schema。email 為 optional。 |
| `service-record.ts` | `ServiceRecord` 型別、付款方式 enum |

---

## 5. 重要設計慣例（快速參考）

| 問題 | 正確做法 |
|------|---------|
| 瀏覽器端 API URL | `resolveApiBaseUrl()`，**不寫死 localhost** |
| 登入/登出後導頁 | `window.location.href = '/admin'`，不用 `router.push` |
| Prisma 含關聯的查詢型別 | `satisfies Prisma.XxxSelect` + `Prisma.XxxGetPayload<{ select: typeof CONST }>` |
| void 端點回傳解析 | `const text = await response.text(); return text ? JSON.parse(text) : undefined` |
| Schema 加新欄位後 | `npx prisma generate` 再 `npm run build` |
| API build 輸出路徑 | `dist/src/main.js`（不是 `dist/main.js`） |
| Web 啟動指令 | `PORT=3000 /workspace/node_modules/.bin/next start`（在 `/workspace/apps/web` 執行） |
| email upsert | 用 `where: { username }`，不用 `where: { email }`（nullable 欄位不能做 unique key） |
| DB 容器重建後 | API 容器也要 `--force-recreate`，確保 DNS 解析到新 IP |
