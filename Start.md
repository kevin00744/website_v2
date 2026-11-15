# 啟動 / 關閉專案（website_v2）

> **重要**：容器重啟後，NestJS API 和 Next.js **不會自動恢復**，必須手動重新啟動行程（見下方步驟）。

---

## 一、每次開工：完整啟動流程

### 步驟 1 — 啟動 Docker 容器

```bash
cd /Users/tsanyen/Documents/website/website_v2
docker compose up -d
```

確認四個容器都正常：

```bash
docker compose ps
```

預期狀態：

| 名稱 | 狀態 | Port |
|------|------|------|
| `website_v2_nginx` | Up | `80:80`, `443:443` |
| `website_v2_web` | Up | （無對外 port，由 nginx proxy） |
| `website_v2_api` | Up | `3101:3000` |
| `website_v2_db`  | Up (healthy) | `5433:5432` |

> `api` 容器啟動時會跑 `apt-get install openssl procps`，約需 10–30 秒，等這步完成後再繼續。

---

### 步驟 2 — 確認 API dist 是否存在（首次 / 清掉後才需要）

```bash
docker exec website_v2_api sh -c "ls /workspace/apps/api/dist/src/main.js 2>/dev/null && echo '✓ dist 存在' || echo '✗ dist 不存在，需要 build'"
```

如果顯示「✗ dist 不存在」：

```bash
docker exec website_v2_api sh -c "cd /workspace/apps/api && npx prisma generate && npm run build 2>&1 | tail -5"
```

> build 約需 30–60 秒。`npm run build` = `nest build`，輸出在 `dist/src/`。

---

### 步驟 3 — 啟動 NestJS API

```bash
docker exec -d website_v2_api sh -c \
  "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1"
```

確認 API 就緒：

```bash
docker exec website_v2_api sh -c "tail -5 /tmp/api.log"
# 看到 "Nest application successfully started" 表示正常
```

---

### 步驟 4 — 啟動 Next.js Web

```bash
docker exec -d website_v2_web sh -c \
  "cd /workspace/apps/web && PORT=3000 /workspace/node_modules/.bin/next start > /tmp/web.log 2>&1"
```

確認 Web 就緒：

```bash
docker exec website_v2_web sh -c "tail -5 /tmp/web.log"
# 看到 "Ready in XXXms" 表示正常
```

---

### 步驟 5 — 驗證可以開啟

| 服務 | URL |
|------|-----|
| 後台（本機） | http://localhost/admin |
| 後台（外網） | https://tsanyentest.com/admin |
| API | http://localhost:3101/api/v2 |

---

## 二、快速一鍵啟動腳本

> 適用於 dist 已存在的日常啟動。

```bash
cd /Users/tsanyen/Documents/website/website_v2 && docker compose up -d && \
sleep 25 && \
docker exec -d website_v2_api sh -c "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1" && \
docker exec -d website_v2_web sh -c "cd /workspace/apps/web && PORT=3000 /workspace/node_modules/.bin/next start > /tmp/web.log 2>&1" && \
echo "啟動中，約 10 秒後可開啟 http://localhost/admin"
```

確認都就緒：

```bash
docker exec website_v2_api sh -c "tail -3 /tmp/api.log"
docker exec website_v2_web sh -c "tail -3 /tmp/web.log"
```

---

## 三、首次完整啟動（含 build）

> 適用於：首次使用、重新 clone、或 `docker compose down` 後重建容器。

```bash
cd /Users/tsanyen/Documents/website/website_v2 && docker compose up -d && \
sleep 25 && \
echo "=== 建置 API ===" && \
docker exec website_v2_api sh -c "cd /workspace/apps/api && npx prisma generate && npm run build" && \
echo "=== 啟動 API ===" && \
docker exec -d website_v2_api sh -c "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1" && \
echo "=== 啟動 Web ===" && \
docker exec -d website_v2_web sh -c "cd /workspace/apps/web && PORT=3000 /workspace/node_modules/.bin/next start > /tmp/web.log 2>&1" && \
echo "啟動中，約 15 秒後可開啟 http://localhost/admin"
```

---

## 四、前端程式碼修改後 Build + 重啟

```bash
# 重新 build
docker exec website_v2_web sh -c "cd /workspace/apps/web && npm run build"

# 殺掉舊行程並重啟
docker exec website_v2_web sh -c \
  "find /proc -maxdepth 2 -name cmdline 2>/dev/null | while read f; do \
    c=\$(cat \"\$f\" 2>/dev/null | tr '\0' ' '); \
    if echo \"\$c\" | grep -q 'next-server'; then \
      pid=\$(echo \$f | cut -d/ -f3); kill \$pid 2>/dev/null; fi; done"
sleep 2
docker exec -d website_v2_web sh -c \
  "cd /workspace/apps/web && PORT=3000 /workspace/node_modules/.bin/next start > /tmp/web.log 2>&1"
```

---

## 五、後端程式碼修改後 Build + 重啟

