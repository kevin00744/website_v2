---
title: "Customer transaction ledger: checkout adjustments and system_admin delete with rollback"
author: Root
date: 2026-11-16
branch: line-bot-integration
cost: { minutes: 1, tokens: 2211 }
id: l-d03f2050
scope: repo
status: active
src: agent
touches:
  - apps/web/lib/calendar-utils.ts
---

## Decided
- Customer purchases (POS checkout, promotion-plan purchase, direct top-up) all go through the `CustomerTransaction` ledger (`apps/api/src/customer-transactions/transaction-ledger.ts` `createLedgerEntry`). The FinancialRecord / WalletLog / CustomerCourse rows each checkout creates carry `transactionId`. Without that link a delete can't find everything to reverse: the old code only tied them together by the description text 「顧客 #id」.
- Price and session changes happen at checkout, done by staff or manager; nobody edits a transaction afterwards. Single purchase and wallet deduction: amount only. Plan purchase: amount, bonus, and per-item sessions (only items in the plan, each ≥ 1). The adjustment note is optional and fed by quick picks (折數 / 折價券 / 折抵). The original plan and the actual deal are both stored (`planOriginal` / `planActual`).
- Only system_admin can delete, and it is enforced in the service via `actor.role === 'system_admin'`, because RolesGuard lets admin through every @Roles. Delete is a soft delete that reverses every effect in one transaction: courses get `voidedAt`, the wallet is debited back, FinancialRecord gets `deletedAt`, cash is taken back out of petty cash, a POS course deduction gives back `usedSessions`, and the ServiceRecord is marked `isRolledBack`. There is no restore; the user asked for delete = 回溯 only.
- Business hours 13–21 live only in `BUSINESS_HOURS` (apps/web/lib/calendar-utils.ts).
- Text size: `html[data-text-size]` scales rem; set per device in localStorage; an inline boot script in layout.tsx prevents flashing. The calendar's hour height is in rem (`useHourPx`), so it scales too.

## Tried and ruled out
- `prisma migrate diff --from-migrations` fails: the old migrations don't replay on an empty DB (users.email / stores.region drift). Diff against a schema-only `pg_dump` of production instead, and hand-pick only the feature's DDL, because that diff also lists unrelated old drift (FK re-creates, users_email_key drop, timestamp types).
- Deleting a course bundle whose sessions were already used: blocked (`TRANSACTION_COURSE_USED`), not partially reversed.

## Watch out
- Any new query for remaining sessions must filter `voidedAt: null`. Financial and performance queries must filter `deletedAt: null` / `isRolledBack: false`.
- Before this change, POS wallet deduction always failed (the frontend never sent amountPaid), and discounted single purchases failed with AMOUNT_PRICE_MISMATCH.
- Bash heredocs that contain `${...}` get blocked by Claude Code's rm safety check; write the script to a file, or use Edit.
- Next build must run with cwd apps/web or Tailwind finds no classes.
