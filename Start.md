# 啟動 / 關閉專案

> website_v2 跟 `cms` 是完全獨立的兩套系統（不同 container 名稱、不同 network、不同 port、不同資料庫），兩邊可以同時開著互不影響。

## 開啟（每次要開發時）

```bash
cd /Users/tsanyen/Documents/website/website_v2
docker compose up -d
```

確認所有容器都正常啟動：

```bash
docker compose ps
```

應該看到 `website_v2_web`、`website_v2_api`、`website_v2_db` 都是 `running`（`website_v2_db` 要等到 `healthy` 才算真的可以連線）。

> ⚠️ 目前 `web`/`api` 容器只是用乾淨的 `node:20-alpine` image 掛載原始碼待命（執行 `tail -f /dev/null`），**不會自動安裝套件或啟動服務**。第一次使用，或是 `package.json` 有更新時，要照下面「進容器手動操作」的步驟跑一次。

### 進容器手動操作（第一次 / 套件有更新時）

```bash
# api：安裝套件、產生 Prisma Client、建表、啟動開發伺服器
docker compose exec api sh
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

開另一個終端機視窗測試 API 是否活著：

```bash
curl http://localhost:3101/api/v2/signature/1/verify
# 預期回應：{ "code": "SIGNATURE_NOT_FOUND" }
```

```bash
# web（Next.js，目前只有佔位頁面，尚未開發 kiosk/CRM/簽署畫面）
docker compose exec web sh
npm install
npm run dev
```

開啟瀏覽器：

- 前台官網：http://localhost:3100
- 店員後台：http://localhost:3100/customers（佔位頁）
- API：http://localhost:3101/api/v2/*

## 關閉（用完之後）

```bash
cd /Users/tsanyen/Documents/website/website_v2
docker compose stop
```

> `docker compose stop` 只是停止容器，資料庫內容會保留，下次 `docker compose up -d` 即可繼續使用（但 `api`/`web` 容器內手動裝好的 `node_modules` 也還在，不用重新 `npm install`，除非容器被 `down` 掉重建）。

### 完全移除容器（不會用到才需要）

```bash
docker compose down
```

> 這會移除容器但保留資料庫資料（volume 還在）。如果要連資料庫資料一起清空，才需要加 `-v`：
> ```bash
> docker compose down -v
> ```
> ⚠️ 加 `-v` 會清空 `website_v2_db` 所有資料（不會動到 `cms_db`），請小心使用。

## 重啟（修改 docker-compose.yml 或遇到異常時）

```bash
docker compose restart
```

或針對單一服務重啟，例如只重啟 api：

```bash
docker compose restart api
```

> 注意：重啟容器不會重新跑 `npm install`，容器內的 `node_modules` 是裝在掛載的原始碼資料夾裡，重啟後還在；但 `npm run start:dev` 這個前景指令會中斷，需要重新 `docker compose exec api npm run start:dev` 啟動。

## 查看即時日誌（排查問題用）

```bash
docker compose logs -f api
docker compose logs -f db
```

## 常見問題

- **`docker compose exec api sh` 進去後找不到 `node_modules`**：代表還沒跑過 `npm install`，照上面步驟跑一次即可。
- **改了 `prisma/schema.prisma` 之後資料庫沒反應**：要重新進 `api` 容器跑 `npx prisma migrate dev --name <隨意命名這次變更>`。
- **`api`/`web` 顯示 `port already in use`**：通常是本機其他程式佔用 `3100`/`3101`/`5433`，可在 `docker-compose.yml` 改成其他對外 port（容器內部 port 不用動）。
