---
title: "LINE bot: open to all roles except accountant, phones stored as digits only, devices stay logged in via refresh tokens"
author: Root
date: 2026-11-16
branch: main
cost: { minutes: 34, tokens: 273390 }
id: l-e25be66f
scope: repo
status: active
replaces: l-98eeb2bd
src: agent
touches:
  - apps/api/prisma/schema.prisma
  - apps/api/src/appointments/appointments.service.ts
  - apps/api/src/line/line.service.ts
  - apps/api/src/line/liff.controller.ts
  - apps/api/src/line/line-admin.controller.ts
  - apps/api/src/line/line-flex.ts
  - apps/api/src/line/line-notify.service.ts
  - packages/copy/zh-TW.ts
  - apps/api/src/auth/auth.service.ts
  - apps/api/src/auth/auth.controller.ts
---

## Decided
- Single store (LINE_STORE_ID). The LINE admin page and LINE appointments are open to every role except accountant; only the "settings status" block is system_admin-only.
- LINE appointments are real appointments: visible in the calendar and included in staff overlap checks. The customer may pick a staff member; no overlap check on the LIFF side, since the store sorts out clashes over LINE.
- Which service items are bookable on LINE, each item's duration, and the slot hours are configured on the LINE admin page.
- No push message when a booking is submitted (it costs LINE message quota); the result shows on the web page. Only confirm/cancel by the store pushes.
- Phone numbers are stored as digits only (0981675415); the UI adds dashes for display. Binding matches on the exact normalized phone plus the name.
- "Remember this device" and PIN accounts use a 180-day sliding refresh token (JWT typ=refresh, not stored in the DB), so redeploys don't log devices out. Logging out removes that account from the PIN list.

## Tried and ruled out
- system_admin-only test gating: dropped once the user opened LINE to all roles except accountant.
- Matching LINE phones with `contains` on the last digits: missed dashed numbers and created duplicate customers.
- Converting pushes to reply: impossible for store-initiated messages, since there is no replyToken.

## Watch out
- Never change JWT_SECRET in production: every device would be logged out and every PIN account would need a password again.
- Any new code that writes customer phones must go through normalizePhone.
- After building web, restart the web container; otherwise the stale manifest causes "Application error".

In the code:
- apps/api/src/common/phone.util.ts; migration 20261118000100_normalize_phones; scripts/merge-line-duplicate-customers.ts (dry-run by default, --apply)
- apps/api/src/auth/auth.service.ts refresh()/issueRefreshToken(); jwt.strategy rejects typ; apps/web/lib/api-client.ts refreshSession()
- apps/api/src/line/line-admin.controller.ts (status=SystemAdminGuard), line.service.ts getBookingOptions/saveBookingSettings
