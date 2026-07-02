# 啟動 / 關閉專案（website_v2）

> **系統概述**：NestJS（API）+ Next.js 14（Web）+ PostgreSQL 16，Puck 拖拉式區塊編輯器。
> cms（Version 1 / Laravel）已停用（`docker compose stop`），容器保留可隨時復原，但 port 80 現在由 website_v2 使用。

---

## 一、每次開發前：啟動容器

```bash
cd /Users/tsanyen/Documents/website/website_v2
docker compose up -d
```

確認三個容器都正常：

```bash
docker compose ps
```

預期狀態：

| 名稱 | 狀態 | Port |
|------|------|------|
| `website_v2_web` | Up | `80:3000` |
| `website_v2_api` | Up | `3101:3000` |
| `website_v2_db` | Up (healthy) | `5433:5432` |

> `api` 容器每次啟動會自動執行 `apt-get install openssl procps`（寫在 docker-compose.yml 的 command），等幾秒讓這步完成後再進容器。

---

## 二、首次安裝 / 套件有更新時

容器啟動後**不會**自動安裝套件或啟動開發伺服器，首次使用或 `package.json` 有變動時，要手動執行以下步驟。

### 2-1 API（NestJS）

```bash
docker compose exec api sh
npm install
npx prisma generate
npx prisma migrate deploy        # 套用所有 migration（不互動）
npx prisma db seed               # 建立種子帳號 + 預設門店 + 免責聲明範本
npm run start:dev                # 在前景跑（要看 log 用這個）
```

或背景跑（不用卡著終端機）：

```bash
docker compose exec -d api sh -c "npm run start:dev > /tmp/api-dev.log 2>&1"
```

確認 API 活著：

```bash
curl http://localhost:3101/api/v2/cms/pages/home 2>/dev/null | head -c 200
# 預期回 404 JSON（page 還沒建）或正常的 JSON 內容
```

### 2-2 Web（Next.js）

開另一個終端機：

```bash
docker compose exec web sh
npm install
npm run dev                      # 在前景跑
```

或背景跑：

```bash
docker compose exec web sh -c "cd /workspace/apps/web && npm run dev > /tmp/web-dev.log 2>&1" &
```

開啟瀏覽器：

| 用途 | 網址 |
|------|------|
| 前台官網 | http://localhost |
| 後台管理 | http://localhost/admin |
| API | http://localhost:3101/api/v2/ |

---

## 三、種子帳號（seed 後建立）

種子帳號密碼統一：**`Passw0rd!1`**

| Email | 角色 | 說明 |
|-------|------|------|
| `system@website-v2.local` | system_admin | 最高權限 |
| `admin@website-v2.local` | admin | 管理員（注意：曾被測試刪除，可能 soft-deleted） |
| `dealer-north@website-v2.local` | dealer | 北區經銷商 |
| `manager-default@website-v2.local` | manager | 預設門店店長 |
| `editor@website-v2.local` | editor | 網站編輯 |

> **Kevin 的正式帳號**：`kevin00744@gmail.com`（system_admin），**不是種子帳號**，需要在後台或用 Prisma 手動建立，或登入後從「個人設定」更改密碼。

---

## 四、重新進行 DB Migration（Schema 有變更時）

```bash
docker compose exec api sh
npx prisma migrate dev --name <描述這次變更>
```

例如：

```bash
npx prisma migrate dev --name add_new_feature
```

---

## 五、常用維運指令

### 查看即時 log

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db
```

### 進容器除錯

```bash
docker compose exec api sh
docker compose exec web sh
docker compose exec db psql -U website_v2_user -d website_v2
```

### 確認 API 功能正常

```bash
# 登入取得 token
curl -s -X POST http://localhost:3101/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"system@website-v2.local","password":"Passw0rd!1"}' | python3 -m json.tool

# 前台搜尋
curl -s "http://localhost:3101/api/v2/cms/search?q=璨妍" | python3 -m json.tool
```

---

## 六、關閉 / 重啟

```bash
# 停止（保留 node_modules 和 DB 資料）
docker compose stop

# 重新啟動（下次開工用這個）
docker compose up -d

# 完全移除容器（保留 DB volume）
docker compose down

# 連 DB 資料一起清空（⚠️ 不可逆）
docker compose down -v
```

> `docker compose stop` 只停容器，`node_modules` 和 DB 資料都保留；下次 `docker compose up -d` 後，`api` 容器裡的程式需要重新手動啟動（`npm run start:dev`），因為上次的前景行程已中斷。

---

## 七、環境說明

| 變數 | 設定位置 | 說明 |
|------|----------|------|
| `DATABASE_URL` | api 容器 env | `postgresql://website_v2_user:secret@db:5432/website_v2` |
| `JWT_SECRET` | api 容器 env | 預設 `dev-only-insecure-secret-change-in-production`，正式環境務必覆寫 |
| `CMS_API_INTERNAL_URL` | web 容器 env | `http://api:3000/api/v2`（僅供 SSR/Rewrite 用） |
| `NEXT_PUBLIC_API_BASE_URL` | **刻意不設** | 瀏覽器端的 `resolveApiBaseUrl()` 會依 `window.location.hostname` 動態組出 `:3101`，確保外網也能運作 |

---

## 八、常見問題

**`npm install` 後 `node_modules` 消失？**
→ `node_modules` 裝在被掛載的 `/workspace`（本機目錄），容器 `down` 再 `up` 後還在；如果整個移除了才需要重裝。

**改了 `prisma/schema.prisma` 後資料庫沒反應？**
→ 進 `api` 容器跑 `npx prisma migrate dev --name <說明>`。

**前台圖片不顯示？**
→ 圖片走 Next.js rewrite proxy（`/api/v2/cms/uploads/*` → api 容器），DB 裡存相對路徑。確認 `web` 的 Next.js 正在跑。

**外網（手機/其他裝置）登入失敗？**
→ 確認 `docker-compose.yml` 裡沒有 `NEXT_PUBLIC_API_BASE_URL=http://localhost:...`（目前刻意不設此變數）。

**`api` 容器重建後 `npm run start:dev` 找不到 `openssl`？**
→ 等容器啟動指令的 `apt-get install openssl procps` 跑完（約 10–30 秒），再進容器。
