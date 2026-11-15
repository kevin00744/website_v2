# 璨妍 ERP 後台管理系統

> 版本：website_v2　｜　最後更新：2026-11-15

---

## 快速開始

```bash
cd /Users/tsanyen/Documents/website/website_v2
docker compose up -d
sleep 25
docker exec -d website_v2_api sh -c "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1"
docker exec -d website_v2_web sh -c "cd /workspace/apps/web && PORT=3000 /workspace/node_modules/.bin/next start > /tmp/web.log 2>&1"
```

開啟 → https://tsanyentest.com/admin　或　http://localhost/admin

> **若 dist 不存在**（首次或容器重建後）：先執行 `docker exec website_v2_api sh -c "cd /workspace/apps/api && npx prisma generate && npm run build"` 再啟動 API。
> 詳細步驟見 [Start.md](./Start.md)，系統說明見 [SYSTEM.md](./SYSTEM.md)。

---

## 系統概述

璨妍生技品牌的**單店 ERP 後台系統**，供分店店長、員工、會計及總部管理員日常操作使用。

| 模組 | 功能 |
|------|------|
| 顧客管理（CRM） | 建檔、同意書電子簽名、療程紀錄、照片 |
| POS 結帳 | 單次消費、儲值扣點、課程扣堂，多重付款 |
| 庫存管理 | 分店庫存、補貨請求 |
| 財務帳務 | 收入/支出 + 備用金獨立系統（雙軌） |
| 打卡/考勤 | 上下班打卡、月份統計、業績 dashboard |
| 分店管理 | 員工帳號、功能開關設定 |
| 帳號管理 | 5 種角色 RBAC、多帳號 PIN 切換 |

> 公開形象官網（CMS）已移除，根路徑 `/` 自動重導向 `/admin/login`。

---

## 技術棧

| 層次 | 技術 |
|------|------|
| 後端 | NestJS 10（TypeScript） |
| 前端 | Next.js 14 App Router（TypeScript） |
| 資料庫 | PostgreSQL 16 |
| ORM | Prisma 5 |
| 容器 | Docker Compose（node:20-slim） |
| 反向代理 | nginx:alpine（SSL 終止，port 80/443） |
| 認證 | JWT + Cookie |
| 樣式 | Tailwind CSS（kiosk design token） |
| PDF 生成 | pdf-lib |

---

## 系統架構

```
[瀏覽器 / iPad]
    │ port 80/443
    ▼
website_v2_nginx（nginx，SSL 終止）
    │ proxy_pass → web:3000
    ▼
website_v2_web（Next.js 14）
    │ 內部：CMS_API_INTERNAL_URL=http://api:3000/api/v2
    │ 瀏覽器：resolveApiBaseUrl() → hostname:3101（動態，不寫死 localhost）
    ▼
website_v2_api（NestJS，前綴 /api/v2）  port 3101
    │ Prisma ORM
    ▼
website_v2_db（PostgreSQL 16）  port 5433
```

**重要**：容器主行程只是 `tail -f /dev/null`，NestJS 和 Next.js **不會自動啟動**，需手動執行（見 Start.md）。
API build 輸出路徑為 `dist/src/main.js`（不是 `dist/main.js`）。

---

## 角色與權限

| 角色 | 管轄範圍 |
|------|---------|
| `system_admin` | 全部，無限制 |
| `admin` | 全部，無限制 |
| `manager` | 自己所屬分店 |
| `accountant` | 自己分店（限財務/考勤） |
| `staff` | 自己分店（受限功能） |

> 已移除：`dealer`、`general_agent`、`editor`、區域（region）概念

---

## 連線資訊

| 服務 | URL |
|------|-----|
| 後台（外網） | https://tsanyentest.com/admin |
| 後台（本機） | http://localhost/admin |
| API | http://localhost:3101/api/v2 |
| 資料庫 | localhost:5433（DB: website_v2, user: website_v2_user, pass: secret） |

正式帳號：`kevin00744`（system_admin）

---

## 文件索引

| 文件 | 說明 |
|------|------|
| [Start.md](./Start.md) | 啟動/關閉/重啟/build 完整操作手冊（含常見問題診斷） |
| [SYSTEM.md](./SYSTEM.md) | 完整系統說明（架構、DB 模型、API、流程設計決策） |
| [all.md](./all.md) | 專案所有檔案逐一說明 |
