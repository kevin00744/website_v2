#!/usr/bin/env bash
# 璨妍後台：完整重新部署 / 重新啟動
# 用法：bash /opt/website_v2/deploy.sh
set -euo pipefail

PROJECT_DIR=/opt/website_v2
BUILD_DIR=/opt/website_v2_build
BACKUP_DIR=/opt/website_v2_backups
COMPOSE="docker compose -p website_v2_prod -f $PROJECT_DIR/docker-compose.prod.yml"
DOMAIN=$(grep '^DOMAIN=' "$PROJECT_DIR/.env" | cut -d= -f2)
API_URL="https://$DOMAIN/api/v2"
TS=$(date +%Y%m%d-%H%M%S)

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

echo "== 1/6 確認資料庫已啟動 =="
$COMPOSE up -d db
for i in $(seq 1 30); do
  docker exec website_v2_prod-db-1 pg_isready -U website_v2_user -d website_v2 >/dev/null 2>&1 && break
  sleep 2
done

echo "== 2/6 備份資料庫與目前版本 =="
docker exec website_v2_prod-db-1 pg_dump -U website_v2_user -d website_v2 -Fc > "$BACKUP_DIR/db-$TS.dump"
tar --exclude=apps/web/.next/cache -czf "$BACKUP_DIR/builds-$TS.tgz" apps/api/dist apps/web/.next 2>/dev/null || true
echo "備份：$BACKUP_DIR/db-$TS.dump、builds-$TS.tgz"

echo "== 3/6 建置 API =="
docker run --rm -v "$PROJECT_DIR":/workspace -w /workspace/apps/api node:20-slim sh -c \
  "apt-get update -qq >/dev/null && apt-get install -y -qq openssl >/dev/null 2>&1 \
   && ./node_modules/.bin/prisma generate >/dev/null \
   && ./node_modules/.bin/nest build"

echo "== 4/6 建置網站（在獨立資料夾建置，正式站不中斷）=="
rm -rf -- "${BUILD_DIR:?}"
mkdir -p "$BUILD_DIR/apps"
cp package.json "$BUILD_DIR/"
cp -r packages "$BUILD_DIR/packages"
tar --exclude=web/.next --exclude=web/node_modules -C apps -cf - web | tar -C "$BUILD_DIR/apps" -xf -
# 工作目錄必須是 apps/web，否則 Tailwind 抓不到樣式
docker run --rm -v "$BUILD_DIR":/workspace -v "$PROJECT_DIR/node_modules":/workspace/node_modules:ro \
  -w /workspace/apps/web \
  -e NEXT_PUBLIC_API_BASE_URL="$API_URL" -e CMS_API_INTERNAL_URL=http://api:3000/api/v2 -e NEXT_TELEMETRY_DISABLED=1 \
  node:20-slim node /workspace/node_modules/next/dist/bin/next build

echo "== 5/6 換上新版並重新啟動（API 啟動時自動套用資料庫 migration）=="
rm -rf -- apps/web/.next.old
mv apps/web/.next apps/web/.next.old
mv "$BUILD_DIR/apps/web/.next" apps/web/.next
$COMPOSE up -d api web
$COMPOSE restart api web

echo "== 6/6 檢查啟動狀態 =="
OK=0
for i in $(seq 1 45); do
  if docker logs --since 2m website_v2_prod-api-1 2>&1 | grep -q "successfully started"; then OK=1; break; fi
  if docker logs --since 2m website_v2_prod-api-1 2>&1 | grep -qiE "migration.*failed|Error:"; then break; fi
  sleep 2
done
docker logs --since 2m website_v2_prod-api-1 2>&1 | grep -iE "migration|applied|error|successfully started" || true
LOGIN_CODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/login" || echo 000)

if [ "$OK" = 1 ] && [ "$LOGIN_CODE" = 200 ]; then
  rm -rf -- apps/web/.next.old "${BUILD_DIR:?}"
  echo "✅ 完成：API 已啟動，網站 /login 回應 200"
else
  echo "❌ 啟動有問題（API=$OK，網站=$LOGIN_CODE）。舊版網站保留在 apps/web/.next.old"
  echo "   還原網站：cd $PROJECT_DIR && rm -rf apps/web/.next && mv apps/web/.next.old apps/web/.next && $COMPOSE restart web"
  echo "   還原資料庫：見下方「還原」指令（備份 db-$TS.dump）"
  exit 1
fi
