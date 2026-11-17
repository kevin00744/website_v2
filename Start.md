# 部署與維運手冊（website_v2）

> 最後更新：2026-11-17
> 正式站：https://www.tsanyentest.com　｜　伺服器專案位置：`/opt/website_v2`

正式環境由 `docker-compose.prod.yml` 管理（project 名稱 `website_v2_prod`），三個容器都設定 `restart: unless-stopped`，**伺服器重開機後會自動恢復**，不需要手動啟動行程。

| 容器 | 角色 | 對外 |
|------|------|------|
| `website_v2_prod-db-1` | PostgreSQL 16（volume `website_v2_prod_db_data`） | 不對外 |
| `website_v2_prod-api-1` | NestJS API；啟動時先跑 `prisma migrate deploy` 再 `node dist/src/main.js` | `127.0.0.1:3101` |
| `website_v2_prod-web-1` | Next.js（`next start apps/web`） | `127.0.0.1:3000` |

主機上的 nginx（`/etc/nginx/sites-enabled/website_v2`）負責 HTTPS（Let's Encrypt），把 `/api/`、`/socket.io/` 轉到 3101，其餘轉到 3000。

為了方便輸入，以下用 `COMPOSE` 代表：

```bash
COMPOSE="docker compose -p website_v2_prod -f /opt/website_v2/docker-compose.prod.yml"
```

---

## 一、部署（改了程式碼之後）

```bash
bash /opt/website_v2/deploy.sh
```

腳本會依序：
1. 確認資料庫啟動
2. 備份資料庫和目前版本到 `/opt/website_v2_backups/`
3. 建置 API（`prisma generate` + `nest build`）
4. 在獨立資料夾建置網站（正式站不中斷），**工作目錄必須是 `apps/web`**，否則 Tailwind 抓不到樣式、畫面會跑版
5. 換上新版網站並重啟 api 和 web；API 啟動時自動套用新的資料庫 migration
6. 檢查 API 已啟動、`/login` 回應 200；失敗時保留舊版在 `apps/web/.next.old`，並印出還原指令

> `NEXT_PUBLIC_*` 變數（API 網址、LIFF ID）在網站建置時寫死，改了 `.env` 裡這些值要重新部署網站。

---

## 二、只重新啟動（程式沒改）

```bash
cd /opt/website_v2 && docker compose -p website_v2_prod -f docker-compose.prod.yml restart api web
```

整組重啟（含資料庫）：

```bash
cd /opt/website_v2 && docker compose -p website_v2_prod -f docker-compose.prod.yml up -d
```

---

## 三、檢查狀態與看 log

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
```

```bash
docker logs --tail 50 website_v2_prod-api-1
```

```bash
docker logs --tail 20 website_v2_prod-web-1
```

API 正常會看到 `Nest application successfully started`；網站會看到 `Ready in …ms`。

---

## 四、資料庫

連進資料庫：

```bash
docker exec -it website_v2_prod-db-1 psql -U website_v2_user -d website_v2
```

手動備份：

```bash
mkdir -p /opt/website_v2_backups && docker exec website_v2_prod-db-1 pg_dump -U website_v2_user -d website_v2 -Fc > /opt/website_v2_backups/db-$(date +%Y%m%d-%H%M%S).dump
```

還原（把檔名換成要還原的備份）：

```bash
docker exec -i website_v2_prod-db-1 pg_restore -U website_v2_user -d website_v2 --clean --if-exists < /opt/website_v2_backups/db-YYYYMMDD-HHMMSS.dump
```

### Migration 注意事項
- 新的 migration 放在 `apps/api/prisma/migrations/`，部署時 API 啟動會自動套用。
- **舊的 migration 無法在空資料庫上完整重播**（早期欄位有落差，`seed.ts` 也因此無法在空庫執行）。產生新 migration 時，請對「正式庫結構的副本」做 diff（`pg_dump --schema-only` 還原到臨時資料庫，再 `prisma migrate diff --from-url …`），並只保留這次功能的 DDL。

---

## 五、一次性腳本（`apps/api/scripts/`）

在正式資料庫上執行時，用一次性的 node 容器連到 `website_v2_prod_default` 網路：

```bash
cd /opt/website_v2 && docker run --rm --network website_v2_prod_default --env-file .env -v /opt/website_v2:/workspace -w /workspace/apps/api node:20-slim sh -c 'apt-get update -qq >/dev/null && apt-get install -y -qq openssl >/dev/null 2>&1; DATABASE_URL="postgresql://website_v2_user:${DB_PASSWORD}@db:5432/website_v2" ./node_modules/.bin/ts-node -T scripts/<腳本>.ts <參數>'
```

| 腳本 | 用途 |
|------|------|
| `delete-transaction.ts <交易id> <系統管理員userId> "<原因>" [--yes]` | 以系統管理員身分刪除交易並回溯（預設只預覽，加 `--yes` 才執行） |
| `backfill-disclaimer-pdfs.ts` | 依簽署當時的快照重新產生所有「已完成雙方簽署」的同意書 PDF |
| `merge-line-duplicate-customers.ts [--apply]` | 合併 LINE 綁定產生的重複顧客（預設只預覽） |
| `line-richmenu.ts ./richmenu.png` | 建立 LINE 圖文選單（需 LINE 相關環境變數） |
| `fix-absolute-upload-urls.ts` | 修正舊的上傳檔絕對網址 |

> 腳本會讀寫 `apps/api/storage/`（顧客 PDF、照片），在正式機上執行就是改正式資料。

---

## 六、環境變數（`/opt/website_v2/.env`，不進版控）

| 變數 | 用途 |
|------|------|
| `DOMAIN` | 網域（www.tsanyentest.com） |
| `DB_PASSWORD` | 資料庫密碼 |
| `JWT_SECRET` | 登入 token 金鑰。**不可更改**，改了所有裝置都會被登出、PIN 帳號要重新輸入密碼 |
| `LINE_ENABLED` | `true` 才啟用 LINE 功能 |
| `LINE_STORE_ID` | LINE 對應的分店（24） |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API channel |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LIFF_ID` | LINE Login / LIFF（網站建置時寫入） |

---

## 七、常見問題

| 狀況 | 處理 |
|------|------|
| 網站畫面樣式全跑掉 | 網站建置時工作目錄不是 `apps/web`。用 `deploy.sh` 重新部署 |
| 建置後出現 Application error | 建置完要重啟 web 容器（`deploy.sh` 會做） |
| iPad 上方有網址列 | Safari 分享 →「加入主畫面」，之後從主畫面圖示開啟 |
| 部署後 API 起不來 | `docker logs website_v2_prod-api-1` 看 migration 或錯誤訊息；必要時用備份還原 |
| 硬碟快滿 | `df -h /`；可刪 `/opt/website_v2_backups/` 舊備份、`docker image prune` 清掉沒用的映像 |
| SSL 憑證 | certbot 自動續期；手動檢查：`certbot renew --dry-run` |
