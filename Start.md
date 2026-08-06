# 啟動 / 關閉專案（website_v2）

> **重要**：容器重啟後，NestJS API 和 Next.js **不會自動恢復**，必須手動重新啟動行程（見下方步驟）。

---

## 一、每次開工：完整啟動流程

### 步驟 1 — 啟動 Docker 容器

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
| `website_v2_db`  | Up (healthy) | `5433:5432` |

> `api` 容器啟動時會跑 `apt-get install openssl procps`，約需 10–30 秒，等這步完成後再繼續。

---

### 步驟 2 — 確認 API dist 是否存在（首次 / 清掉後才需要）

API 使用 production build（`dist/src/main.js`）。若 dist 不存在（如首次使用、或 `docker compose down` 後重新建容器），需先 build：

```bash
# 先確認 dist 是否存在
docker exec website_v2_api sh -c "ls /workspace/apps/api/dist/src/main.js 2>/dev/null && echo '✓ dist 存在' || echo '✗ dist 不存在，需要 build'"
```

如果顯示「✗ dist 不存在」：

```bash
docker exec website_v2_api sh -c "cd /workspace/apps/api && npm run build 2>&1 | tail -5"
```

> build 約需 30–60 秒。完成後 `dist/src/main.js` 會出現。
> `npm run build` 指的是 `nest build`，輸出在 `dist/src/`（不是 `dist/`）。

---

### 步驟 3 — 啟動 NestJS API

```bash
docker exec -d website_v2_api sh -c \
  "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1"
```

確認 API 就緒（等看到 `Nest application successfully started`）：

```bash
docker exec website_v2_api sh -c "tail -20 /tmp/api.log"
```

持續追蹤：

```bash
docker exec website_v2_api sh -c "tail -f /tmp/api.log"
```

---

### 步驟 4 — 啟動 Next.js Web

```bash
docker exec -d website_v2_web sh -c \
  "cd /workspace && node_modules/next/dist/bin/next start apps/web -p 3000 > /tmp/web.log 2>&1"
```

確認 Web 就緒（等看到 `Ready in`）：

```bash
docker exec website_v2_web sh -c "tail -10 /tmp/web.log"
```

---

### 步驟 5 — 驗證可以開啟

| 服務 | URL |
|------|-----|
| 後台前端 | http://localhost/admin |
| API 健康確認 | http://localhost:3101/api/v2/auth/me |
| 資料庫 | localhost:5433（DB: website_v2） |

---

## 二、快速一鍵啟動腳本

> 適用於 dist 已存在的情況（最常見的日常啟動）。把以下指令一次貼進終端機：

```bash
cd /Users/tsanyen/Documents/website/website_v2 && docker compose up -d && \
sleep 25 && \
docker exec -d website_v2_api sh -c "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1" && \
docker exec -d website_v2_web sh -c "cd /workspace && node_modules/next/dist/bin/next start apps/web -p 3000 > /tmp/web.log 2>&1" && \
echo "啟動中，約 10 秒後可開啟 http://localhost/admin"
```

確認都就緒：

```bash
docker exec website_v2_api sh -c "tail -3 /tmp/api.log"
docker exec website_v2_web sh -c "tail -3 /tmp/web.log"
```

---

## 三、dist 不存在時的首次完整啟動腳本

> 適用於：首次使用、重新 clone、或 `docker compose down` 後重建容器。

```bash
cd /Users/tsanyen/Documents/website/website_v2 && docker compose up -d && \
sleep 25 && \
echo "=== 建置 API ===" && \
docker exec website_v2_api sh -c "cd /workspace/apps/api && npm run build" && \
echo "=== 啟動 API ===" && \
docker exec -d website_v2_api sh -c "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1" && \
echo "=== 啟動 Web ===" && \
docker exec -d website_v2_web sh -c "cd /workspace && node_modules/next/dist/bin/next start apps/web -p 3000 > /tmp/web.log 2>&1" && \
echo "啟動中，約 15 秒後可開啟 http://localhost/admin"
```

---

## 四、前端程式碼有修改後重新 Build + 重啟 Web

每次改動 `apps/web/` 的程式碼，都必須重新 build 才會套用：

```bash
# 重新 build（等完成再繼續）
docker exec website_v2_web sh -c "cd /workspace/apps/web && npm run build"

# 殺掉舊的 next start 行程
docker exec website_v2_web sh -c "kill \$(pgrep -f 'next start') 2>/dev/null; true"

# 重新啟動
docker exec -d website_v2_web sh -c \
  "cd /workspace && node_modules/next/dist/bin/next start apps/web -p 3000 > /tmp/web.log 2>&1"
```

---

## 五、後端程式碼有修改後重新 Build + 重啟 API

```bash
# 型別檢查（可選，確保無錯誤再 build）
docker exec website_v2_api sh -c "cd /workspace/apps/api && npx tsc --noEmit"

# 重新 build（輸出到 dist/src/）
docker exec website_v2_api sh -c "cd /workspace/apps/api && npm run build"

# 殺掉舊行程並重啟
docker exec website_v2_api sh -c "kill \$(pgrep -f 'dist/src/main') 2>/dev/null; true"
docker exec -d website_v2_api sh -c \
  "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1"
```

> **注意**：build 輸出路徑是 `dist/src/main.js`，不是 `dist/main.js`（NestJS 的 tsconfig outDir 為 `./dist`，但 src 本身有一層目錄，所以實際輸出是 `dist/src/`）。

---

## 六、Schema 有變更（Prisma Migration）

