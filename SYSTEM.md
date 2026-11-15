# 璨妍 ERP 後台管理系統 — 系統說明書

> 版本：website_v2　｜　最後更新：2026-11-15

---

## 目錄

1. [專案概述](#1-專案概述)
2. [技術棧](#2-技術棧)
3. [系統架構](#3-系統架構)
4. [容器與啟動說明](#4-容器與啟動說明)
5. [目錄結構](#5-目錄結構)
6. [資料庫模型詳解](#6-資料庫模型詳解)
7. [角色與權限系統](#7-角色與權限系統)
8. [後端 API 模組說明](#8-後端-api-模組說明)
9. [前端頁面說明](#9-前端頁面說明)
10. [重要設計決策與慣例](#10-重要設計決策與慣例)
11. [顧客核心流程](#11-顧客核心流程)
12. [POS 結帳流程](#12-pos-結帳流程)
13. [財務雙軌設計](#13-財務雙軌設計)
14. [分店功能開關](#14-分店功能開關feature-toggle)
15. [多帳號切換](#15-多帳號切換)
16. [已完成功能清單](#16-已完成功能清單)

---

## 1. 專案概述

璨妍生技品牌的**單店 ERP 後台系統**，供分店店長、員工、會計及總部管理員日常操作使用。

**單店模式**：系統目前只有一間分店（璨妍門市，id=24, code=DEFAULT），無區域（region）、無代理商（dealer）概念。

### 涵蓋功能

- **顧客管理（CRM）**：建檔、同意書電子簽名、療程紀錄、照片
- **POS 結帳**：單次消費、儲值扣點、課程扣堂，多重付款方式
- **庫存管理**：分店庫存、補貨請求
- **財務帳務**：收入/支出雙軌（財務記錄 + 備用金獨立系統）
- **打卡/考勤**：上下班打卡、月份考勤統計、業績 dashboard
- **分店管理**：員工帳號管理、功能開關設定
- **帳號管理**：5 種角色 RBAC、多帳號 PIN 切換、裝置記住登入
- **促銷方案管理**、**聯絡訊息管理**

---

## 2. 技術棧

| 層次 | 技術 | 版本 |
|------|------|------|
| 後端框架 | NestJS | 10 |
| 前端框架 | Next.js App Router | 14 |
| 語言 | TypeScript | 5 |
| 資料庫 | PostgreSQL | 16 |
| ORM | Prisma | 5 |
| 容器 | Docker Compose（node:20-slim） | — |
| 反向代理 | nginx:alpine | — |
| 認證 | JWT（`@nestjs/jwt`）+ Cookie | — |
| 表單驗證 | React Hook Form + Zod | — |
| 樣式 | Tailwind CSS（kiosk design token） | — |
| PDF 生成 | pdf-lib | — |
| 電子簽名 | 自訂簽名畫布 + 雜湊驗證 | — |
| 共用型別 | `packages/shared-types`（Zod schema） | — |

---

## 3. 系統架構

```
[瀏覽器 / iPad]
       │  port 80 / 443
       ▼
┌────────────────────┐
│  website_v2_nginx  │  nginx:alpine
│                    │  port 80 → HTTP→HTTPS redirect
│                    │  port 443 → SSL 終止（自簽憑證）
│                    │  proxy_pass → web:3000
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│   website_v2_web   │  Next.js 14 App Router
│   (node:20-slim)   │  container port 3000（無對外 port）
│                    │  行程：next start（PORT=3000）
└────────┬───────────┘
         │
         ├── Server Components (SSR)
         │   使用 CMS_API_INTERNAL_URL=http://api:3000/api/v2
         │
         └── Browser (Client Components)
             使用 resolveApiBaseUrl() → hostname:3101
                        │
                        ▼
┌────────────────────┐
│   website_v2_api   │  NestJS REST API
│   (node:20-slim)   │  container port 3000 → host port 3101
│                    │  行程：node dist/src/main.js
│                    │  全域前綴：/api/v2
└────────┬───────────┘
         │  Prisma ORM
         ▼
┌────────────────────┐
│   website_v2_db    │  PostgreSQL 16
│   (postgres:16)    │  container port 5432 → host port 5433
└────────────────────┘
```

### SSL 憑證

- 路徑：`docker/nginx/ssl/selfsigned.crt` / `selfsigned.key`（自簽憑證）
- 瀏覽器會顯示警告，點「繼續前往」即可
- 如需正式憑證，可換 Let's Encrypt

### 外網連線

- 域名：`tsanyentest.com` → DNS A record: `59.127.126.180`（Mac 公共 IP）
- 路由器需 port forwarding：80/443 → 192.168.1.103（Mac 區網 IP）

---

## 4. 容器與啟動說明

### docker-compose.yml 結構

```
services:
  nginx:  nginx:alpine，port 80:80 + 443:443，掛載 nginx conf + SSL 憑證
  web:    node:20-slim，無對外 port，掛載 ./ → /workspace
  api:    node:20-slim，port 3101:3000，掛載 ./ → /workspace
  db:     postgres:16-alpine，port 5433:5432，volume website_v2_db_data
```

### 四個容器的角色

| 容器 | 角色 | 自動啟動 |
|------|------|---------|
| `website_v2_nginx` | 反向代理 + SSL | ✓（docker compose up 後自動就緒） |
| `website_v2_db` | PostgreSQL 資料庫 | ✓（healthcheck 通過後就緒） |
| `website_v2_api` | NestJS API 行程 | ✗（需手動 `node dist/src/main.js`） |
| `website_v2_web` | Next.js 行程 | ✗（需手動 `next start`） |

完整啟動步驟見 **[Start.md](./Start.md)**。

---

## 5. 目錄結構

```
website_v2/
├── docker-compose.yml
├── docker/
│   └── nginx/
│       ├── default.conf             # nginx 設定（HTTP→HTTPS redirect + proxy）
│       └── ssl/
│           ├── selfsigned.crt       # SSL 憑證
│           └── selfsigned.key       # SSL 私鑰
├── package.json                     # monorepo root（workspaces）
├── Start.md / SYSTEM.md / README.md / all.md
│
├── apps/
│   ├── api/                         # NestJS 後端
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # 資料庫 schema
│   │   │   ├── migrations/          # Prisma migration 歷程
│   │   │   └── seed.ts              # 種子資料
│   │   ├── dist/                    # 編譯輸出（production build）
│   │   └── src/
│   │       ├── app.module.ts
│   │       ├── main.ts              # port 3000，prefix /api/v2
│   │       ├── auth/                # JWT 認證、JwtAuthGuard、RolesGuard
│   │       ├── attendance/          # 打卡模組
│   │       ├── chat/                # 即時通訊（WebSocket Gateway）
│   │       ├── common/              # AppError、GlobalExceptionFilter
│   │       ├── contact/             # 聯絡訊息
│   │       ├── customer-courses/    # 課程退費轉儲值、課程轉換
│   │       ├── customers/           # 顧客主模組（含同意書 PDF）
│   │       ├── financial/           # 財務帳務
│   │       ├── inventory/           # 庫存管理、補貨請求
│   │       ├── petty-cash/          # 備用金
│   │       ├── prisma/              # PrismaService（全域 singleton）
│   │       ├── promotion-plans/     # 促銷方案
│   │       ├── service-items/       # 服務品項
│   │       ├── service-records/     # POS 服務紀錄（含核銷還原）
│   │       ├── signature/           # 電子簽名雜湊工具
│   │       ├── stores/              # 分店管理、Feature Toggle
│   │       └── users/               # 帳號管理
│   │
│   └── web/                         # Next.js 前端
│       ├── .next/                   # Build 輸出
│       ├── app/
│       │   ├── page.tsx             # 根路徑 → redirect /admin/login
│       │   ├── layout.tsx           # 全域 layout（PWA meta）
│       │   └── (admin)/             # 後台頁面群組
│       │       ├── login/           # 登入頁
│       │       ├── customers/       # 顧客資料（含 POS 入口）
│       │       ├── inventory/       # 庫存管理
│       │       ├── attendance/      # 打卡
│       │       ├── manager-dashboard/ # 考勤 & 業績
│       │       ├── financial/       # 財務帳務
│       │       ├── petty-cash/      # 備用金
│       │       ├── expenses/        # 支出管理
│       │       ├── stores/          # 分店管理
│       │       ├── store-settings/  # 分店功能設定（店長專用）
│       │       ├── store-staff/     # 員工帳號管理（店長專用）
│       │       ├── store-service-items/ # 服務品項管理
│       │       ├── promotion-plans/
│       │       ├── contact-messages/
│       │       ├── contact-categories/
│       │       ├── users/           # 帳號管理（admin 用）
│       │       └── settings/        # 個人設定（含 PIN 設定 tab）
│       ├── components/
│       │   └── admin/
│       │       ├── AdminShell.tsx   # 側欄 shell
│       │       ├── AccountSwitcher.tsx # 多帳號切換（PIN/登出）
│       │       ├── customers/       # 顧客相關元件
│       │       ├── kiosk/           # 共用 UI 元件（含 PinPad）
│       │       └── users/           # 帳號管理元件
│       ├── hooks/
│       │   └── useStoreFeatures.ts
│       └── lib/
│           ├── api-client.ts        # apiRequest() + resolveApiBaseUrl()
│           ├── auth.ts              # JWT cookie 存取
│           ├── multi-account.ts     # 多帳號 localStorage 儲存（PIN）
│           ├── navigationConfig.ts  # 統一導覽設定
│           └── ...（各模組 API client）
│
└── packages/
    └── shared-types/                # 前後端共用型別與 Zod schema
```

---

## 6. 資料庫模型詳解

### 使用者

#### `User`（`users` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `username` | String unique | 帳號名稱（登入用，小寫） |
| `email` | String? | Email（**選填**，nullable） |
| `name` | String | 顯示名稱 |
| `role` | Role enum | 見角色章節 |
| `storeId` | Int? | 所屬分店 |
| `parentId` | Int? | 建立者 ID |
| `isActive` | Boolean | 帳號是否啟用 |
| `deletedAt` | DateTime? | 軟刪除時間戳 |

> `email` 有 partial unique index：`CREATE UNIQUE INDEX users_email_unique ON users(email) WHERE email IS NOT NULL`

#### `Store`（`stores` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `code` | String unique | 分店代碼（目前：DEFAULT） |
| `name` | String | 分店名稱（目前：璨妍門市） |
| `features` | Json | 功能開關 `{ pos, attendance, crm }` |
| `pettyCashBalance` | Int | 備用金餘額（快照） |
| `isActive` | Boolean | 是否啟用 |

> 已移除：`region`、`regionSequence`、`dealerId` 欄位

### 顧客系統

#### `Customer`（`customers` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | String | 姓名（**終身鎖定**） |
| `nationalId` | String? | 身分證字號（**終身鎖定**） |
| `customerCode` | String? | 顧客編號（`{store.code}-{nationalId}`） |
| `storeId` | Int | 所屬分店 |
| `isExosomeUser` | Boolean | 是否使用外泌體 |
| `disclaimerFullySigned` | Boolean | 同意書雙方是否都已簽 |
| `hasExosomeConsent` | Boolean | 外泌體同意書是否已簽 |
| `storeCredit` | Decimal | 儲值金餘額 |

#### `CustomerCourse`（`customer_courses`）

| 欄位 | 說明 |
|------|------|
| `serviceItemId` | 課程對應的服務品項 |
| `totalSessions` | 總堂數 |
| `usedSessions` | 已使用堂數 |
| `purchasedAt` | 購買時間（POS 扣堂自動選最舊的） |

### POS / 服務

#### `ServiceRecord`（`service_records`）

| 欄位 | 說明 |
|------|------|
| `consumptionType` | `single_purchase` / `wallet_deduction` / `course_deduction` |
| `payments` | Json 陣列：`[{ method, amount }]` |
| `amountPaid` | 實際收取總金額 |
| `customerSignatureUrl` | 顧客電子簽名 URL |
| `isRolledBack` | 是否已核銷還原 |

### 財務

#### `PettyCashLog`（`petty_cash_logs`）

| 欄位 | 說明 |
|------|------|
| `action` | `add` / `remove` / `expense_deduct` |
| `amount` | 金額 |
| `balanceAfter` | 操作後餘額快照 |

> `outsource_deduct` action 已從備用金頁面顯示中移除

---

## 7. 角色與權限系統

### 角色定義（Role enum）

| 角色 | 中文 | 管轄範圍 |
|------|------|---------|
| `system_admin` | 系統管理員 | 全部，無限制 |
| `admin` | 總部管理員 | 全部，無限制 |
| `manager` | 店長 | 自己所屬分店 |
| `accountant` | 會計 | 自己所屬分店（限財務/考勤） |
| `staff` | 員工 | 自己所屬分店（受限功能） |

> 已移除：`dealer`、`general_agent`、`editor`、Region A/B/C

### 帳號建立規則

| 建立者 | 可建立的角色 |
|--------|------------|
| `system_admin` | 所有角色 |
| `admin` | manager、accountant、staff |
| `manager` | accountant、staff（限自己分店） |

### RBAC 實作

- 後端：`@Roles(...)` decorator + `JwtAuthGuard` + `RolesGuard`
- `system_admin` / `admin`：`isAdminRole()` 一律放行
- `manager`：Service 層驗證只能操作自己分店資料

### 各角色可見頁面

| 頁面 | sys_admin | admin | manager | accountant | staff |
|------|:---------:|:-----:|:-------:|:----------:|:-----:|
| 顧客資料 | ✓ | ✓ | ✓ | — | ✓ |
| 庫存管理 | ✓ | ✓ | ✓ | — | — |
| 打卡 | ✓ | ✓ | ✓ | — | ✓ |
| 考勤 & 業績 | ✓ | ✓ | ✓ | ✓ | — |
| 財務帳務 | ✓ | ✓ | ✓ | ✓ | — |
| 備用金 | ✓ | ✓ | ✓ | — | — |
| 支出管理 | ✓ | ✓ | ✓ | — | ✓ |
| 分店管理 | ✓ | ✓ | — | — | — |
| 分店功能設定 | ✓ | ✓ | ✓ | — | — |
| 員工帳號管理 | — | — | ✓ | — | — |
| 服務品項 | ✓ | ✓ | ✓ | — | — |
| 促銷方案 | ✓ | ✓ | ✓ | — | — |
| 聯絡訊息 | ✓ | ✓ | ✓ | — | — |
| 帳號管理 | ✓ | ✓ | — | — | — |
| 個人設定 | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 8. 後端 API 模組說明

### 全域設定

- 前綴：所有路由 `/api/v2` 開頭
- 錯誤格式：`{ error, message, statusCode }`
- AppError：`throw new AppError('ERROR_CODE', '訊息', statusCode)`

### `auth` 模組

| 端點 | 說明 |
|------|------|
| `POST /auth/login` | username + password，回傳 JWT + user（含 storeFeatures） |
| `GET /auth/me` | 驗證 token，即時查 storeFeatures |

### `users` 模組

| 端點 | 說明 |
|------|------|
| `GET /users` | 列帳號（依角色範圍篩選） |
| `POST /users` | 建立帳號 |
| `PATCH /users/me` | 自己修改個人資料（username/phone/password） |
| `DELETE /users/:id` | 軟刪除帳號 |

### `stores` 模組

| 端點 | 說明 |
|------|------|
| `GET /stores` | 列分店 |
| `PATCH /stores/:id` | 修改分店資訊 |
| `PATCH /stores/:id/features` | 更新功能開關 |
| `GET /stores/:id/staff` | 列分店員工 |
| `POST /stores/:id/staff` | 建立員工帳號 |
| `PATCH /stores/:id/staff/:staffId` | 修改員工資訊 |
| `DELETE /stores/:id/staff/:staffId` | 軟刪除員工帳號 |

### `customers` 模組

| 端點 | 說明 |
|------|------|
| `GET /customers` | 列顧客 |
| `POST /customers/with-signature` | 建立顧客（同步簽署同意書） |
| `POST /customers/quick` | 快速建立顧客（不需簽署） |
| `PATCH /customers/:id` | 修改顧客資料 |
| `POST /customers/:id/disclaimer/sign-staff` | 服務人員補簽同意書 |
| `POST /customers/:id/disclaimer/sign` | 顧客補簽同意書 |
| `GET /customers/:id/disclaimer` | 下載同意書 PDF |
| `POST /customers/:id/exosome-consent` | 外泌體同意書簽署 |
| `GET /customers/:id/wallet` | 顧客錢包 |
| `POST /customers/:id/wallet/top-up` | 儲值 |
| `GET /customers/:id/courses` | 課程列表 |

### `petty-cash` 模組

| 端點 | 說明 |
|------|------|
| `GET /stores/:storeId/petty-cash/balance` | 備用金餘額 |
| `GET /stores/:storeId/petty-cash/logs` | 異動記錄 |
| `POST /stores/:storeId/petty-cash/adjust` | 增減備用金（含設定目標金額） |

---

## 9. 前端頁面說明

### 導覽設定（navigationConfig.ts）

所有側欄導覽項目統一在 `apps/web/lib/navigationConfig.ts` 管理，`AdminShell.tsx` 依角色 + storeFeatures 動態渲染。

### 重要頁面

#### `/customers` — 顧客資料

左側列表 + 右側 `CustomerDetailDrawer`，包含：基本資料、同意書狀態、POS 結帳按鈕、療程紀錄、課程管理、錢包。

#### `/settings` — 個人設定

4 個 tab：基本資料、安全性、分店設定、**切換 PIN**（設定 PIN 儲存帳號到 localStorage）。

#### `AccountSwitcher` 元件

從 AdminShell 頂部「帳號管理」按鈕開啟，4 個視圖：
1. 帳號列表（目前帳號 + 其他已儲存帳號）
2. PIN 輸入（切換帳號時驗證）
3. 新帳號登入
4. 登出確認

---

## 10. 重要設計決策與慣例

### API URL 絕不寫死 localhost

```typescript
// apps/web/lib/api-client.ts
export function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.CMS_API_INTERNAL_URL ?? 'http://api:3000/api/v2';
  }
  return `http://${window.location.hostname}:3101/api/v2`;
}
```

### 登入後導向用 window.location.href

```typescript
window.location.href = '/admin'; // ✓ 整頁 reload，側欄重新掛載
router.push('/admin');           // ✗ client-side 路由，側欄不更新
```

### Prisma select + satisfies

```typescript
const STORE_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.StoreSelect;

type StoreRow = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;
```

### 空 body void 端點

```typescript
// api-client.ts success path
const text = await response.text();
return text ? JSON.parse(text) : undefined;
```

### Schema 改完要重新 generate + build

```bash
npx prisma generate && npm run build
```

### email nullable 後 upsert 要用 username

seed.ts 和所有 upsert 用 `where: { username }`，不用 `where: { email }`（nullable 欄位不能做 unique key）。

---

## 11. 顧客核心流程

### 建立顧客（含同意書）

1. 填姓名、身分證（鎖定）、電話等基本資料
2. 外泌體使用者：服務人員電子簽名 → 顧客電子簽名
3. 完成後：生成 `customerCode = DEFAULT-{nationalId}`，生成 PDF

### 補簽同意書

1. **服務人員補簽**：若無 `customerCode` 且有 `nationalId`，先生成編號 → 建立 PDF + 儲存 `contentSnapshot`
2. **顧客補簽**：從 `contentSnapshot` 重建版面 → 在既有 PDF 疊加顧客簽名 → `disclaimerFullySigned = true`

---

## 12. POS 結帳流程

### 三種消費方式

| 方式 | 說明 | 後端驗證 |
|------|------|---------|
| `single_purchase` | 單次消費 | `amountPaid === serviceItem.price` |
| `wallet_deduction` | 扣儲值金 | 驗 wallet 餘額足夠 |
| `course_deduction` | 扣課程堂數 | 自動扣最舊課程，驗剩餘堂數 |

### 多重付款

`single_purchase` 時可組合：`[{ method: 'cash', amount }, { method: 'line_pay', amount }]`，前端強制 sum 等於定價。

### 核銷還原

`POST /service-records/:id/rollback`（manager+ only）：`isRolledBack=true`，`usedSessions` 恢復。

---

## 13. 財務雙軌設計

外包支付同一 transaction 寫入兩個系統：

```typescript
await prisma.$transaction(async (tx) => {
  await tx.financialRecord.create({ data: { type: 'expense', category: 'outsource_payout', ... } });
  await tx.pettyCashLog.create({ data: { action: 'outsource_deduct', ... balanceAfter } });
  await tx.store.update({ data: { pettyCashBalance: newBalance } });
});
```

備用金頁面**不顯示** `outsource_deduct` 類型的 log，只顯示手動增減（add/remove）。

---

## 14. 分店功能開關（Feature Toggle）

`Store.features` JSON 欄位，格式：`{ "pos": true, "attendance": true, "crm": false }`

- 登入時 `storeFeatures` 從 DB 即時查詢（**不存入 JWT**）
- admin/system_admin 永遠通過 feature gate
- 更新後前端立即更新 cookie，不需重新登入

---

## 15. 多帳號切換

### 儲存機制（localStorage）

`apps/web/lib/multi-account.ts`：

```typescript
interface SavedAccount {
  token: string;
  user: AuthUser;
  pin: string; // 4 位數 PIN（bcrypt hash）
  savedAt: number;
}
```

### 設定流程

1. 後台「個人設定」→「切換 PIN」tab
2. 輸入 4 位數 PIN
3. 目前帳號的 token + user 儲存到 localStorage

### 切換流程

1. 點 AdminShell 頂部「帳號管理」按鈕
2. 選擇已儲存帳號
3. 輸入 PIN 驗證
4. 切換成功，整頁 reload

### 裝置記住登入

登入頁「記住此裝置」checkbox → 勾選後 cookie 有效期 30 天（`saveAuth(token, user, 30)`），未勾選預設 1 天。

---

## 16. 已完成功能清單

### 認證與帳號系統
- [x] Username 登入，JWT + Cookie
- [x] 5 種角色 RBAC（移除 dealer/general_agent/editor）
- [x] 帳號建立矩陣（manager 可建 accountant）
- [x] email 選填（partial unique index）
- [x] 個人設定：修改 username/phone/password
- [x] 多帳號 PIN 切換（localStorage）
- [x] 裝置記住登入（30 天 cookie）
- [x] 帳號切換器 + 登出確認

### 分店管理
- [x] 單店模式（璨妍門市，id=24）
- [x] 分店功能開關（pos/attendance/crm）
- [x] 員工帳號管理（店長專用）

### 顧客管理
- [x] 顧客建立（姓名/身分證終身鎖定）
- [x] 顧客編號自動生成
- [x] 外泌體同意書雙方電子簽名
- [x] 補簽流程（contentSnapshot 凍結座標）
- [x] 療程紀錄 + 照片
- [x] 外泌體使用同意書

### POS 結帳
- [x] 三種消費方式 + 多重付款
- [x] 定價一致性驗證
- [x] 顧客電子簽名
- [x] 核銷還原

### 財務
- [x] 收入/支出記錄
- [x] 備用金（移除 outsource_deduct 顯示）
- [x] 備用金設定目標金額功能
- [x] 財務雙軌寫入（transaction）

### 其他
- [x] nginx SSL 終止（自簽憑證，port 443）
- [x] HTTP→HTTPS 自動跳轉（port 80）
- [x] 動態 API URL（不寫死 localhost）
- [x] 分店功能 Feature Gate
- [x] 聯絡訊息管理
- [x] 促銷方案管理
- [x] 課程退費轉儲值金
- [x] 課程轉換
