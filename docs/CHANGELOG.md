# Changelog

All notable changes to the Albinaa Platform are documented here.

## [Unreleased] — M8: Export, Printing & Statement

| Feature | Status |
|---------|--------|
| Excel Export | Planned |
| PDF Export | Planned |
| Receipt Printing | Planned |
| Customer Statement | Planned |

---

## [M7] — Reports, Printing, Export — 2026-07-24

### PR #2 — Executive Dashboard Reports
- **Merged:** 2026-07-24
- **Branch:** `feature/m7-reports`
- **Commits:** `2c911d1`, `d76ff9b`
- **Files:** `reports.service.ts`, `reports.controller.ts`, `reports.module.ts`, dashboard page, charts

**Features:**
- `GET /reports/executive/kpis` — 6 KPIs (totalCustomers, activeCustomers, totalDebt, overdueDebt, collectionRate, activeCollectorCount)
- `GET /reports/executive/collections-monthly` — 12-month collection trend
- `GET /reports/executive/debt-by-branch` — debt distribution by branch
- `GET /reports/executive/customers-collection-state` — pie chart data
- `GET /reports/executive/promises-by-status` — promise fulfillment breakdown
- `GET /reports/executive/followups-summary` — followup statistics
- `GET /reports/executive/unfollowed-customers` — customers without recent followups
- `GET /reports/executive/collections-by-method` — payment method breakdown
- Executive Dashboard page with interactive filters (from, to, branchId)
- RBAC: `reports.executive` permission (admin + manager only)

### PR #3 — Debt Aging Report
- **Merged:** 2026-07-24
- **Branch:** `feature/m7-debt-aging`
- **Commits:** `4c9de90`, `1b2eccb`
- **Files:** `reports.service.ts`, `reports.dto.ts`, aging page

**Features:**
- `GET /reports/executive/aging` — 6-bucket aging summary (settled, 1-30, 31-60, 61-90, 91-180, 180+)
- `GET /reports/executive/aging-detail` — paginated aging detail with 5 KPIs
- Bucket boundaries: `current`=0d, `1-30`=1-30d, `31-60`=31-60d, `61-90`=61-90d, `90+`=90+d
- Collector filter with `GET /reports/collectors` dropdown
- from/to date filters on `first_tx` in `bucketed` CTE
- 13-column sorting, URL-synced filters, full pagination

### PR #4 — Collector Performance Report
- **Merged:** 2026-07-24
- **Branch:** `feature/m7-collector-performance`
- **Merge SHA:** `d44e2c9`
- **Commits:** `8ca2d00`, `800bb36`, `dd5d59f`, `020edf3`, `eeabb35`
- **Files:** `reports.dto.ts`, `reports.service.ts`, collectors page, app-shell, breadcrumb, reports page

**Features:**
- `GET /reports/executive/top-collectors` — per-collector metrics with pagination
- 10 metrics: todayCollected, weekCollected, monthCollected, collectionsCount, followupCount, promiseCount, fulfilledCount, fulfillmentRate, outstandingBalance, collectionRate
- 5 KPIs: totalCollectors, totalCollected, avgFulfillmentRate, totalCustomers, topPerformer
- `collectionRate` formula: `collected / (collected + outstanding) * 100`
- `topPerformer`: `monthCollected DESC, fulfillmentRate DESC, collector ASC` across all filtered results
- Date boundaries: TIMESTAMPTZ uses `< endExclusive`, DATE uses `<= endDateInclusive`
- today/week capped with `LEAST(todayEnd/weekEnd, endExclusive)`
- `collectorStatus` filter: active/inactive/all (default: active)
- 9-column sorting, URL-synced filters, full pagination

---

## [M6] — Customer Management & Collections — 2026-07-24

### PR #1 — M6 Complete
- **Merged:** 2026-07-24
- **Branch:** `feature/m6-final`
- **Commit:** `d396656`

**Features:**
- Customer CRUD (list, create, edit, detail)
- Branch management
- Collector assignment
- Collections integration (record, list, hand-off)
- Payment promises
- Follow-ups
- Tasks
- Notifications
- Roles & permissions (RBAC)
- Settings
- User management
- Data imports
- Dashboard with KPIs
- Auth (JWT login, 4 seeded users)
