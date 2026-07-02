# 專案檔案說明（all.md）

這份文件說明專案裡每一個重要檔案/資料夾的功能，方便之後修改時知道該改哪裡。

> website_v2 是 `cms`（Laravel）的全新重寫版，目標是最終取代 cms，技術棧改成 Next.js + NestJS + PostgreSQL（Prisma）。目前還在「地基」階段：資料庫設計、簽名安全驗證邏輯、Docker 開發環境已完成；Customers CRUD、RBAC Guard、Next.js 前台/後台畫面尚未開發。

---

## 1. 根目錄設定檔

| 檔案 | 功能 |
|------|------|
| `docker-compose.yml` | 本機開發環境定義：`web`（Next.js）、`api`（NestJS）、`db`（Postgres）三個服務，container/network/port 全部跟 `cms` 隔離。`web`/`api` 用乾淨的 `node:20-alpine` image 掛載原始碼，不會自動 build/install，要手動 `docker compose exec` 進去操作（詳見 `Start.md`）。 |
| `package.json` | 根目錄 workspace 設定（`apps/*`、`packages/*`），目前只是宣告 monorepo 結構，沒有自己的依賴。 |
| `.gitignore` | 排除 `node_modules/`、`dist/`、`.next/`、`.env`、log 檔。 |
| `Start.md` | 開發環境的啟動/關閉/重啟操作手冊。 |
| `all.md` | 本檔案，逐檔說明專案結構。 |

---

## 2. `apps/api`（NestJS — 業務邏輯與資料庫存取）

| 檔案 | 功能 |
|------|------|
| `package.json` | NestJS 專案的依賴與指令（`start:dev` 開發模式、`prisma:generate`/`prisma:migrate` 操作資料庫）。 |
| `tsconfig.json` | TypeScript 編譯設定，開了 `strict` 模式。 |
| `nest-cli.json` | Nest CLI 設定（`sourceRoot: src`）。 |
| `.env.example` | 環境變數範本，主要是 `DATABASE_URL`（指向獨立於 cms 的 Postgres）與 `PORT`。 |
| `Dockerfile` | ⚠️ 目前開發階段沒用到。留給之後正式上線時，用多階段 build 產生 production image。 |
| `prisma/schema.prisma` | **整個系統的資料表設計**。定義 `User`（角色 enum：`system_admin`/`admin`/`editor`/`dealer`/`manager`）、`Store`（分區/分店代碼）、`Customer`（身分證號/顧客編號/雙簽署時間快取欄位）、`Signature`（append-only，簽名安全儲存的核心，見下方說明）。 |
| `src/main.ts` | 應用程式進入點：設定 global prefix `api/v2`、註冊全域例外攔截器 `HttpExceptionFilter`、開 CORS、啟動 HTTP server。 |
| `src/app.module.ts` | 根模組，目前匯入 `PrismaModule` 與 `SignatureModule`（之後 Customers/Stores/Inventory/Auth 模組會加在這裡）。 |
| `src/prisma/prisma.service.ts` | 包裝 Prisma Client，在 Nest 生命週期 `onModuleInit`/`onModuleDestroy` 時連線/斷線資料庫。 |
| `src/prisma/prisma.module.ts` | 把 `PrismaService` 設為 `@Global()`，讓任何模組都不用重複 import 就能注入。 |
| `src/common/errors/app-error.ts` | 所有業務邏輯丟出的例外都用這個類別，帶語意化 `code`（例如 `SIGNATURE_VERIFY_FAILED`），而不是裸的 `Error`。`code` 必須在 `packages/copy/zh-TW.ts` 有對應翻譯。 |
| `src/common/filters/http-exception.filter.ts` | 全域例外攔截器：把 `AppError` 轉成 `{ code }` 回應，未知例外一律回 `{ code: 'DEFAULT' }`，**絕不把 exception message/stack 洩漏給前端**，真正訊息只寫進 server log。 |
| `src/signature/signature.service.ts` | **數位簽名安全儲存的核心邏輯**。`createSignature()`：檢查內容快照/簽名圖/筆觸點數（防止空簽名），計算 `content_hash`（SHA-256(聲明書內容快照)）與 `record_hash`（SHA-256(customerId+documentType+signerRole+contentHash+signatureImageUrl+signedAt)），寫入 append-only 的 `signatures` 表，並同步更新 `customers` 表上的雙簽署時間快取欄位。`verifySignature()`：重新計算兩層 hash 並跟資料庫存的比對，任何一筆資料被竄改都會讓 hash 不一致，進而拋出 `SIGNATURE_VERIFY_FAILED`。 |
| `src/signature/signature.controller.ts` | 對外路由：`POST /api/v2/signature` 建立簽名（從 request 帶入 IP/User-Agent 做法遵留痕）、`GET /api/v2/signature/:id/verify` 驗證某筆簽名是否被竄改。 |
| `src/signature/signature.module.ts` | 把上面 controller/service 組成一個 Nest 模組。 |

