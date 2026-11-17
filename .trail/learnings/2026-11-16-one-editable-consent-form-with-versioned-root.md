---
title: One editable consent form with versioned signature layout; deductions span purchases; refund-to-credit uses the POS wallet
author: Root
date: 2026-11-16
branch: line-bot-integration
cost: { minutes: 35, tokens: 260578 }
id: l-b4a276c1
scope: repo
status: active
src: agent
touches:
  - apps/api/src/service-records/service-record.service.ts
  - apps/api/src/customer-transactions/transaction-ledger.ts
  - apps/api/src/customer-transactions/customer-transactions.service.ts
  - apps/api/src/customers/disclaimer-pdf.util.ts
  - apps/web/lib/customers-api.ts
  - apps/web/components/admin/customers/CourseRefundModal.tsx
  - apps/api/src/consent-templates/consent-templates.service.ts
  - apps/api/src/consent-templates/consent-templates.controller.ts
  - apps/api/src/consent-templates/consent-templates.module.ts
  - apps/web/lib/api-client.ts
---

## Decided
- One consent document only: the database template, managed on the 同意書管理 page. Saving creates a new version and makes it active. The hard-coded exosome consent was removed because nobody had signed it and nothing in the UI used it.
- The PDF signature boxes were enlarged (46pt row, 220pt wide). Signed snapshots store `layoutVersion`. The customer-side signature is stamped onto the PDF already on disk using anchors recomputed from the staff snapshot, so a snapshot without `layoutVersion` must be rebuilt with the old layout (1). Otherwise the two signatures land in different places.
- Course deduction is "first bought, first used" across purchases: one deduction can span several courses. The per-course split is stored in the transaction's create-log effects (`courseDeductions`), and both admin delete and manager rollback restore from it.
- Refund-to-credit now credits `customer_wallets` (the balance POS deducts from), not `customers.store_credit`, which POS never read. The per-session refund price defaults to actual paid ÷ total sessions of the purchase.

## Tried and ruled out
- Changing the PDF layout without a version flag: a half-signed document (staff signed, customer not yet) would get misaligned signatures.

## Watch out
- Server-side dates on documents must pass `timeZone: 'Asia/Taipei'`. Containers run in UTC, so anything signed between 00:00 and 08:00 Taiwan time got the previous day's date.
- When testing the API from source, mount a copy over `apps/api/storage/customers`; otherwise test signatures write into the real customer folders.

In the code:
- PDF layout: apps/api/src/customers/disclaimer-pdf.util.ts (`CURRENT_LAYOUT_VERSION`, `drawSignatureLine`)
- Rebuild signed PDFs: apps/api/scripts/backfill-disclaimer-pdfs.ts (fully signed only)
- Templates API: apps/api/src/consent-templates/
