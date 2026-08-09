# 璨妍 ERP 後台管理系統 — 系統說明書

> 版本：website_v2　｜　最後更新：2026-08-09

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
13. [外泌體同意書流程](#13-外泌體同意書流程)
14. [財務雙軌設計](#14-財務雙軌設計)
15. [即時通訊系統](#15-即時通訊系統)
16. [分店功能開關（Feature Toggle）](#16-分店功能開關feature-toggle)
17. [已完成功能清單](#17-已完成功能清單)

---

## 1. 專案概述

璨妍生技品牌的**分店 ERP 後台系統**，供各分店店長、員工、總部管理員及代理商日常操作使用。

系統現在**只保留後台**，公開形象官網（CMS / Puck 區塊編輯器）已於 2026-08 從本專案移除。根路徑 `/` 自動重導向 `/admin/login`。

### 涵蓋功能

- **顧客管理（CRM）**：建檔、同意書電子簽名、療程紀錄、照片
- **POS 結帳**：單次消費、儲值扣點、課程扣堂，多重付款方式
- **庫存管理**：各分店庫存、補貨請求、庫存調撥
- **財務帳務**：收入/支出雙軌（財務記錄 + 備用金獨立系統）
- **打卡/考勤**：上下班打卡、月份考勤統計、業績 dashboard
- **即時通訊**：WebSocket 一對一聊天、未讀數即時更新
- **分店管理**：分店 CRUD、員工帳號管理、功能開關設定
- **帳號管理**：8 種角色 RBAC、帳號建立矩陣
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
| 認證 | JWT（`@nestjs/jwt`）+ Cookie | — |
| 即時通訊 | WebSocket（`@nestjs/websockets`） | — |
| 表單驗證 | React Hook Form + Zod | — |
| 樣式 | Tailwind CSS（kiosk design token） | — |
| PDF 生成 | pdf-lib | — |
| 電子簽名 | 自訂簽名畫布 + 雜湊驗證 | — |
| 共用型別 | `packages/shared-types`（Zod schema） | — |

---

## 3. 系統架構

```
[瀏覽器 / iPad]
       │  HTTP port 80
       ▼
┌────────────────────┐
│   website_v2_web   │  Next.js 14 App Router
│   (node:20-slim)   │  container port 3000 → host port 80
│                    │  行程：next start apps/web -p 3000
└────────┬───────────┘
         │
         ├── Server Components (SSR)
         │   使用 CMS_API_INTERNAL_URL=http://api:3000/api/v2
         │   （Docker 內部網路，不走公開 port）
         │
         └── Browser (Client Components)
             使用 resolveApiBaseUrl()
             依 window.location.hostname 動態組出 :3101
             不寫死 localhost，確保外網也能運作
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

### 靜態檔案

上傳的療程照片等由 NestJS 靜態伺服：
- API：`/api/v2/uploads/:filename`
- 對外 URL：`http://{hostname}:3101/api/v2/uploads/{filename}`

### 重要注意

> 容器的主行程只是 `tail -f /dev/null`（讓容器保持存活），NestJS 和 Next.js **都需要手動啟動行程**。容器重啟後這兩個行程會消失，必須重新執行（詳見 [Start.md](./Start.md)）。

---

## 4. 容器與啟動說明

### docker-compose.yml 結構

```yaml
services:
  db:   postgres:16-alpine，port 5433:5432，volume website_v2_db_data
  api:  node:20-slim，port 3101:3000，掛載 ./ → /workspace
  web:  node:20-slim，port 80:3000，掛載 ./ → /workspace
```

api 容器 command：
```sh
apt-get update && apt-get install -y openssl procps && tail -f /dev/null
```
（安裝完 openssl 後讓容器保持存活，NestJS 需手動啟動）

### 三個容器的角色

| 容器 | 角色 | 自動啟動 |
|------|------|---------|
| `website_v2_db` | PostgreSQL 資料庫 | ✓（docker compose up 後自動就緒） |
| `website_v2_api` | NestJS API 行程 | ✗（需手動 `node dist/src/main.js`） |
| `website_v2_web` | Next.js 行程 | ✗（需手動 `next start`） |

完整啟動步驟見 **[Start.md](./Start.md)**。

---

## 5. 目錄結構

```
website_v2/
├── docker-compose.yml
├── package.json                     # monorepo root（workspaces）
├── Start.md                         # 啟動 / 關閉指南
├── SYSTEM.md                        # 本文件
│
├── apps/
│   ├── api/                         # NestJS 後端
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # 資料庫 schema（所有 model/enum）
│   │   │   ├── migrations/          # Prisma migration 歷程
│   │   │   └── seed.ts              # 種子資料（帳號 + 分店 + 同意書範本）
│   │   ├── dist/                    # 編譯輸出（production build）
│   │   └── src/
│   │       ├── app.module.ts        # 根模組（匯入所有子模組）
│   │       ├── main.ts              # 進入點（port 3000，prefix /api/v2）
│   │       ├── auth/                # JWT 認證、角色守門（JwtAuthGuard + RolesGuard）
│   │       ├── attendance/          # 打卡模組
│   │       ├── chat/                # 即時通訊（WebSocket Gateway）
│   │       ├── common/              # 共用工具
│   │       │   ├── errors/          # AppError（統一錯誤結構）
│   │       │   ├── filters/         # GlobalExceptionFilter
│   │       │   └── upload.util.ts   # Multer 設定
│   │       ├── contact/             # 聯絡訊息
│   │       ├── customer-courses/    # 課程退費轉儲值、課程轉換
│   │       ├── customers/           # 顧客主模組
│   │       │   ├── customers.service.ts
│   │       │   ├── customers.controller.ts
│   │       │   ├── customer-disclaimer.service.ts  # 同意書補簽
│   │       │   ├── disclaimer-pdf.util.ts           # PDF 生成（pdf-lib）
│   │       │   └── customer-file-storage.util.ts    # 檔案 I/O
│   │       ├── financial/           # 財務帳務（FinancialRecord）
│   │       ├── inventory/           # 庫存管理、補貨請求
│   │       ├── petty-cash/          # 備用金（PettyCashLog，獨立系統）
│   │       ├── prisma/              # PrismaService（全域 singleton）
│   │       ├── promotion-plans/     # 促銷方案
│   │       ├── service-items/       # 服務品項
│   │       ├── service-records/     # POS 服務紀錄
│   │       ├── signature/           # 電子簽名雜湊工具
│   │       ├── stores/              # 分店管理、Feature Toggle
│   │       └── users/               # 帳號管理
│   │
│   └── web/                         # Next.js 前端
│       ├── .next/                   # Build 輸出（next build 產生）
│       ├── app/
│       │   ├── page.tsx             # 根路徑 → redirect /admin/login
│       │   ├── layout.tsx           # 全域 layout（PWA meta）
│       │   └── (admin)/             # 後台頁面群組（受登入守衛）
│       │       ├── login/           # 登入頁（username 登入）
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
│       │       ├── users/           # 帳號管理（admin/dealer 用）
│       │       ├── chat-contacts/   # 聊天清單管理（admin 用）
│       │       └── settings/        # 個人設定
│       ├── components/
│       │   └── admin/
│       │       ├── AdminShell.tsx   # 側欄 shell（導覽 + 聊天按鈕）
│       │       ├── customers/       # 顧客相關元件（POS、詳情、簽名、療程紀錄）
│       │       ├── stores/          # 分店管理元件
│       │       ├── users/           # 帳號管理元件
│       │       └── kiosk/           # 共用 UI 元件（KioskButton、KioskInput…）
│       ├── hooks/
│       │   └── useStoreFeatures.ts  # 讀取 storeFeatures 的 hook
│       └── lib/
│           ├── api-client.ts        # apiRequest() + resolveApiBaseUrl()
│           ├── auth.ts              # JWT cookie 存取（saveAuth / getAuthUser）
│           ├── navigationConfig.ts  # 統一導覽設定（featureKey + roleGuard）
│           ├── customers-api.ts
│           ├── stores-api.ts
│           ├── users-api.ts
│           ├── service-records-api.ts
│           ├── petty-cash-api.ts
│           ├── financial-api.ts
│           └── ...（各模組 API client）
│
└── packages/
    └── shared-types/                # 前後端共用 TypeScript 型別與 Zod schema
        ├── auth.ts                  # login schema、AuthUser
        ├── customer.ts              # CustomerSummary、CustomerDetail
        ├── store.ts                 # StoreSummary（含 dealerId/dealerName）
        ├── user.ts                  # UserSummary、角色/區域 enum
        └── ...
```

---

## 6. 資料庫模型詳解

### 使用者與分店

#### `User`（`users` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `username` | String unique | 帳號名稱（登入用，小寫） |
| `email` | String | Email（員工帳號用 placeholder `xxx@store.internal`） |
| `name` | String | 顯示名稱 |
| `role` | Role enum | 見角色章節 |
| `storeId` | Int? | 所屬分店（dealer/general_agent 為 null） |
| `region` | Region? | 負責區域 A/B/C（dealer/general_agent 用） |
| `parentId` | Int? | 建立者 ID（追蹤帳號層級） |
| `dealerId` | Int? | 所屬代理商 ID |
| `isActive` | Boolean | 帳號是否啟用 |
| `deletedAt` | DateTime? | 軟刪除時間戳 |

#### `Store`（`stores` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `code` | String unique | 分店代碼（格式：A01/B02/C03） |
| `region` | Region | 所屬區域 |
| `regionSequence` | Int | 同區域流水號（1, 2, 3…） |
| `features` | Json | 功能開關 `{ pos, attendance, crm }` |
| `pettyCashBalance` | Decimal | 備用金餘額（快照） |
| `dealerId` | Int? | 負責代理商 ID |
| `isActive` | Boolean | 是否啟用 |

### 顧客系統

#### `Customer`（`customers` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | String | 姓名（**終身鎖定**，建立後不可修改） |
| `nationalId` | String? | 身分證字號（**終身鎖定**） |
| `customerCode` | String? | 顧客編號（格式：`{store.code}-{nationalId}`，如 A01-A123456789） |
| `phone` / `address` / `lineId` / `email` | String? | 可修改的聯絡資料 |
| `storeId` | Int | 所屬分店（建立後不可轉店） |
| `isExosomeUser` | Boolean | 是否使用外泌體產品 |
| `disclaimerPath` | String? | 同意書 PDF 路徑 |
| `disclaimerStaffSignedAt` | DateTime? | 服務人員簽署時間 |
| `disclaimerCustomerSignedAt` | DateTime? | 顧客簽署時間 |
| `disclaimerFullySigned` | Boolean（computed） | 雙方都已簽署 |
| `hasExosomeConsent` | Boolean | 外泌體使用同意書是否已簽 |
| `exosomeConsentSignatureUrl` | String? | 外泌體同意書簽名圖 URL |
| `storeCredit` | Decimal | 儲值金餘額 |

#### `CustomerWallet` / `WalletLog`

- `CustomerWallet`：與顧客一對一，記錄儲值金餘額
- `WalletLog`：每次異動記錄（充值/消費/退款），附餘額快照

#### `CustomerCourse`（`customer_courses`）

| 欄位 | 說明 |
|------|------|
| `serviceItemId` | 課程對應的服務品項 |
| `totalSessions` | 總堂數 |
| `usedSessions` | 已使用堂數 |
| `remainingSessions` | 剩餘堂數（computed = total - used） |
| `purchasedAt` | 購買時間（POS 扣堂時選最舊的） |

#### `Signature`（`signatures`）

電子簽名記錄，每次簽署一筆：

| 欄位 | 說明 |
|------|------|
| `documentType` | `disclaimer` / `exosome_consent` / `id_document` 等 |
| `signerRole` | `staff` / `customer` |
| `contentSnapshot` | 凍結的 JSON（簽署當下的 header data + 版面），**顧客補簽時從這裡重建座標** |
| `contentHash` | 內容雜湊（tamper detection） |
| `recordHash` | 完整記錄雜湊（包含 signatureImageUrl） |

### POS / 服務

#### `ServiceItem`（`service_items`）

| 欄位 | 說明 |
|------|------|
| `name` | 服務名稱 |
| `price` | 定價（POS 後端驗證一致性） |
| `isOutsourced` | 是否外包（影響財務分類） |
| `storeId` | 所屬分店（null = 全分店通用） |

#### `ServiceRecord`（`service_records`）

| 欄位 | 說明 |
|------|------|
| `consumptionType` | `single_purchase` / `wallet_deduction` / `course_deduction` |
| `payments` | Json 陣列：`[{ method: 'cash'/'transfer'/'line_pay'/'credit_card', amount }]` |
| `amountPaid` | 實際收取總金額 |
| `customerSignatureUrl` | 顧客電子簽名圖 URL |
| `isRolledBack` | 是否已還原（核銷還原功能） |
| `rolledBackAt` | 還原時間 |
| `rollbackOperatorId` | 執行還原的操作員 |

### 庫存

```
Product            商品主檔（SKU、名稱、單位）
StoreInventory     各分店庫存數量（storeId + productId 唯一）
InventoryLog       庫存異動紀錄（restock/consumption/adjustment/transfer_in/transfer_out）
RestockRequest     補貨請求（status: pending/approved/completed/rejected）
```

### 財務

#### `FinancialRecord`（`financial_records`）

| 欄位 | 說明 |
|------|------|
| `type` | `income` / `expense` |
| `category` | `service_income` / `outsource_payout` / `daily_expense` / `cash_expense` / … |
| `amount` | 金額 |
| `storeId` | 所屬分店 |
| `serviceRecordId` | 關聯的 POS 紀錄（可選） |

#### `PettyCashLog`（`petty_cash_logs`）

| 欄位 | 說明 |
|------|------|
| `action` | `add` / `remove` / `outsource_deduct` / `expense_deduct` |
| `amount` | 金額 |
| `balanceAfter` | 操作後的餘額快照（每筆都記，方便對帳） |

> 見 [財務雙軌設計](#14-財務雙軌設計) 章節。

### 打卡 / 考勤

```
AttendanceLog      上下班打卡（storeId、userId、type: clock_in/clock_out、time）
```

### 即時通訊

```
Conversation              一對一對話串
ConversationParticipant   對話參與者（兩筆 per 對話）
Message                   訊息內容
MessageStatus             per-user 已讀狀態（sent/delivered/read）
ChatContactPermission     admin 覆寫某帳號的聯絡人清單
```

### 其他

```
PromotionPlan       促銷方案（含 PromotionPlanItem）
ContactMessage      官網聯絡表單訊息（可轉發給分店）
InquiryCategory     詢問類別
DisclaimerTemplate  同意書範本（Puck JSON 格式版面）
```

---

## 7. 角色與權限系統

### 角色定義（Role enum）

| 角色 | 中文 | 管轄範圍 |
|------|------|---------|
| `system_admin` | 系統管理員 | 全部，無限制 |
| `admin` | 總部管理員 | 全部，無限制 |
| `general_agent` | 總代理 | 自己負責的區域（A/B/C） |
| `dealer` | 區域代理 | 自己負責的區域（A/B/C） |
| `manager` | 店長 | 自己所屬分店 |
| `accountant` | 會計 | 自己所屬分店（限財務/考勤功能） |
| `staff` | 員工 | 自己所屬分店（受限功能） |
| `editor` | 編輯 | 歷史遺留角色，目前無特定功能 |

### 區域代碼（Region enum）

| 代碼 | 區域 |
|------|------|
| `A` | 北部 |
| `B` | 中部 |
| `C` | 南部 |

### 帳號建立矩陣（CREATOR_CAN_ASSIGN）

| 建立者 | 可建立的角色 |
|--------|------------|
| `system_admin` | 所有角色 |
| `admin` | general_agent、dealer、manager、staff、accountant |
| `general_agent` | dealer（限自己區域） |
| `dealer` | manager、staff、accountant（限自己區域的分店） |
| `manager` | staff、accountant（限自己分店，storeId 自動鎖定） |

### RBAC 實作機制

- **後端**：每個 Controller 用 `@Roles(...)` decorator 宣告最低需求角色
- **守衛順序**：`JwtAuthGuard`（驗 token）→ `RolesGuard`（驗角色）
- `system_admin` / `admin`：`isAdminRole()` 一律放行
- `general_agent` / `dealer`：可跨分店，但 Service 層限制在自己的 region
- `manager`：Service 層 `assertXxxAccess()` 驗證只能操作自己分店資料
- `accountant`：只開放財務帳務、考勤、個人設定、內部訊息

### 各角色可見頁面

| 頁面 | sys_admin | admin | gen_agent | dealer | manager | accountant | staff |
|------|:---------:|:-----:|:---------:|:------:|:-------:|:----------:|:-----:|
| 顧客資料 | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| 庫存管理 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| 打卡 | ✓ | ✓ | — | — | ✓ | — | ✓ |
| 考勤 & 業績 | ✓ | ✓ | — | — | ✓ | ✓ | — |
| 財務帳務 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 備用金 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| 支出管理 | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| 分店管理 | ✓ | ✓ | ✓ | ✓ | — | — | — |
| 分店功能設定 | ✓ | ✓ | — | — | ✓ | — | — |
| 員工帳號管理 | — | — | — | — | ✓ | — | — |
| 服務品項 | ✓ | ✓ | — | — | ✓ | — | — |
| 促銷方案 | ✓ | ✓ | — | — | ✓ | — | — |
| 聯絡訊息 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| 詢問類別管理 | ✓ | ✓ | — | — | — | — | — |
| 帳號管理 | ✓ | ✓ | ✓ | ✓ | — | — | — |
| 聊天清單管理 | ✓ | ✓ | — | — | — | — | — |
| 內部訊息 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 個人設定 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 8. 後端 API 模組說明

### 全域設定

- **前綴**：所有路由都以 `/api/v2` 開頭
- **認證**：大部分端點需要 `JwtAuthGuard`，少數公開端點用 `@Public()` 標記
- **錯誤格式**：`GlobalExceptionFilter` 統一回傳 `{ error, message, statusCode }`
- **AppError**：自訂錯誤類別，`throw new AppError('ERROR_CODE', '訊息', statusCode)`

### `auth` 模組

| 端點 | 說明 |
|------|------|
| `POST /auth/login` | username + password 登入，回傳 JWT + user（含 storeFeatures） |
| `GET /auth/me` | 驗證 token，即時從 DB 查 storeFeatures 回傳 |

### `users` 模組

| 端點 | 角色限制 | 說明 |
|------|---------|------|
| `GET /users` | dealer+ | 列帳號（依角色範圍自動篩選） |
| `POST /users` | dealer+ | 建立帳號（依 CREATOR_CAN_ASSIGN 矩陣） |
| `PATCH /users/me` | 所有 | 自己修改個人資料（姓名/Email/帳號/電話/密碼） |
| `PATCH /users/:id` | admin+ | 修改他人資料 |
| `PATCH /users/:id/password` | admin+ | 強制重設密碼（不需舊密碼） |
| `PATCH /users/:id/dealer` | admin+ | 指派負責代理商 |
| `DELETE /users/:id` | admin+ | 軟刪除帳號 |

### `stores` 模組

| 端點 | 角色限制 | 說明 |
|------|---------|------|
| `GET /stores` | dealer+ | 列分店（dealer/general_agent 限自己區域） |
| `POST /stores` | dealer+ | 建立分店（代碼自動產生，pg advisory lock 防併發） |
| `PATCH /stores/:id` | admin+ | 修改分店基本資訊 |
| `PATCH /stores/:id/features` | manager+ | 更新功能開關 |
| `PATCH /stores/:id/dealer` | admin+ | 指派負責代理商 |
| `DELETE /stores/:id` | admin+ | 軟刪除（有顧客/員工時阻止） |
| `GET /stores/:id/staff` | manager+ | 列該分店員工 |
| `POST /stores/:id/staff` | manager+ | 建立員工帳號 |

分店代碼格式：`{區域字母}{序號兩位}` → A01, A02, B01, C01…

### `customers` 模組

| 端點 | 說明 |
|------|------|
| `GET /customers` | 列顧客（分店/區域篩選） |
| `POST /customers` | 建立顧客（可同步簽署同意書） |
| `GET /customers/:id` | 顧客詳情 |
| `PATCH /customers/:id` | 修改顧客資料（姓名/身分證不可改） |
| `DELETE /customers/:id` | 軟刪除（admin+ only） |
| `POST /customers/:id/sign-staff-disclaimer` | 服務人員補簽同意書（生成 PDF，同時算 customerCode） |
| `POST /customers/:id/sign-disclaimer` | 顧客補簽同意書（在既有 PDF 上疊加簽名） |
| `GET /customers/:id/disclaimer-pdf` | 下載同意書 PDF |
| `POST /customers/:id/exosome-consent` | 外泌體使用同意書簽署 |
| `GET /customers/:id/treatment-records` | 療程紀錄列表 |
| `POST /customers/:id/treatment-records` | 建立療程紀錄（含照片上傳） |
| `GET /customers/:id/wallet` | 顧客錢包（儲值金） |
| `POST /customers/:id/wallet/topup` | 儲值 |
| `GET /customers/:id/courses` | 課程堂數列表 |
| `POST /customers/:id/courses` | 購買課程 |

### `service-records` 模組

| 端點 | 說明 |
|------|------|
| `POST /stores/:storeId/service-records` | 建立 POS 服務紀錄 |
| `GET /stores/:storeId/service-records/by-customer/:customerId` | 顧客使用紀錄 |
| `POST /service-records/:id/rollback` | 核銷還原（manager+ only） |

### `financial` 模組

| 端點 | 說明 |
|------|------|
| `GET /financial/stores/:storeId/records` | 財務記錄（可按日期/類別篩選） |
| `POST /financial/stores/:storeId/records` | 新增財務記錄 |
| `GET /financial/stores/:storeId/daily-balance` | 當日帳務摘要 |

### `petty-cash` 模組

| 端點 | 說明 |
|------|------|
| `GET /stores/:storeId/petty-cash/balance` | 查詢備用金餘額 |
| `GET /stores/:storeId/petty-cash/logs` | 異動記錄（可按日期篩選） |
| `POST /stores/:storeId/petty-cash/adjust` | 手動增減備用金（add/remove） |

### `inventory` 模組

| 端點 | 說明 |
|------|------|
| `GET /stores/:storeId/inventory` | 庫存列表 |
| `GET /restock-requests` | 補貨請求列表 |
| `POST /restock-requests` | 建立補貨請求 |
| `PATCH /restock-requests/:id/status` | 確認/完成/拒絕補貨請求 |

### `attendance` 模組

| 端點 | 說明 |
|------|------|
| `POST /attendance/clock` | 打卡（自動判斷上班/下班） |
| `GET /attendance/logs` | 打卡紀錄（可按月份/員工篩選） |
| `GET /attendance/summary` | 月份考勤統計 |

### `chat` 模組

| 端點 | 說明 |
|------|------|
| `GET /chat/contacts` | 可聯絡的帳號列表（依角色自動篩選） |
| `GET /chat/conversations` | 我的對話列表（含未讀數） |
| `POST /chat/conversations` | 開始/取得與某人的對話 |
| `GET /chat/conversations/:id/messages` | 取得對話訊息 |
| `POST /chat/conversations/:id/messages` | 發送訊息 |
| **WebSocket** `chat` namespace | 即時推送 + 已讀更新 |

---

## 9. 前端頁面說明

### 導覽設定（navigationConfig.ts）

所有側欄導覽項目統一在 `apps/web/lib/navigationConfig.ts` 管理：

```typescript
export interface NavItem {
  href: string;
  label: string;
  featureKey?: 'pos' | 'attendance' | 'crm';  // 需分店啟用才顯示
  roleGuard?: (role: string) => boolean;        // 角色守門（未設定=所有人）
}
```

`AdminShell.tsx` 根據 `navigationConfig` + 登入者角色 + 分店 features 動態渲染側欄。

### 重要頁面說明

#### `/customers` — 顧客資料

- 左側列表 + 右側 `CustomerDetailDrawer`
- Drawer 包含：基本資料、同意書狀態、POS 結帳按鈕、療程紀錄、使用紀錄、課程管理、錢包

#### `/customers` 中的 POS 結帳（`POSCheckoutModal`）

見 [POS 結帳流程](#12-pos-結帳流程) 章節。

#### `/store-settings` — 分店功能設定

- 店長勾選啟用 pos/attendance/crm 等模組
- 成功後更新本地 cookie，側欄立即反映（不需重新登入）

#### `/settings` — 個人設定

- 所有角色可改：姓名、Email、帳號（username）、電話、密碼
- 呼叫 `PATCH /users/me`

---

## 10. 重要設計決策與慣例

### API URL 絕不寫死 localhost

瀏覽器端的 API 呼叫一律透過 `resolveApiBaseUrl()`：

```typescript
// apps/web/lib/api-client.ts
export function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.CMS_API_INTERNAL_URL ?? 'http://api:3000/api/v2';
  }
  return `http://${window.location.hostname}:3101/api/v2`;
}
```

**原因**：外網設備（手機/iPad）的 hostname 不是 localhost，寫死會讓外網無法使用。

### 登入後導向用 window.location.href

```typescript
// 正確（硬導向，清除 Next.js client 快取）
window.location.href = '/admin';

// 錯誤（不要用 router.push，可能有快取問題）
router.push('/admin');
```

### Prisma select vs include

使用 `select: CONST` + `Prisma.XxxGetPayload<{ select: typeof CONST }>` 而**不是** `include: CONST`：

```typescript
// 正確寫法
const STORE_SELECT = {
  id: true,
  dealer: { select: { id: true, name: true } },
} satisfies Prisma.StoreSelect;

type StoreWithDealer = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;
```

**原因**：`include: variable` 時 Prisma 無法推斷泛型回傳型別，會產生 TS2559/TS2345 型別錯誤。

### 空 body 的 void 端點

呼叫不需要 body 的 PATCH/POST 端點時，不要省略 Content-Type：

```typescript
// 正確
fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
```

**原因**：NestJS 預設驗證 `Content-Type: application/json`，沒帶 header 會 415。

### Prisma generate 時機

每次 `schema.prisma` 新增 model/欄位/relation 後，都需要在 api 容器執行：

```bash
npx prisma generate
```

否則 TypeScript 會找不到新欄位，`tsc --noEmit` 會報錯。

---

## 11. 顧客核心流程

### 建立顧客（含同意書簽署）

1. 填入姓名、身分證（鎖定欄位）、電話等基本資料
2. 若是外泌體使用者：同步顯示同意書 → **服務人員電子簽名** → **顧客電子簽名**
3. 簽署完成後：
   - 生成 `customerCode = {store.code}-{nationalId}`（如 `A01-A123456789`）
   - 生成 PDF（pdf-lib），embeds 兩個簽名圖
   - `isExosomeUser = true`，`disclaimerFullySigned = true`

### 補簽同意書（後來才決定使用外泌體）

1. **服務人員補簽**（`POST /sign-staff-disclaimer`）：
   - 若顧客尚無 `customerCode` 且有 `nationalId`：**先**生成 `customerCode`
   - 建立 PDF（header 帶入正確 `customerCode`）
   - 服務人員簽名 embeds 進 PDF
   - 同時儲存 `contentSnapshot`（凍結版面座標）到 `Signature` 記錄
2. **顧客補簽**（`POST /sign-disclaimer`）：
   - 從 `Signature.contentSnapshot` 重建版面（確保座標與 PDF 完全對齊）
   - 在既有 PDF 上疊加顧客簽名
   - 更新 `disclaimerFullySigned = true`

### 顧客編號規則

格式：`{分店代碼}-{身分證字號}` → 例如 `A01-A123456789`

- 新建顧客且同步簽署同意書時：建立時生成
- 補簽同意書時：**服務人員簽署當下**生成（PDF 建立前，確保 PDF header 正確）
- 若無身分證字號：暫無顧客編號（等到身分證填入後的下一個操作自動補上）

---

## 12. POS 結帳流程

### 三種消費方式

| 方式 | 說明 | 後端驗證 |
|------|------|---------|
| `single_purchase` | 單次消費，按定價收費 | `amountPaid === serviceItem.price`，422 if 不符 |
| `wallet_deduction` | 扣儲值金 | 驗 wallet 餘額足夠 |
| `course_deduction` | 扣課程堂數 | 自動扣最舊課程（`purchasedAt` 最早），驗剩餘堂數 |

### 多重付款方式

`single_purchase` 時，顧客可組合付款：

```json
payments: [
  { "method": "cash", "amount": 1000 },
  { "method": "line_pay", "amount": 500 }
]
```

前端強制：`sum(payments) === serviceItem.price`，差額 ≠ 0 時按鈕禁用。

### exosomeBlocked 邏輯

```typescript
// 外泌體使用者若尚未完成同意書流程，POS 結帳時顯示警告
const exosomeBlocked =
  isExosomeUser &&
  !disclaimerFullySigned &&
  !exosomeConsentSignatureUrl;
// 三個條件都成立才算被擋：有勾外泌體、同意書未雙簽、也沒有外泌體同意書簽名
```

補簽完成（`disclaimerFullySigned = true`）後自動解除封鎖。

### 課程合併顯示

前端將同一 `serviceItemId` 的多張 `CustomerCourse` 合併成一筆顯示（總剩餘堂數加總）。後端扣堂時自動從 `purchasedAt` 最舊的開始扣。

---

## 13. 外泌體同意書流程

```
[服務人員操作]
  signStaffDisclaimer()
    ↓
  1. 計算 customerCode（若無）
  2. 建立 PDF（pdf-lib + 版面凍結至 contentSnapshot）
  3. 服務人員簽名 embed 進 PDF
  4. 儲存 Signature 記錄（含 contentSnapshot）
  5. 更新 Customer: isExosomeUser=true, disclaimerStaffSignedAt
  6. 儲存 customerCode 到 DB

[顧客操作]
  signDisclaimer()
    ↓
  1. 從 Signature.contentSnapshot 取回凍結版面
  2. 用凍結版面重算座標（不用現在的顧客資料，避免欄位被改過造成座標偏移）
  3. 在既有 PDF 上疊加顧客簽名
  4. 更新 Customer: disclaimerCustomerSignedAt
  5. disclaimerFullySigned = true（雙方都已簽）
```

同意書 PDF 路徑：`/workspace/uploads/customers/{customerId}/disclaimer.pdf`

---

## 14. 財務雙軌設計

外包支付和現金支出需要**同時**記錄在兩個獨立系統：

### 外包支付

```typescript
await prisma.$transaction(async (tx) => {
  // 財務系統：記一筆支出
  await tx.financialRecord.create({
    data: { type: 'expense', category: 'outsource_payout', amount, storeId }
  });
  // 備用金系統：扣除備用金
  await tx.pettyCashLog.create({
    data: { action: 'outsource_deduct', amount, balanceAfter: newBalance, storeId }
  });
  // 同步更新 Store.pettyCashBalance
  await tx.store.update({ where: { id: storeId }, data: { pettyCashBalance: newBalance } });
});
```

### 備用金餘額快照

每筆 `PettyCashLog` 都記錄操作後的 `balanceAfter`，方便對帳和重算。`Store.pettyCashBalance` 是目前餘額的快照，應與最新一筆 log 的 `balanceAfter` 一致。

---

## 15. 即時通訊系統

### WebSocket 連線

- namespace：`/chat`
- 認證：連線時帶 JWT token（`handshake.auth.token`）
- 事件：`newMessage`（新訊息推送）、`messageRead`（已讀更新）

### 聯絡人規則（自動篩選）

| 角色 | 可聯絡對象 |
|------|-----------|
| `system_admin` / `admin` | 所有 dealer、manager、admin、system_admin |
| `general_agent` / `dealer` | 自己區域的所有店長 + 所有 admin/system_admin |
| `manager` | 自己分店的 staff/accountant + 所在區域的 dealer/general_agent + 所有 admin/system_admin |
| `staff` / `accountant` | 自己分店的店長 + 所有 admin/system_admin |

Admin 可透過 `ChatContactPermission` 覆寫任何帳號的聯絡人清單。

### 未讀數

側欄「內部訊息」按鈕顯示未讀數，由 WebSocket `newMessage` 事件即時更新，不需要輪詢。

---

## 16. 分店功能開關（Feature Toggle）

### DB 儲存

`Store.features` 為 JSON 欄位，格式：

```json
{ "pos": true, "attendance": true, "crm": false }
```

未列出的 key 視同 `false`，應用層解析。

### 登入時取得

`POST /auth/login` 回傳的 user 資訊包含 `storeFeatures`（從 DB 即時查詢，**不存入 JWT** 避免舊 token 和最新設定不同步）。

### Feature Gate 邏輯

```typescript
// admin/system_admin 永遠通過
if (role === 'admin' || role === 'system_admin') return true;
// 其他：需 Store.features[key] === true
return storeFeatures?.[key] === true;
```

### 更新 features 後

前端立即更新 cookie 中的 `storeFeatures`，側欄導覽即時反映，不需重新登入。

---

## 17. 已完成功能清單

### 認證與帳號系統
- [x] Username（帳號名稱）登入，不使用 Email 登入
- [x] JWT + Cookie 認證
- [x] 8 種角色 RBAC
- [x] 帳號建立矩陣（CREATOR_CAN_ASSIGN）
- [x] 北/中/南三區（A/B/C）區域代碼
- [x] parentId / dealerId 帳號層級追蹤
- [x] 個人設定：自行修改姓名、Email、帳號、電話、密碼
- [x] 管理員強制重設密碼
- [x] 帳號軟刪除
- [x] 負責代理商指派（Store.dealerId / User.dealerId）

### 分店管理
- [x] 分店 CRUD（含區域代碼自動產生，pg advisory lock 防併發）
- [x] 分店功能開關（pos / attendance / crm）
- [x] dealer/general_agent 只看自己區域的分店
- [x] 員工帳號管理（店長專用頁面）
- [x] 分店負責代理商可指派/更換

### 顧客管理
- [x] 顧客建立（姓名 + 身分證終身鎖定）
- [x] 顧客編號自動生成（`{store.code}-{nationalId}`）
- [x] 外泌體同意書雙方電子簽名（服務人員先簽/顧客後簽）
- [x] 補簽同意書流程（PDF contentSnapshot 凍結座標）
- [x] 補簽時自動生成顧客編號（並帶入 PDF header）
- [x] 療程紀錄（手動記錄 + 照片上傳）
- [x] 外泌體使用同意書（hasExosomeConsent）

### POS 結帳
- [x] 三種消費方式（單次消費 / 扣儲值金 / 扣課程堂數）
- [x] 多重付款方式（現金、轉帳、LINE Pay、信用卡）
- [x] 定價一致性驗證（前後端雙層）
- [x] 顧客電子簽名
- [x] 同服務項目多張課程合併顯示，自動扣最舊課程
- [x] exosomeBlocked 正確邏輯（補簽完成後解除封鎖）
- [x] 核銷還原（manager+ 可還原，usedSessions 恢復）

### 庫存
- [x] 各分店庫存查詢
- [x] 商品使用記錄
- [x] 補貨請求流程
- [x] 庫存調撥

### 財務
- [x] 收入/支出記錄
- [x] 備用金獨立系統（增減 / 紀錄 / 餘額快照）
- [x] 外包支付雙軌寫入（transaction 同時寫 FinancialRecord + PettyCashLog）
- [x] 支出管理（支出項目記錄）

### 打卡 / 考勤
- [x] 上下班打卡
- [x] 月份考勤統計
- [x] 業績統計 dashboard

### 即時通訊
- [x] 一對一聊天（WebSocket）
- [x] 未讀數即時更新
- [x] 依角色自動建立聯絡人清單
- [x] Admin 覆寫聯絡人清單

### 其他
- [x] 動態 API URL（不寫死 localhost）
- [x] Feature Gate（分店功能開關控制導覽）
- [x] 根路徑重導向 `/admin/login`
- [x] 靜態檔案伺服（`/api/v2/uploads/`）
- [x] 聯絡訊息管理（含轉發給分店）
- [x] 促銷方案管理
- [x] 課程退費轉儲值金
- [x] 課程轉換
