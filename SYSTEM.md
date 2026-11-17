# 璨妍 ERP 後台管理系統 — 系統說明書

> 版本：website_v2　｜　最後更新：2026-11-17

---

## 目錄

1. [專案概述](#1-專案概述)
2. [技術棧](#2-技術棧)
3. [系統架構與部署](#3-系統架構與部署)
4. [目錄結構](#4-目錄結構)
5. [資料庫模型](#5-資料庫模型)
6. [角色與權限](#6-角色與權限)
7. [後端 API 模組](#7-後端-api-模組)
8. [前端頁面](#8-前端頁面)
9. [核心流程](#9-核心流程)
10. [重要設計決策與慣例](#10-重要設計決策與慣例)
11. [已完成功能清單](#11-已完成功能清單)

---

## 1. 專案概述

璨妍生技品牌的**單店 ERP 後台系統**，供店長、員工、會計及總部管理員日常操作使用。

- **單店模式**：璨妍門市（store id 24，代碼 DEFAULT），無區域 / 代理商概念。
- **使用裝置**：主要是 iPad。支援「加入主畫面」以全螢幕 App 方式使用，並可切換文字大小（標準 / 大 / 特大，每台裝置各自記住）。
- **LINE 官方帳號**：顧客可在 LINE 綁定、查詢資料、送出預約申請。

---

## 2. 技術棧

| 層次 | 技術 | 版本 |
|------|------|------|
| 後端框架 | NestJS | 10 |
| 前端框架 | Next.js App Router | 14 |
| 語言 | TypeScript | 5 |
| 資料庫 | PostgreSQL | 16 |
| ORM | Prisma | 5 |
| 容器 | Docker Compose（node:20-slim、postgres:16-alpine） | — |
| 反向代理 | 主機 nginx + Let's Encrypt（certbot.timer 自動續期） | — |
| 認證 | JWT access token + 180 天滑動 refresh token | — |
| 表單驗證 | React Hook Form + Zod | — |
| 樣式 | Tailwind CSS（kiosk design token） | — |
| PDF | pdf-lib（產生、蓋簽名）、pdfjs-dist 3.11（iPhone / iPad 顯示） | — |
| 即時通訊 | Socket.IO | — |
| 共用型別 / 文案 | `packages/shared-types`、`packages/copy`（錯誤碼中文） | — |

---

## 3. 系統架構與部署

```
[瀏覽器 / iPad 主畫面 App]
        │ https://www.tsanyentest.com
        ▼
┌───────────────────────────────┐
│ 主機 nginx（Let's Encrypt）     │  /etc/nginx/sites-enabled/website_v2
│  /api/、/socket.io/ → :3101    │
│  其他路徑            → :3000    │
└──────┬──────────────────┬─────┘
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│ api 容器      │   │ web 容器      │
│ NestJS        │   │ Next.js       │
│ 127.0.0.1:3101│   │ 127.0.0.1:3000│
└──────┬───────┘   └──────────────┘
       ▼ Prisma
┌──────────────────────────────┐
│ db 容器 PostgreSQL 16          │  volume: website_v2_prod_db_data
└──────────────────────────────┘
```

- 定義檔：`docker-compose.prod.yml`，project 名稱 `website_v2_prod`，容器 `website_v2_prod-{db,api,web}-1`，`restart: unless-stopped`。
- 專案資料夾 `/opt/website_v2` 掛載進容器的 `/workspace`。API 跑 `apps/api/dist`，網站跑 `apps/web/.next`，**兩者都要先在主機上建置好**。
- API 容器啟動時先 `prisma migrate deploy`，所以重啟就會套用新的 migration。
- 上傳檔與 PDF 存在 `apps/api/storage/`（`customers/<id>/disclaimer.pdf`、療程照片等）。
- 部署用 `deploy.sh`，維運細節見 [Start.md](./Start.md)。
- `docker-compose.yml` 是舊的開發用設定（自簽憑證 nginx、需手動啟動行程），正式環境不使用。

---

## 4. 目錄結構

```
website_v2/
├── docker-compose.prod.yml   # 正式環境
├── deploy.sh                 # 一鍵部署
├── .env                      # 環境變數（不進版控）
├── .trail/learnings/         # 開發決策紀錄
├── apps/
│   ├── api/                  # NestJS 後端
│   │   ├── prisma/           # schema.prisma、migrations/
│   │   ├── scripts/          # 一次性維運腳本
│   │   ├── storage/          # 顧客 PDF、照片、CMS 上傳檔
│   │   └── src/              # 各模組（見第 7 節）
│   └── web/                  # Next.js 前端
│       ├── app/(admin)/      # 後台頁面
│       ├── app/liff/         # LINE LIFF 顧客頁面（綁定 / 我的資料 / 預約）
│       ├── components/admin/ # 元件（customers、calendar、kiosk…）
│       ├── lib/              # API client 與工具
│       └── public/           # manifest.json、圖示
└── packages/
    ├── shared-types/         # 前後端共用型別 / Zod schema
    └── copy/                 # 錯誤碼 → 中文訊息（zh-TW.ts）
```

---

## 5. 資料庫模型

### 使用者與分店
- **User**：`username`（登入用、唯一）、`role`、`storeId`、`isActive`、`deletedAt`。email 選填。另有停用的 `line-bot` 帳號，作為 LINE 自動建立顧客的建立者。
- **Store**：`code`、`name`、`features`（功能開關）、`pettyCashBalance`（備用金餘額快照）。

### 顧客
- **Customer**：`name`、`nationalId`（終身鎖定）、`customerCode`（`DEFAULT-身分證`）、`phone`（只存數字，例如 0981675415）、`isExosomeUser`、同意書簽署狀態欄位、軟刪除（`deletedAt`、`deletedById`，3 天內可還原）。
  - `storeCredit` 是舊欄位，已不使用；儲值金一律在 CustomerWallet。
- **Signature**：每次簽名的存證，`contentSnapshot` 凍結簽署當下的同意書內容（含 `templateVersion`、`layoutVersion`），以及雜湊。
- **DisclaimerTemplate**：同意書範本。`version`（v1、v2…）、`title`、`sections`（`[{ heading, paragraphs[], requiresSignature }]`）、`isActive`（同一時間只有一個使用中）。
- **CustomerWallet**：`balance`（本金）、`bonusBalance`（贈送金）。**WalletLog** 記錄每次增減。
- **CustomerCourse**：`totalSessions`、`usedSessions`、`transactionId`、`voidedAt`（所屬交易被刪除時作廢，查剩餘堂數時都要排除）。
- **LineAccount**：LINE userId 與顧客的綁定。

### 交易（結帳的主表）
- **CustomerTransaction**：每次 POS 結帳、購買方案、直接儲值、課程退費、退課轉儲值各一筆。
  - `kind`：`service` / `plan_purchase` / `top_up` / `refund` / `refund_to_credit`
  - `amount`（實收 / 實扣 / 實退）、`listAmount`（原價 / 試算）、`adjustNote`（結帳時的調整備註）
  - `planOriginal` / `planActual`：方案原內容 vs 實際成交
  - `legacy`：系統上線前補建、無法回溯的紀錄
  - `deletedAt`、`deletedById`、`deleteReason`
  - 這筆交易產生的 FinancialRecord、WalletLog、CustomerCourse 都用 `transactionId` 連回來
- **CustomerTransactionLog**：歷程（`create` / `delete`）。`detail.effects` 記下關聯查不到的回溯資訊，例如扣堂明細 `courseDeductions`、退費 `courseRefund`。

### POS / 財務
- **ServiceRecord**：POS 服務紀錄（`consumptionType`、`payments`、簽名、`isRolledBack`）。已還原 / 已刪除的不計入業績與外包待付。
- **FinancialRecord**：收入 / 支出（分類 `sales`、`top_up`、`outsource_payout`、`daily_expense`、`refund`…），`deletedAt` 標記刪除後不計入財務頁、日結、CSV。
- **PettyCashLog**：備用金手動增減紀錄。

### 預約 / 方案 / 其他
- **Appointment**：`startAt`、`endAt`、`status`（booked / confirmed / arrived / completed / cancelled / no_show）、`source`（staff / line）、`staffId`、`customerId`（可為空，另存姓名電話快照）。
- **PromotionPlan / PromotionPlanItem**：套裝方案（課程套組、儲值優惠）。
- **ServiceItem**：服務品項與單次定價。
- **LINE 相關**：LineAccount、LineBookingItem（可在 LINE 預約的品項與時長）、LineSetting。

---

## 6. 角色與權限

| 角色 | 中文 | 範圍 |
|------|------|------|
| `system_admin` | 系統管理員 | 全部 |
| `admin` | 總部管理員 | 全部（RolesGuard 會讓 admin 通過任何 `@Roles`） |
| `manager` | 店長 | 自己的分店 |
| `accountant` | 會計 | 自己的分店（財務 / 考勤） |
| `staff` | 員工 | 自己的分店（受限功能） |

### 側欄頁面（`apps/web/lib/navigationConfig.ts`）

| 頁面 | sys_admin | admin | manager | accountant | staff |
|------|:-:|:-:|:-:|:-:|:-:|
| 顧客資料 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 預約行事曆 | ✓ | ✓ | ✓ | — | ✓ |
| 打卡 | ✓ | ✓ | ✓ | — | ✓ |
| 考勤 & 業績、財務帳務 | ✓ | ✓ | ✓ | ✓ | — |
| 備用金管理 | ✓ | ✓ | ✓ | — | — |
| 支出管理 | ✓ | ✓ | ✓ | — | ✓ |
| 員工帳號、服務品項、促銷方案 | ✓ | ✓ | ✓ | — | — |
| LINE | ✓ | ✓ | ✓ | — | ✓ |
| 同意書管理 | ✓ | ✓ | — | — | — |
| 個人設定 | ✓ | ✓ | ✓ | ✓ | ✓ |

### 特別權限
- **刪除交易紀錄（回溯）**：只有 `system_admin`，在 service 層明確檢查（不能只靠 `@Roles`，因為 admin 會被放行）。
- **課程退費、退課轉儲值、課程轉換**：`manager`、`system_admin`。
- **還原課程核銷**：`manager` 以上。
- **同意書管理**：`admin`、`system_admin`。

---

## 7. 後端 API 模組

全域前綴 `/api/v2`。錯誤一律丟 `AppError('CODE', 訊息, 狀態碼)`，前端用 `packages/copy/zh-TW.ts` 轉成中文。

| 模組 | 主要端點 / 說明 |
|------|------|
| `auth` | `POST /auth/login`、`POST /auth/refresh`（用 refresh token 換新）、`POST /auth/me` |
| `users`、`stores` | 帳號、分店、員工、功能開關 |
| `customers` | 顧客 CRUD、快速建檔、`with-signature` 建檔並簽同意書、`:id/disclaimer`（PDF / 雙方簽署）、錢包、儲值、課程列表、療程紀錄、刪除 / 還原 |
| `consent-templates` | 同意書版本列表、內容、存新版本、設為使用中、PDF 預覽（草稿 / 已存） |
| `customer-courses` | `:id/refund-quote`（試算）、`:id/refund`（退費）、`:id/refund-to-credit`、`:id/convert` |
| `customer-transactions` | `GET /customers/:id/transactions`、`GET …/:id/delete-preview`、`DELETE /customer-transactions/:id` |
| `service-records` | POS 結帳（`/stores/:storeId/service-records`）、依顧客 / 員工 / 當日查詢、`:id/rollback` |
| `promotion-plans` | 方案 CRUD、`:planId/purchase`（可帶調整後的金額 / 贈送金 / 堂數 / 備註） |
| `appointments` | `/stores/:storeId/appointments`（區間查詢、新增、修改、刪除、撞期檢查） |
| `financial`、`petty-cash` | 收支紀錄、日結、CSV 匯出、備用金 |
| `line` | `/line/webhook`、`/line/liff/*`（綁定、我的資料、預約）、`/line/admin/*`（後台管理）、推播提醒 |
| `inventory`、`attendance`、`service-items`、`contact`、`chat`、`signature` | 庫存、打卡考勤、服務品項、聯絡訊息、即時通訊、簽名雜湊工具 |

---

## 8. 前端頁面

| 路徑 | 說明 |
|------|------|
| `/login` | 登入；可勾「記住此裝置」（主畫面 App 模式預設勾選），右上角可調文字大小 |
| `/admin` | 首頁、快速入口 |
| `/customers` | 顧客列表 + 詳細資料視窗。分頁：基本資料（含同意書狀態）、使用紀錄、課程管理（退費 / 轉儲值 / 轉換）、交易紀錄。按鈕：預約、POS 結帳、紀錄商品使用 |
| `/calendar` | 預約行事曆。日視圖每位服務人員一欄、週 / 月視圖；營業時間 13–21 點，營業時間外以斜紋標示；點空白新增、拖曳改時間；右側今日清單可一鍵報到 / 完成 |
| `/consent-templates` | 同意書管理：段落編輯、即時預覽、PDF 預覽、版本紀錄 |
| `/financial`、`/manager-dashboard`、`/petty-cash`、`/expenses` | 財務、考勤業績、備用金、支出 |
| `/line` | LINE 綁定清單、預約設定、狀態 |
| `/liff/*` | 顧客在 LINE 內開啟的頁面 |

共用元件重點：
- `AdminShell`：側欄、手機頂部列、文字大小、加入主畫面提示
- `POSCheckoutModal`：結帳，搭配 `AdjustQuickPicks` 快速選單
- `TransactionsTab` / `TransactionDetailModal`：交易紀錄與歷程
- `CourseRefundModal`：退費 / 轉儲值
- `PdfViewer`：iPhone / iPad 的 PDF 檢視器

---

## 9. 核心流程

### 同意書（只有一份）
1. 內容來自「同意書管理」目前使用中的版本。
2. 服務人員先簽（建檔時或在顧客頁「開始簽署同意書」）→ 產生 PDF，`contentSnapshot` 凍結內容與版面版本。
3. 顧客簽 → 依凍結的快照重算簽名位置，蓋在同一份 PDF 上 → `disclaimerFullySigned = true`。
4. 外泌體顧客要完成雙方簽署才能 POS 結帳。
5. 修改同意書會存成新版本，只影響之後新簽的顧客。

### POS 結帳
| 方式 | 規則 |
|------|------|
| 單次消費 | 可調整金額（打折 / 折價券 / 折抵 / 直接填），可多種付款方式組合，總和要等於應付 |
| 扣儲值 | 可調整扣款金額；先扣本金，不足再扣贈送金 |
| 扣堂 | 同品項**先買先用**，一次扣多堂時自動接續扣下一份；明細記在交易歷程 |
| 購買方案 | 可調整實收金額、贈送金額、各品項堂數（只能是方案內的品項） |
| 直接儲值 | 存入本金 |

所有調整都會記下原價、實收和備註（備註選填）。現金收入同步加到備用金。

### 課程退費 / 轉儲值
- 試算 = 單堂價 × 退回堂數。單堂價預設是「購買實收 ÷ 方案總堂數」，可以修改。
- 下方可用快速選單打折，或直接填金額。
- **退費**：財務記一筆 `refund` 支出；現金退款從備用金扣，不夠就擋下。
- **轉儲值**：存進顧客儲值金錢包（POS 扣儲值用的同一個）。

### 刪除交易（系統管理員）
1. 先預覽會回溯的項目，原因必填。
2. 在同一個資料庫 transaction 裡把效果全部反向：課程作廢或加回堂數、錢包扣回或退回、財務紀錄標記刪除、備用金調整、POS 紀錄標記已還原。
3. 已經用掉的堂數、已經花掉的儲值金會擋下，不能刪。
4. 交易本身保留並標示「已刪除」，歷程記下回溯明細。

### 預約與 LINE
- 預約有撞期檢查（同一服務人員、時段重疊），可確認後強制排入。
- LINE 顧客用「電話 + 姓名」綁定。LINE 送出的預約是 `source=line`、`booked` 狀態，由門市在行事曆確認後推播通知。

---

## 10. 重要設計決策與慣例

- **API 網址**：瀏覽器端用 `NEXT_PUBLIC_API_BASE_URL`（建置時寫入），伺服器端用 `CMS_API_INTERNAL_URL=http://api:3000/api/v2`。
- **網站一定要在 `apps/web` 目錄建置**，否則 Tailwind 掃不到 class、畫面跑版。
- **電話一律經 `normalizePhone`** 存成純數字，顯示時再加連字號。
- **日期顯示用台灣時間**：伺服器是 UTC，PDF 與 CSV 的日期都指定 `timeZone: 'Asia/Taipei'`。
- **剩餘堂數查詢都要加 `voidedAt: null`**；財務查詢要加 `deletedAt: null`；業績查詢要加 `isRolledBack: false`。
- **讀取 `planActual` / `planOriginal` 不可假設一定有 `price` / `items`**（舊紀錄缺欄位）。
- **同意書版面版本**：改 PDF 版面時要遞增 `CURRENT_LAYOUT_VERSION`，舊快照沿用舊版面，避免進行中的簽署對不齊。
- **`JWT_SECRET` 不可更改**，否則所有裝置被登出。
- **Prisma select + `satisfies`** 取得型別；空 body 的端點前端 `apiRequest` 會回 `undefined`。
- **新 migration** 要對正式庫結構副本 diff，只保留本次功能的 DDL（舊 migration 無法在空庫重播）。

---

## 11. 已完成功能清單

### 帳號與介面
- [x] 5 種角色 RBAC、帳號建立規則
- [x] 多帳號 PIN 切換、裝置記住登入（refresh token）
- [x] 加入主畫面（PWA）、安全區域、安裝提示
- [x] 文字大小切換、灰色小字加大

### 顧客與同意書
- [x] 顧客建檔（姓名 / 身分證鎖定）、顧客編號、軟刪除與還原
- [x] 同意書統一一份、線上編輯與版本管理
- [x] 雙方電子簽名、PDF（簽名放大）、iPad 可捲動檢視

### 預約
- [x] 預約行事曆（日 / 週 / 月、營業時間、拖曳、撞期檢查、快速帶入顧客、沿用上次）
- [x] LINE 預約申請與確認推播

### POS 與交易
- [x] 三種消費方式 + 多重付款 + 結帳調整（打折 / 折價券 / 折抵 / 堂數）
- [x] 扣堂先買先用、跨份扣
- [x] 交易紀錄、歷程、系統管理員刪除並回溯
- [x] 課程退費、退課轉儲值（進錢包）、課程轉換、核銷還原

### 財務
- [x] 收入 / 支出、日結、CSV（含退費分類）
- [x] 備用金（現金收入、退費連動）

### LINE
- [x] 綁定、查詢堂數 / 儲值金 / 預約、圖文選單、提醒推播

### 其他
- [x] 庫存、打卡考勤、業績、服務品項、促銷方案、聯絡訊息、分店功能開關
