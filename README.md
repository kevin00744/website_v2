# 璨妍 ERP 後台管理系統

> 版本：website_v2　｜　最後更新：2026-08-04

---

## 目錄

1. [專案概述](#1-專案概述)
2. [技術棧](#2-技術棧)
3. [系統架構](#3-系統架構)
4. [目錄結構](#4-目錄結構)
5. [資料庫模型](#5-資料庫模型)
6. [角色與權限](#6-角色與權限)
7. [後端模組說明](#7-後端模組說明)
8. [前端頁面說明](#8-前端頁面說明)
9. [導覽設定與 Feature Gate](#9-導覽設定與-feature-gate)
10. [本機開發啟動方式](#10-本機開發啟動方式)
11. [已完成功能清單](#11-已完成功能清單)

---

## 1. 專案概述

璨妍生技品牌的**分店 ERP 後台系統**，供各分店店長、員工、總部管理員日常操作使用。系統涵蓋：

- 顧客管理（CRM）、同意書簽署、療程紀錄
- POS 結帳（服務消費、儲值扣點、課程扣堂）
- 庫存管理與補貨請求
- 打卡與出勤統計
- 財務帳務與備用金獨立管理
- 支出管理、外包項目雙軌記錄
- 即時通訊（庫存請求頻道）
- 聯絡訊息管理
- 促銷方案管理
- 分店功能開關（Feature Toggle）

> **注意**：公開形象官網（CMS/Puck 區塊編輯器）已於 2026-08 從本專案移除，系統現在**僅保留後台**。根路徑 `/` 自動導向 `/admin/login`。

---

## 2. 技術棧

| 層次 | 技術 |
|------|------|
| 後端框架 | NestJS 10（TypeScript） |
| 前端框架 | Next.js 14（App Router，TypeScript） |
| 資料庫 | PostgreSQL 15 |
| ORM | Prisma v5 |
| 容器 | Docker Compose（node:20-slim） |
| 認證 | JWT（`@nestjs/jwt`）+ Cookie |
| 即時通訊 | WebSocket（`@nestjs/websockets`） |
| 表單驗證 | React Hook Form + Zod |
| 樣式 | Tailwind CSS（自訂 kiosk design token） |

---

## 3. 系統架構

```
[瀏覽器 / iPad]
       │  HTTP (port 80)
       ▼
┌──────────────────┐
│  website_v2_web  │  Next.js 14 App Router
│  (node:20-slim)  │  port 3000 → 對外 80
└────────┬─────────┘
         │ CMS_API_INTERNAL_URL=http://api:3000/api/v2
         │ (Server Components 用內部 Docker 網路)
         │
         │ resolveApiBaseUrl()
         │ (Browser 端依 window.location.hostname 動態組 API URL)
         ▼
┌──────────────────┐
│  website_v2_api  │  NestJS REST API
│  (node:20-slim)  │  port 3000 → 對外 3101
└────────┬─────────┘
         │ Prisma ORM
         ▼
┌──────────────────┐
│  website_v2_db   │  PostgreSQL 15
│  (postgres:15)   │  port 5432 → 對外 5433
└──────────────────┘
```

### API 網址規則

- **瀏覽器端**：`resolveApiBaseUrl()` 依 `window.location.hostname` 動態組成，**不寫死 localhost**
- **容器內部**（Server Components）：環境變數 `CMS_API_INTERNAL_URL=http://api:3000/api/v2`
- **全域前綴**：`/api/v2`
- **靜態檔案**：療程照片等上傳檔案由 `/api/v2/uploads/:filename` 靜態伺服

---

## 4. 目錄結構

```
website_v2/
├── apps/
│   ├── api/                          # NestJS 後端
│   │   ├── prisma/
│   │   │   └── schema.prisma         # 資料庫 schema（含所有 model/enum）
│   │   └── src/
│   │       ├── app.module.ts
│   │       ├── main.ts
│   │       ├── auth/                 # JWT 認證、角色守門
│   │       ├── attendance/           # 打卡模組
│   │       ├── chat/                 # 即時通訊（WebSocket）
│   │       ├── common/               # 共用工具（upload.util、AppError、filters）
│   │       ├── contact/              # 聯絡訊息
│   │       ├── customers/            # 顧客、療程紀錄、同意書、錢包、課程
│   │       ├── financial/            # 財務帳務（收入/支出）
│   │       ├── inventory/            # 庫存管理、補貨請求
│   │       ├── petty-cash/           # 備用金（獨立系統）
│   │       ├── prisma/               # PrismaService
│   │       ├── promotion-plans/      # 促銷方案
│   │       ├── rbac/                 # 角色存取控制
│   │       ├── service-items/        # 服務品項
│   │       ├── service-records/      # POS 服務紀錄
│   │       ├── signature/            # 電子簽名
│   │       ├── stores/               # 分店管理、Feature Toggle
│   │       └── users/                # 帳號管理
│   └── web/                          # Next.js 前端
│       ├── app/
│       │   ├── page.tsx              # 根路徑 → redirect /admin/login
│       │   ├── layout.tsx
│       │   └── (admin)/              # 後台頁面群組
│       │       ├── admin/            # 後台首頁 shell
│       │       ├── attendance/       # 打卡頁
│       │       ├── chat-contacts/    # 聊天清單管理
│       │       ├── contact-categories/
│       │       ├── contact-messages/
│       │       ├── customers/        # 顧客資料（含 POS 結帳入口）
│       │       ├── expenses/         # 支出管理
│       │       ├── financial/        # 財務帳務
│       │       ├── inventory/        # 庫存管理
│       │       ├── login/            # 登入頁
│       │       ├── manager-dashboard/# 考勤 & 業績
│       │       ├── petty-cash/       # 備用金管理
│       │       ├── promotion-plans/
│       │       ├── settings/         # 個人設定
│       │       ├── store-service-items/
│       │       ├── store-settings/   # 分店功能設定
│       │       ├── store-staff/      # 員工帳號管理
│       │       ├── stores/           # 分店管理
│       │       └── users/            # 帳號管理
│       ├── components/
│       │   ├── admin/
│       │   │   ├── customers/        # POS、顧客詳情、療程紀錄、簽名等
│       │   │   ├── kiosk/            # 共用 UI 元件（KioskButton、KioskInput…）
│       │   │   └── AdminShell.tsx    # 側欄導覽 shell
│       │   └── shared/
│       ├── hooks/                    # useStoreFeatures 等自訂 hook
│       └── lib/
│           ├── api-client.ts         # apiRequest + resolveApiBaseUrl
│           ├── auth.ts               # JWT cookie 存取
│           ├── navigationConfig.ts   # 統一導覽設定（含 featureKey/roleGuard）
│           ├── customers-api.ts
│           ├── service-records-api.ts
│           ├── petty-cash-api.ts
│           ├── financial-api.ts
│           └── ...（各模組 API client）
└── packages/
    └── shared-types/                 # 前後端共用 TypeScript 型別與 Zod schema
```

---

## 5. 資料庫模型

### 使用者與分店

```
User               分店員工帳號（role、storeId、region）
Store              分店（含 pettyCashBalance、features JSON）
```

### 顧客系統

```
Customer           顧客（姓名鎖定、身分證鎖定，其餘可編輯）
CustomerWallet     儲值錢包
WalletLog          錢包變動記錄
CustomerCourse     課程堂數
CustomerTreatmentRecord  手動療程紀錄（含照片）
Signature          電子簽名記錄（外泌體同意書等）
```

### POS / 服務

```
ServiceItem        服務品項（名稱、價格、是否外包）
ServiceRecord      POS 服務紀錄
  - consumptionType: single_purchase | wallet_deduction | course_deduction
  - payments: Json   多重付款方式 [{method, amount}, ...]
  - customerSignatureUrl
```

### 庫存

```
StoreInventory     各分店庫存數量
InventoryLog       庫存異動紀錄（restock/consumption/adjustment/transfer_in/transfer_out）
RestockRequest     補貨請求（分店→總部）
Product            商品主檔（SKU、名稱、單位）
```

### 財務

```
FinancialRecord    財務紀錄（收入/支出，不含備用金）
  - type: income | expense
  - category: service_income | outsource_payout | daily_expense | ...

PettyCashLog       備用金異動（獨立系統，不和 FinancialRecord 混用）
  - action: add | remove | outsource_deduct | expense_deduct
  - balanceAfter    每筆附餘額快照
```

> **備用金雙軌設計**：外包支付（outsource_payout）和日常現金支出（cash daily_expense）在同一個 Prisma transaction 中，**同時寫入** `FinancialRecord`（支出端）和 `PettyCashLog`（備用金扣除），兩系統各自獨立運作。

### 打卡 / 考勤

```
AttendanceLog      上下班打卡紀錄（storeId、userId、type、時間）
```

### 即時通訊

```
Conversation       對話（庫存請求/顧客詢問/一般聊天）
ConversationParticipant
Message            訊息（含 MessageStatus: sent/delivered/read）
ChatContactPermission
```

### 其他

```
PromotionPlan      促銷方案
PromotionPlanItem
ContactMessage     官網聯絡表單訊息
InquiryCategory    詢問類別
DisclaimerTemplate 同意書範本
```

---

## 6. 角色與權限

| 角色 | 說明 | 管轄範圍 |
|------|------|---------|
| `system_admin` | 系統最高權限 | 全部 |
| `admin` | 總部管理員 | 全部 |
| `dealer` | 區域代理商 | 自己負責的區域（north/central/south） |
| `manager` | 店長 | 自己所屬分店 |
| `staff` | 員工 | 自己所屬分店（受限功能） |
| `editor` | 編輯（已無用途，保留相容） | — |

### RBAC 規則

- 後端每個 Controller 以 `@Roles(...)` decorator 宣告最低需求角色
- `JwtAuthGuard` + `RolesGuard` 自動攔截
- `manager` 只能操作**自己分店**的資料（service 層 assertXxxAccess 驗證）
- `dealer` 可跨分店但限制在自己的 region
- `admin` / `system_admin` 無任何資料範圍限制

---

## 7. 後端模組說明

### `auth`

- `POST /api/v2/auth/login` — 登入，回傳 JWT + user 資訊（含 `storeFeatures`）
- `GET /api/v2/auth/me` — 驗證 token，即時從 DB 查詢 storeFeatures

### `stores`

- CRUD 分店
- `PATCH /api/v2/stores/:id/features` — 更新分店功能開關（`{ pos, attendance, crm }`）

### `customers`

- 顧客 CRUD（姓名/身分證終身鎖定）
- 療程紀錄 + 照片上傳（`/api/v2/uploads/:filename` 靜態伺服）
- 同意書電子簽名流程
- 顧客錢包、課程堂數管理

### `service-records`

- `POST /api/v2/stores/:storeId/service-records` — 建立 POS 服務紀錄
  - `single_purchase`：`amountPaid` 必須等於 `serviceItem.price`（後端 422 驗證）
  - `payments`：JSON 陣列，支援多重付款方式
- `GET /api/v2/stores/:storeId/service-records/by-customer/:customerId` — 顧客使用紀錄

### `financial`

- `GET/POST /api/v2/stores/:storeId/financial` — 財務帳務（僅收入/支出）
- 外包支付自動同時寫入 `PettyCashLog`（`outsource_deduct`）

### `petty-cash`（獨立系統）

- `GET /api/v2/stores/:storeId/petty-cash/balance` — 查詢備用金餘額
- `GET /api/v2/stores/:storeId/petty-cash/logs` — 異動紀錄（可過濾日期）
- `POST /api/v2/stores/:storeId/petty-cash/adjust` — 手動增減（add/remove）

### `inventory`

- 庫存查詢、商品使用記錄
- 補貨請求（RestockRequest）流程

### `attendance`

- 打卡（上班/下班）
- 考勤與業績統計

---

## 8. 前端頁面說明

| 路徑 | 頁面名稱 | 最低角色 |
|------|---------|---------|
| `/admin/login` | 登入 | 無 |
| `/admin/customers` | 顧客資料 | staff |
| `/admin/inventory` | 庫存管理 | manager |
| `/admin/attendance` | 打卡 | staff（需分店啟用） |
| `/admin/manager-dashboard` | 考勤 & 業績 | manager（需分店啟用） |
| `/admin/stores` | 分店管理 | dealer |
| `/admin/store-settings` | 分店功能設定 | manager |
| `/admin/store-staff` | 員工帳號管理 | manager |
| `/admin/financial` | 財務帳務 | manager |
| `/admin/petty-cash` | 備用金管理 | manager |
| `/admin/expenses` | 支出管理 | staff（需分店啟用） |
| `/admin/store-service-items` | 服務品項管理 | manager（需分店啟用） |
| `/admin/promotion-plans` | 促銷方案管理 | manager |
| `/admin/contact-messages` | 聯絡訊息 | manager |
| `/admin/contact-categories` | 詢問類別管理 | admin |
| `/admin/users` | 帳號管理 | dealer |
| `/admin/chat-contacts` | 聊天清單管理 | admin |
| `/admin/settings` | 個人設定 | 所有人 |

### POS 結帳流程（`POSCheckoutModal`）

1. 選擇服務品項
2. 選擇消費方式（單次消費 / 扣儲值金 / 扣課程堂數）
3. `single_purchase` 時：
   - 顯示固定定價（不可修改）
   - 可新增多種付款方式（現金、轉帳、LINE Pay、信用卡），合計必須等於定價
   - 若金額不符 → 按鈕禁用 + 顯示差額
4. 顧客電子簽名
5. 送出 → 後端驗證價格一致性（422 若不符）
6. 結帳完成 → 自動切換到「使用紀錄」tab 顯示 POS 服務紀錄

---

## 9. 導覽設定與 Feature Gate

### 設定檔

`apps/web/lib/navigationConfig.ts` — 統一管理所有側欄導覽項目

```typescript
export type FeatureKey = 'pos' | 'attendance' | 'crm';

export interface NavItem {
  href: string;
  label: string;
  featureKey?: FeatureKey;      // 需分店啟用此功能才顯示
  roleGuard?: (role) => boolean; // 角色守門
}
```

### Feature Toggle 邏輯

- `admin` / `system_admin` **永遠通過** feature gate
- 其他角色：需要 `Store.features[key] === true`
- 分店 features 在**登入時**由後端查詢 DB 後放入 JWT user payload
- 店長可在「分店功能設定」頁即時調整，更新後立即反映（不需重新登入）

---

## 10. 本機開發啟動方式

### 前置條件

- Docker Desktop 已啟動

### 啟動容器

```bash
cd website_v2
docker compose up -d
```

### 啟動 API dev server

```bash
docker exec -d website_v2_api sh -c \
  "cd /workspace/apps/api && npm run start:dev > /tmp/api.log 2>&1"

# 查看 log
docker exec website_v2_api sh -c "tail -f /tmp/api.log"
```

### 啟動 Web dev server

```bash
docker exec -d website_v2_web sh -c \
  "cd /workspace/apps/web && npm run dev > /tmp/web.log 2>&1"

# 查看 log
docker exec website_v2_web sh -c "tail -f /tmp/web.log"
```

### 連線位置

| 服務 | URL |
|------|-----|
| 後台前端 | http://localhost（port 80） |
| API | http://localhost:3101/api/v2 |
| 資料庫 | localhost:5433（DB: website_v2, user: website_v2_user） |

### 資料庫 Migration

```bash
docker exec website_v2_api sh -c \
  "cd /workspace/apps/api && npx prisma migrate dev --name <migration_name>"
```

### 型別檢查

```bash
# 後端
docker exec website_v2_api sh -c \
  "cd /workspace/apps/api && npx tsc --noEmit"

# 前端
docker exec website_v2_web sh -c \
  "cd /workspace/apps/web && npx tsc --noEmit"
```

### 建立系統管理員帳號

```javascript
// 建立 script 並複製到容器執行
const { PrismaClient } = require('/workspace/apps/api/node_modules/@prisma/client');
const bcrypt = require('/workspace/node_modules/bcryptjs');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://website_v2_user:secret@db:5432/website_v2' } }
});
async function main() {
  const hash = await bcrypt.hash('your_password', 10);
  const user = await prisma.user.create({
    data: { email: 'admin@example.com', password: hash, name: 'Admin', role: 'system_admin' }
  });
  console.log('建立成功 id:', user.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());
```

```bash
docker cp create_user.js website_v2_api:/tmp/
docker exec website_v2_api node /tmp/create_user.js
```

---

## 11. 已完成功能清單

### 顧客管理
- [x] 顧客建立（姓名 + 身分證字號終身鎖定）
- [x] 基本資料編輯（電話、地址、LINE、Email、備註）
- [x] 顧客刪除（軟刪除，限 admin 以上）
- [x] 外泌體同意書雙方電子簽名流程
- [x] 療程紀錄（手動記錄 + 照片上傳）

### POS 結帳
- [x] 服務品項選擇
- [x] 三種消費方式（單次消費 / 扣儲值金 / 扣課程堂數）
- [x] 多重付款方式（現金、轉帳、LINE Pay、信用卡）
- [x] 定價一致性強制驗證（前後端雙層）
- [x] 顧客電子簽名
- [x] POS 紀錄顯示於顧客使用紀錄

### 庫存
- [x] 各分店庫存查詢
- [x] 商品使用記錄
- [x] 補貨請求流程（分店申請 → 總部核准）
- [x] 庫存調撥（分店間轉移）

### 財務
- [x] 收入/支出記錄
- [x] 備用金獨立系統（增減 / 紀錄 / 餘額快照）
- [x] 外包支付雙軌寫入（財務 + 備用金同步）
- [x] 日常現金支出雙軌寫入

### 打卡 / 考勤
- [x] 上下班打卡
- [x] 月份考勤統計
- [x] 業績統計（店長 dashboard）

### 分店管理
- [x] 分店 CRUD
- [x] 分店功能開關（pos / attendance / crm）
- [x] 員工帳號管理（分店層級）

### 系統
- [x] JWT 認證 + Cookie
- [x] RBAC 角色守門（6 個角色）
- [x] 動態 API URL（不寫死 localhost）
- [x] 打卡頁 SSR 水合錯誤修正
- [x] 根路徑重導向 `/admin/login`
- [x] 靜態檔案伺服（`/api/v2/uploads/`）
