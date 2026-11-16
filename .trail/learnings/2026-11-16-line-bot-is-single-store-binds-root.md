---
title: "LINE bot is single-store, binds by phone plus name, and is visible only to system_admin while in testing"
author: Root
date: 2026-11-16
branch: main
cost: { minutes: 20, tokens: 245590 }
id: l-98eeb2bd
scope: repo
status: active
src: agent
touches:
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/migrations/20261117000000_line_integration/migration.sql
  - packages/copy/zh-TW.ts
  - apps/api/src/line/line.config.ts
  - apps/api/src/line/line.util.ts
  - apps/api/src/line/line-messaging.service.ts
  - apps/api/src/line/line-flex.ts
  - apps/api/src/line/line-notify.service.ts
  - apps/api/src/line/line-messaging.module.ts
  - apps/api/src/line/line.service.ts
---

## Decided
- The system serves a single store: one LINE Official Account, store fixed by env LINE_STORE_ID (no per-store channels).
- Binding: customer enters phone + name. Phone matches an existing customer in that store -> name must also match (whitespace ignored) before binding. No match -> a new customer is created under the disabled "line-bot" user and bound.
- Booking is a request: creates an appointment with status=booked, source=line, no staff; staff confirm in the calendar and the customer gets a LINE push.
- Test phase: everything LINE-related in the back office is system_admin ONLY (not admin). LINE appointments are hidden from every other role, cannot be edited by them, and are excluded from staff overlap checks.

## Tried and ruled out
- One LINE channel per store: user said the system is single-store, so not needed.
- Phone-only binding (as the user first described): anyone knowing a phone number could see that customer's stored value, so a name match was added.
- Staff-issued binding codes / SMS OTP: more friction or paid SMS; not chosen.
- Instant slot booking with business-hours config: much larger scope; the user chose request + store confirmation.

## Watch out
- RolesGuard lets admin through every @Roles check, so it cannot gate test features; use SystemAdminGuard / isSystemAdmin.
- When LINE leaves testing, remove the source filter (visibleSourceWhere) and the source='staff' overlap restriction in appointments, and relax the role checks.
- NEXT_PUBLIC_LIFF_ID is baked in at next build; rebuild web after changing it.

In the code:
- apps/api/src/line/ (webhook, LIFF controller + LiffAuthGuard, admin controller, LineService.bind/createBooking)
- apps/api/src/appointments/appointments.service.ts visibleSourceWhere(), assertNoOverlap source filter
- apps/api/src/auth/system-admin.guard.ts, role-access.util.ts isSystemAdmin
- migration 20261117000000_line_integration (AppointmentSource enum, line_accounts, line-bot user)
- env: LINE_ENABLED (default false), LINE_STORE_ID, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, LINE_LOGIN_CHANNEL_ID, LINE_LIFF_ID