```bash
# 型別檢查（確保無錯誤再 build）
docker exec website_v2_api sh -c "cd /workspace/apps/api && npx tsc --noEmit"

# 重新 build
docker exec website_v2_api sh -c "cd /workspace/apps/api && npm run build"

# 殺掉舊行程並重啟
docker exec website_v2_api sh -c \
  "find /proc -maxdepth 2 -name cmdline 2>/dev/null | while read f; do \
    c=\$(cat \"\$f\" 2>/dev/null | tr '\0' ' '); \
    if echo \"\$c\" | grep -q 'dist/src/main'; then \
      pid=\$(echo \$f | cut -d/ -f3); kill \$pid 2>/dev/null; fi; done"
sleep 2
docker exec -d website_v2_api sh -c \
  "cd /workspace/apps/api && node dist/src/main.js > /tmp/api.log 2>&1"
```

> **注意**：改完 schema.prisma 後需先 `npx prisma generate` 再 `npm run build`。

---

## 六、Schema 有變更（Prisma Migration）

```bash
docker exec -it website_v2_api sh

# 建立並套用 migration
npx prisma migrate dev --name <描述這次變更>

# 或只套用已存在的 migration
npx prisma migrate deploy

# 重新產生 Prisma Client（schema 加新欄位後必須執行）
npx prisma generate
```

執行完後需重新 build + 重啟 API（見步驟五）。

---

## 七、查看即時 Log

```bash
# API log
docker exec website_v2_api sh -c "tail -f /tmp/api.log"

# Web log
docker exec website_v2_web sh -c "tail -f /tmp/web.log"

# nginx log
docker compose logs -f nginx
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
\d users               -- 查看 users 表欄位
SELECT username, role, is_active FROM users WHERE deleted_at IS NULL;
SELECT id, name, petty_cash_balance FROM stores WHERE deleted_at IS NULL;
```

---

## 九、帳號資訊

| 帳號（username） | 角色 | 說明 |
|----------------|------|------|
| `kevin00744` | system_admin | 主帳號，id=1，storeId=24 |

> 其他帳號從後台「帳號管理」頁面建立。

---

## 十、型別檢查

```bash
# 後端 TypeScript 零錯誤
docker exec website_v2_api sh -c "cd /workspace/apps/api && npx tsc --noEmit"

# 前端 TypeScript 零錯誤
docker exec website_v2_web sh -c "cd /workspace/apps/web && npx tsc --noEmit"
```

---

## 十一、關閉 / 重啟

```bash
# 停止所有容器（保留 dist、DB 資料）
docker compose stop

# 重新啟動容器
docker compose up -d

# 完全移除容器（保留 DB volume）
docker compose down

# 連 DB 資料一起清空（⚠️ 不可逆）
docker compose down -v
```

---

## 十二、環境變數

| 變數 | 設定位置 | 說明 |
|------|----------|------|
| `DATABASE_URL` | api 容器 env | `postgresql://website_v2_user:secret@db:5432/website_v2` |
| `JWT_SECRET` | api 容器 env | 預設 `dev-only-insecure-secret-change-in-production` |
| `CMS_API_INTERNAL_URL` | web 容器 env | `http://api:3000/api/v2`（SSR 用） |
| `NEXT_PUBLIC_API_BASE_URL` | **刻意不設** | 瀏覽器端由 `resolveApiBaseUrl()` 依 `window.location.hostname:3101` 動態組出 |

---

## 十三、常見問題診斷

**Q：容器重啟後網頁打不開？**
→ API 和 Web 程序需手動重啟。先看 log 確認：
```bash
docker exec website_v2_api sh -c "tail -5 /tmp/api.log"
docker exec website_v2_web sh -c "tail -5 /tmp/web.log"
```

**Q：`api.log` 出現 `Cannot find module 'dist/src/main.js'`？**
→ 需先 build：`docker exec website_v2_api sh -c "cd /workspace/apps/api && npx prisma generate && npm run build"`

**Q：API log 出現 `The column X does not exist`？**
→ Prisma client 和 schema 不同步，需 `npx prisma generate` 後重新 build + 重啟。

**Q：DB 重建後 API 連不上 `db:5432`？**
→ DB 容器 IP 更換導致 DNS 失效，需 `docker compose up -d --force-recreate api` 重建 API 容器。

**Q：外網（手機）登入失敗？**
→ 確認路由器有 port forwarding 80/443 → 192.168.1.103。

**Q：HTTPS 顯示憑證警告？**
→ 使用自簽憑證，點「繼續前往」即可。如需正式憑證可換 Let's Encrypt。

**Q：Web 程序顯示 running 但連線失敗？**
→ 殭屍程序問題，需 kill 後重啟（見步驟四）。
```bash
docker exec website_v2_web sh -c "node -e \"require('http').get('http://localhost:3000/', r => console.log(r.statusCode)).on('error',e=>console.error(e.message))\""
```