## 3. `apps/web`（Next.js — 前台官網 + 店員後台）

> ⚠️ 目前只有資料夾結構與佔位頁面，kiosk 防呆元件、CRM、簽署畫面**尚未實作**。

| 檔案 | 功能 |
|------|------|
| `package.json` | Next.js 專案依賴，已先加入 `react-hook-form`/`react-imask`/`react-signature-canvas`/`zod`，是之後做「防呆表單」與「簽署聲明書」會用到的套件，目前還沒有程式碼真正使用它們。 |
| `next.config.js` | Next.js 設定，目前是空白預設值。 |
| `Dockerfile` | ⚠️ 目前開發階段沒用到，留給之後正式上線用。 |
| `app/layout.tsx` | 全站共用的 root layout（`<html lang="zh-TW">`）。 |
| `app/(public)/page.tsx` | 官網首頁佔位頁，待依 tsanyen.com 視覺風格實作品牌故事/服務項目/據點區塊。 |
| `app/(admin)/customers/page.tsx` | 店員後台「顧客列表」佔位頁，待實作極速搜尋 + kiosk 設計系統元件。 |

## 4. `packages`（前後端共用程式碼）

| 檔案 | 功能 |
|------|------|
| `copy/zh-TW.ts` | **話術字典**：把 API 回傳的語意化 error code（如 `SIGNATURE_VERIFY_FAILED`）轉成門市人員看得懂的白話文句子。前端任何地方顯示錯誤訊息都必須透過 `translateErrorCode()`，禁止直接顯示後端原始訊息。新增一個 `AppError` code 時，務必同步在這裡補一筆翻譯，否則畫面會落到 `DEFAULT` 的通用提示。 |
| `copy/package.json` | 把上面那份字典包成一個 workspace package（`@website-v2/copy`），讓 `apps/web` 可以直接 import。 |
| `shared-types/index.ts` | 前後端共用的基礎型別（`Role`/`Region`/`DocumentType`/`SignerRole`），對應 `schema.prisma` 裡的 enum，避免前端手刻字串造成打錯字。 |
| `shared-types/package.json` | 把上面型別包成 workspace package（`@website-v2/shared-types`）。 |

---

## 5. 數位簽名安全機制總覽（跨多個檔案，集中說明）

這是本專案除了一般 CRUD 之外，技術上最關鍵的部分，分散在以下檔案：

1. `prisma/schema.prisma` 的 `Signature` model — 資料結構，**只允許 INSERT**，沒有 `updatedAt`、沒有 soft delete，重新簽名一律是新增一筆。
2. `signature.service.ts` 的 `createSignature()` — 簽名送進來時，當下就把「聲明書內容快照」與「簽名圖/筆觸/時間/簽署人」一起做雙層 SHA-256 雜湊並存證。
3. `signature.service.ts` 的 `verifySignature()` — 之後任何時候都能重算雜湊，比對資料庫裡存的 `record_hash`，偵測資料是否被竄改（資料庫被直接改過一個欄位，雜湊就會不一致）。
4. `http-exception.filter.ts` + `app-error.ts` + `packages/copy/zh-TW.ts` — 驗證失敗時，後端只回語意化 code，前端負責轉成白話文，不會讓門市人員看到「hash mismatch」這種技術訊息。

## 6. 尚未開發的部分（提醒用，非錯誤清單）

- `apps/api/src/customers`、`stores`、`inventory`、`auth`、`rbac`、`content` 目前只有空資料夾，對應的 module/controller/service 都還沒寫。
- `apps/web/components/admin/kiosk`、`components/admin/signature` 目前也是空的，防呆 UI 元件（`KioskButton`/`MaskedInput`/簽署全螢幕頁）尚未實作。
- 還沒有任何 RBAC Guard（`@Roles()` decorator）接到 controller 上，目前 `signature.controller.ts` 的兩個端點是完全公開的，正式串接 CRUD 時要記得補上權限檢查。
