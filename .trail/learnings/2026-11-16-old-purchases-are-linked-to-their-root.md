---
title: Old purchases are linked to their finance entry so they can be deleted; iPad PDFs use a scrollable pdf.js viewer
author: Root
date: 2026-11-16
branch: line-bot-integration
cost: { minutes: 1, tokens: 1924 }
id: l-2327e217
scope: repo
status: active
src: agent
touches:
  - apps/web/lib/pdf-viewer.ts
---

## Decided
- Old (pre-ledger) purchases are linked back to their finance entry, so a system admin can delete them with a full rollback like any new record. Match rule: same customer id in the finance description 「（顧客 #id）」 and created within 5 seconds of the course. A linked record stops being legacy and gets a "create" history entry. Records that can't be matched stay legacy and are view-only.
- The user confirmed the old 林舜毅 $39,800 purchase was test data and asked for it to be deleted on production, including its finance income. It was removed through the normal delete logic (not hand-written SQL), so the course was voided, the income marked deleted, petty cash reduced, and history written.
- iPhone/iPad PDFs go through a pdf.js viewer that draws pages to canvases in a scrollable container, because iOS cannot scroll a PDF shown in an iframe; computers keep the new-tab path because their built-in viewer works and supports printing.

## Tried and ruled out
- Just making the old record deletable and leaving the deletion to the user: not chosen; the user asked for it to be done during deployment.
- Showing PDFs on iOS in an `<iframe src=blob:>`: iOS only shows the first page and won't scroll. A new tab doesn't work either in home-screen mode (blob URLs don't open there).

## Watch out
- Code reading `planActual` / `planOriginal` must not assume `price` or `items` exist; backfilled records lacked `price`, which crashed the detail window.
- pdfjs-dist 3.x pulls in the optional Node `canvas` package; next.config aliases `canvas: false` so it stays out of the browser bundle.
- In the PDF viewer, append each canvas only after its render finishes, and clear the container first. Otherwise a cancelled render (React dev double-mount) leaves blank pages.

In the code:
- Link migration: apps/api/prisma/migrations/20261119000100_link_legacy_transactions/migration.sql
- One-off delete (previews by default; `--yes` to apply): `ts-node -T scripts/delete-transaction.ts <txnId> <systemAdminUserId> "<reason>"` in apps/api. To reach the production DB, run it in a node container on the `website_v2_prod_default` network with `--env-file .env`.
- Viewer: apps/web/components/admin/PdfViewer.tsx, opened from apps/web/lib/pdf-viewer.ts via createRoot; pdfjs-dist pinned to 3.11.174.
