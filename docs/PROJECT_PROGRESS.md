# Project Progress — Albinaa Platform

Arabic/RTL debt management and collection platform.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend) | Next.js + TypeScript + React Query + Chart.js (frontend)

---

## Milestones

| # | Milestone | Status | PR | Merged |
|---|-----------|--------|----|--------|
| M1–M5 | Foundation, Auth, Customers, Branches, Collectors, Tasks | ✅ Completed | — | — |
| M6 | Customer Management & Collections | ✅ Completed | PR #1 | 2026-07-24 |
| M7 | Reports, Printing, Export | ✅ Completed | PR #2, #3, #4 | 2026-07-24 |
| M8 | Export, Printing & Customer Statement | 📋 Planned | — | — |

---

## M6 — Customer Management & Collections

**PR #1** — merged 2026-07-24

- Customer CRUD (list, create, edit, detail)
- Branch management
- Collector assignment & management
- Collections integration (record, list, hand-off)
- Payment promises
- Follow-ups
- Tasks
- Notifications
- Roles & permissions (RBAC)
- Settings & system config
- User management
- Data imports (Excel)
- Dashboard with KPIs
- Auth (JWT, 4 seeded users: admin, manager, collector, auditor)

---

## M7 — Reports, Printing, Export

### PR #2 — Executive Dashboard Reports
- 8 report endpoints with filters (from, to, branchId)
- Executive Dashboard page with interactive charts
- RBAC: `reports.executive` (admin + manager)

### PR #3 — Debt Aging Report
- Aging summary (6 buckets) + paginated detail (5 KPIs)
- Collector dropdown filter, 13-column sorting
- URL-synced filters, full pagination

### PR #4 — Collector Performance Report
- Per-collector metrics (10 metrics, 5 KPIs)
- Financial `collectionRate` formula
- Deterministic `topPerformer` across all filtered results
- Date boundary logic: TIMESTAMPTZ `< endExclusive`, DATE `<= endDateInclusive`
- `collectorStatus` filter (active/inactive/all)

---

## M8 — Export, Printing & Customer Statement (Planned)

| Feature | Description |
|---------|-------------|
| Excel Export | Export reports to `.xlsx` with multi-sheet support |
| PDF Export | Server-side PDF generation for reports |
| Receipt Printing | Printable collection receipts |
| Customer Statement | Full account statement per customer |

See [M8 Implementation Plan](./M8_PLAN.md) for detailed specifications.

---

## Project Metrics

| Metric | Value |
|--------|-------|
| Total tables | 75 |
| Total merged PRs | 4 |
| Total commits (non-merge) | 14 |
| Seed users | 4 (admin, manager, collector, auditor) |
| Report endpoints | 11 |
| Frontend pages | 14 |

---

## Completion Summary

```
M1-M5  ████████████████████ 100%  ✅
M6     ████████████████████ 100%  ✅
M7     ████████████████████ 100%  ✅
M8     ░░░░░░░░░░░░░░░░░░░░   0%  📋

Total  ████████████████░░░░  75%
```