```bash
# 進 api 容器
docker exec -it website_v2_api sh

# 建立並套用 migration
npx prisma migrate dev --name <描述這次變更>

# 或只套用已存在的 migration（不互動）
npx prisma migrate deploy

# 重新產生 Prisma Client（schema 加新欄位/relation 後必須執行）
npx prisma generate
```

執行完後需重新 build + 重啟 API（見步驟五）。

---

## 七、查看即時 Log

```bash
# API log（含啟動過程和錯誤）
docker exec website_v2_api sh -c "tail -f /tmp/api.log"

# Web log
docker exec website_v2_web sh -c "tail -f /tmp/web.log"

# DB log
docker compose -f /Users/tsanyen/Documents/website/website_v2/docker-compose.yml logs -f db
```

---

## 八、進容器除錯

```bash
# 進入 API 容器
docker exec -it website_v2_api sh

# 進入 Web 容器
docker exec -it website_v2_web sh

# 進入 DB（psql）
docker exec -it website_v2_db psql -U website_v2_user -d website_v2
```

常用 psql 指令：

```sql
\dt                    -- 列出所有資料表
\d customers           -- 查看 customers 表欄位
SELECT * FROM users WHERE deleted_at IS NULL LIMIT 10;
SELECT username, role, is_active FROM users WHERE deleted_at IS NULL;
```

---

## 九、種子帳號（首次 seed 後建立）

種子帳號密碼統一：**`Passw0rd!1`**

| 帳號（username） | 角色 | 說明 |
|----------------|------|------|
| `system` | system_admin | 最高權限 |
| `admin` | admin | 管理員 |
| `dealer-north` | dealer | 北區代理 |
| `manager-default` | manager | 預設分店店長 |

> **Kevin 的正式帳號**：Email `kevin00744@gmail.com`，角色 `system_admin`，不在種子帳號中，請從後台手動建立或用 psql 直接查詢確認。

---

## 十、型別檢查（改動程式碼後）

```bash
# 後端 TypeScript 零錯誤
docker exec website_v2_api sh -c "cd /workspace/apps/api && npx tsc --noEmit"

# 前端 TypeScript 零錯誤
docker exec website_v2_web sh -c "cd /workspace/apps/web && npx tsc --noEmit"
```

---

## 十一、關閉 / 重啟

```bash
# 停止所有容器（保留 node_modules、dist、DB 資料）
docker compose -f /Users/tsanyen/Documents/website/website_v2/docker-compose.yml stop

# 重新啟動（dist 還在，用快速腳本即可）
docker compose -f /Users/tsanyen/Documents/website/website_v2/docker-compose.yml up -d

# 完全移除容器（保留 DB volume）
docker compose -f /Users/tsanyen/Documents/website/website_v2/docker-compose.yml down

# 連 DB 資料一起清空（⚠️ 不可逆）
docker compose -f /Users/tsanyen/Documents/website/website_v2/docker-compose.yml down -v
```

---

## 十二、環境變數

| 變數 | 設定位置 | 說明 |
|------|----------|------|
| `DATABASE_URL` | api 容器 env | `postgresql://website_v2_user:secret@db:5432/website_v2` |
| `JWT_SECRET` | api 容器 env | 預設 `dev-only-insecure-secret-change-in-production` |
| `CMS_API_INTERNAL_URL` | web 容器 env | `http://api:3000/api/v2`（SSR Server Components 用） |
| `NEXT_PUBLIC_API_BASE_URL` | **刻意不設** | 瀏覽器端由 `resolveApiBaseUrl()` 依 `window.location.hostname` 動態組出，不寫死 localhost |

---

## 十三、常見問題 & 診斷

**Q：容器重啟後網頁打不開 / 登入失敗「請稍後再試」？**
→ 容器的主行程只是 `tail -f /dev/null`（讓容器存活），NestJS 和 Next.js 行程重啟後消失，需手動重啟。
→ 先確認兩個 log：
```bash
docker exec website_v2_api sh -c "tail -5 /tmp/api.log"
docker exec website_v2_web sh -c "tail -5 /tmp/web.log"
```

**Q：`api.log` 出現 `Cannot find module 'dist/src/main.js'`？**
→ dist 不存在，需要先 build：
```bash
docker exec website_v2_api sh -c "cd /workspace/apps/api && npm run build"
```
然後再啟動 API（見步驟三）。

**Q：API log 出現 `openssl not found` 或空白？**
→ 容器啟動時正在跑 `apt-get install openssl procps`，等 20–30 秒後再啟動 API 行程。

**Q：改了後端程式碼但 API 沒反應？**
→ 需重新 `npm run build` 並重啟（見步驟五）。build 輸出路徑是 `dist/src/main.js`。

**Q：改了前端但頁面沒更新？**
→ 需重新 `npm run build` 並重啟 `next start`（見步驟四）。

**Q：Prisma 型別錯誤 / 新欄位找不到？**
→ 進 api 容器執行 `npx prisma generate` 重新產生 Prisma Client，再重新 build + 重啟。

**Q：外網（手機 / iPad）登入失敗？**
→ 確認 `docker-compose.yml` 沒有設 `NEXT_PUBLIC_API_BASE_URL=http://localhost:...`（此變數刻意不設）。

**Q：如何確認 API 和 Web 行程是否真的在跑？**
```bash
# 看 API log 最後幾行（有 "successfully started" 就是在跑）
docker exec website_v2_api sh -c "tail -3 /tmp/api.log"

# 看 Web log（有 "Ready in" 就是在跑）
docker exec website_v2_web sh -c "tail -3 /tmp/web.log"
```
