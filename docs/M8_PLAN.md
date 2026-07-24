# M8 Implementation Plan

Export, Printing & Customer Statement — Albinaa Platform

---

## PR Breakdown

| PR | Feature | Branch | Est. | Dependencies |
|----|---------|--------|------|--------------|
| PR #5 | Export Foundation + Excel | `feature/m8-export` | 3d | `exceljs` library |
| PR #6 | PDF Infrastructure + Report PDF | `feature/m8-pdf` | 3d | PR #5 shared infra |
| PR #7 | Receipt Printing | `feature/m8-receipt` | 2d | PR #6 PDF infra |
| PR #8 | Customer Statement API | `feature/m8-statement-api` | 3d | — |
| PR #9 | Customer Statement UI + Export | `feature/m8-statement-ui` | 2d | PR #8, PR #5 |

**Total estimated effort:** ~13 days

Each PR is on an independent feature branch. The next PR does not begin until the prior PR is reviewed and merged if there is a dependency.

---

## Shared Infrastructure

| Component | Purpose |
|-----------|---------|
| `reports/export/ExportService` | Core export logic (row limits, streaming, PDF rendering) |
| `reports/export/pdf-renderer.ts` | Puppeteer wrapper: singleton pool, timeout, embedded font |
| `reports/export/templates/` | HTML templates per report type |
| `reports/dto/export.dto.ts` | Discriminated DTOs per report+format |
| `lib/api.ts::downloadBlob()` | Frontend download helper |
| Docker: Puppeteer + Noto Sans Arabic | Headless Chrome + embedded Arabic font |

---

## 1. Excel Export (PR #5)

### Goal
Export any report to a multi-sheet `.xlsx` file with row limits, streaming, and the same RBAC/org/branch scope as the original report query.

### API

```
POST /reports/export
Authorization: Bearer <token>

Body (discriminated by report type):
{
  "report": "executive" | "aging" | "aging-detail" | "collectors",
  "format": "xlsx",
  "from": "2026-01-01",
  "to": "2026-07-24",
  "branchId": "...",
  "collectorId": "...",
  "collectorStatus": "active"
}

Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### Discriminated DTO Design

```typescript
// reports/dto/export.dto.ts

class BaseExportDto {
  @IsIn(['xlsx', 'pdf']) format: 'xlsx' | 'pdf';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

class ExecutiveExportDto extends BaseExportDto {
  @IsIn(['executive']) report: 'executive';
}

class AgingExportDto extends BaseExportDto {
  @IsIn(['aging']) report: 'aging';
  @IsOptional() @IsUUID() collectorId?: string;
}

class AgingDetailExportDto extends BaseExportDto {
  @IsIn(['aging-detail']) report: 'aging-detail';
  @IsOptional() @IsUUID() collectorId?: string;
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
}

class CollectorsExportDto extends BaseExportDto {
  @IsIn(['collectors']) report: 'collectors';
  @IsOptional() @IsUUID() collectorId?: string;
  @IsOptional() @IsIn(['active','inactive','all']) collectorStatus?: string;
  @IsOptional() sortBy?: string;
  @IsOptional() @IsIn(['asc','desc']) sortDir?: string;
}

// Each report type only accepts its relevant filters.
// collectors does NOT accept aging-specific filters and vice versa.
```

### Backend

| File | Change |
|------|--------|
| `reports/export/export.service.ts` | New service: row limits, streaming, orchestration |
| `reports/reports.service.ts` | Add data-fetching methods for export (no pagination) |
| `reports/dto/export.dto.ts` | Discriminated DTOs per report type |
| `reports/reports.controller.ts` | Update `POST /reports/export` handler |
| `package.json` | Add `exceljs` dependency |

**Row limits and streaming:**

```
MAX_EXPORT_ROWS = 50,000

Flow:
1. Validate DTO (discriminated — only valid filters for each report)
2. Fetch data with RBAC + org scope (same as report endpoint)
3. If rowCount > MAX_EXPORT_ROWS:
   - Return 400: "التصدير محدود بـ 50,000 صف. استخدم الفلاتر لتضييق النطاق."
4. If rowCount <= 10,000: use exceljs in-memory workbook
5. If rowCount > 10,000 and <= 50,000: use exceljs streaming worksheet
6. Return buffer as attachment
```

- RBAC preserved: `reports.executive` required.
- Org scope preserved: `organization_id` filter in all queries.
- Branch scope preserved: `branchId` filter forwarded to query.

### Frontend

| File | Change |
|------|--------|
| Each report page | Add "تصدير Excel" button |
| `lib/api.ts` | Add `downloadBlob()` helper |

### Risks
- `exceljs` memory usage on 50k rows — mitigated by streaming mode.
- Browser download blocked by popup — use `<a download>` pattern.

### Test Plan
- Export executive report → single sheet, correct row count.
- Export aging → two sheets (summary + detail).
- Export with filters → data matches filtered API response.
- Export empty dataset → sheet with headers only.
- Export exceeds 50k rows → 400 error with Arabic message.
- Export 15k rows → streaming mode used, valid .xlsx.
- Verify `.xlsx` opens in Excel / LibreOffice / Google Sheets.
- Verify Arabic text (UTF-8) renders correctly.
- Verify RTL worksheet direction.

### Acceptance Criteria
- [ ] Discriminated DTO: each report type only accepts its own filters.
- [ ] `POST /reports/export` returns valid `.xlsx` for all 4 report types.
- [ ] Max 50,000 rows — 400 error if exceeded.
- [ ] Streaming mode for > 10,000 rows.
- [ ] RBAC, org scope, branch scope preserved from original report query.
- [ ] Styled headers (bold, background, borders).
- [ ] Currency: 2 decimal places. Percentage: `%` suffix.
- [ ] RTL worksheet direction.
- [ ] Loading state in UI. Button disabled when data empty.
- [ ] File opens correctly in Excel / LibreOffice.

---

## 2. PDF Export (PR #6)

### Goal
Generate server-side PDF for any report, with a managed Puppeteer pool, embedded Arabic font, and enforced row limits.

### API

```
POST /reports/export
{
  "report": "executive" | "aging" | "aging-detail" | "collectors",
  "format": "pdf",
  ...same filters as xlsx...
}

Response: application/pdf
```

Same endpoint, same discriminated DTO, different `format`.

### Puppeteer Management

```
reports/export/pdf-renderer.ts

Singleton browser pool:
- Pool size: 2 (configurable via env PDF_POOL_SIZE)
- Lazy initialization on first request
- page.goto() timeout: 15s
- page.pdf() timeout: 30s
- Always close page in finally block
- Browser restart on error (SIGTERM → re-launch)
- Graceful shutdown on process exit

Font:
- Noto Sans Arabic Regular + Bold bundled in /assets/fonts/
- Embedded via @font-face in CSS (local file, no external URLs)
- All HTML templates use this font family exclusively

Security:
- HTML templates: no external <img src>, <link>, <script> allowed
- CSP header in template: default-src 'none'; style-src 'unsafe-inline'
- No user-controlled URLs in templates
```

### Row Limits

```
MAX_PDF_ROWS = 5,000

If report data > 5,000 rows:
  Return 400: "تصدير PDF محدود بـ 5,000 صف. استخدم الفلاتر أو تصدير Excel."
```

### Backend

| File | Change |
|------|--------|
| `reports/export/pdf-renderer.ts` | Puppeteer pool wrapper |
| `reports/export/templates/*.html` | HTML template per report type |
| `reports/export/export.service.ts` | `exportPdf()` method |
| `assets/fonts/NotoSansArabic-Regular.woff2` | Embedded Arabic font |
| `assets/fonts/NotoSansArabic-Bold.woff2` | Embedded Arabic font bold |
| `package.json` | Add `puppeteer` dependency |

### Frontend
Same as Excel — "تصدير PDF" button next to "تصدير Excel".

### Risks
- Puppeteer requires headless Chrome in Docker — add to Dockerfile.
- Font file size (~2MB) increases image size — acceptable tradeoff.
- PDF generation latency 2-5s — acceptable for on-demand export.

### Test Plan
- Export executive PDF → opens correctly, KPIs visible.
- Export aging PDF → table renders with all columns.
- Arabic text renders without missing glyphs.
- Logo and company name in header.
- Active filters shown in header section.
- Page breaks don't split rows mid-way.
- PDF < 1MB for 5k rows.
- Export > 5,000 rows → 400 error.
- Verify no external network requests in HTML templates.

### Acceptance Criteria
- [ ] Puppeteer singleton pool with configurable size.
- [ ] Page timeout: 15s navigation, 30s PDF generation.
- [ ] Page closed in `finally` block — no leaked instances.
- [ ] No external URLs in HTML templates.
- [ ] Font embedded locally (no CDN references).
- [ ] Max 5,000 rows — 400 error if exceeded.
- [ ] Company logo + name in header.
- [ ] Report title + date range displayed.
- [ ] Active filters shown.
- [ ] Arabic text renders correctly.
- [ ] A4 landscape for wide tables, portrait for narrow.
- [ ] PDF < 1MB.

---

## 3. Receipt Printing (PR #7)

### Goal
Generate a printable PDF receipt for a collection transaction, with organization-scoped receipt numbering and proper permissions.

### API

```
GET /collections/:id/receipt
Authorization: Bearer <token>

Response: application/pdf
```

### Receipt Number Design

- Do NOT use truncated UUID as receipt number.
- Use `collections.reference_number` if present.
- If no reference_number exists, generate a sequential number per organization:
  - Format: `{orgShortCode}-{YYYY}-{sequence}` e.g. `ALB-2026-000123`
  - Sequence stored in `system_settings` as `receipt_counter_{orgId}`.
  - Atomic increment via `UPDATE system_settings SET value = value + 1 WHERE key = ... RETURNING value`.
- Receipt number is unique within the organization.
- No schema migration needed — uses existing `system_settings` table.

### Permissions

```
Authorization rules:
1. Verify collection exists and belongs to user's organizationId.
2. Roles allowed: admin, manager, auditor.
3. Collector role: allowed ONLY for collections where collector_id matches
   the collector's own ID, OR if organization policy permits broader access.
4. If collection.status == 'reversed':
   - Receipt IS generated but stamped with "ملغى / معكوس" watermark.
   - Amount shown as strikethrough.
   - OR: return 400 with message "لا يمكن إصدار إيصال لعملية معكوسة"
   (decision: return receipt with watermark — more informative).
5. Verify the collector user exists and is active.
```

### Backend

| File | Change |
|------|--------|
| `collections.controller.ts` | Add `GET /:id/receipt` endpoint |
| `collections.service.ts` | Add `generateReceipt(id, user)` method with permission checks |
| `reports/export/pdf-renderer.ts` | Reuse Puppeteer pool from PR #6 |
| `reports/export/templates/receipt.html` | Receipt HTML template |

**Receipt template content:**
- Organization name & logo
- Receipt number (sequential, org-scoped)
- Date & time of collection
- Customer name & account reference
- Collector name
- Amount (large, prominent)
- Currency
- Payment method
- Remaining balance (if available)
- If reversed: "ملغى / معكوس" watermark overlay

### Frontend

| File | Change |
|------|--------|
| Collection detail page | Add "طباعة الإيصال" button |
| `components/receipt-preview.tsx` | Print dialog component |

### Risks
- Sequential numbering race condition — mitigated by atomic SQL increment.
- Thermal printer compatibility (80mm) — support A4 as default, thermal as option.
- Receipt counter overflow — bigint, practically impossible.

### Test Plan
- Generate receipt for existing collection → PDF correct.
- Receipt number is sequential, not UUID.
- Reversed collection → receipt shows "ملغى / معكوس" watermark.
- Collector tries to print another collector's receipt → 403.
- Admin prints any receipt → 200.
- Non-existent collection → 404.
- Collection from different organization → 403.
- Receipt number unique within org.
- Amount formatted prominently.

### Acceptance Criteria
- [ ] Receipt number is sequential org-scoped (not UUID).
- [ ] Atomic counter via `system_settings`.
- [ ] organizationId verified — cross-org access returns 403.
- [ ] Collector can only print own collections (or per policy).
- [ ] Reversed collection: receipt with "ملغى / معكوس" watermark.
- [ ] Receipt: org name, receipt #, date, customer, collector, amount, method, currency.
- [ ] Amount displayed prominently.
- [ ] A4 paper format.
- [ ] PDF < 1s generation time.
- [ ] "Print" button on collection detail page.
- [ ] Non-existent collection → 404.

---

## 4. Customer Statement (PR #8 + PR #9)

### Goal
Generate a comprehensive account statement for a customer showing **financial transactions** (affecting balance) and **activities** (non-financial events) within a date range, with multi-currency support.

### Key Design Decisions

**Financial transactions vs activities — strictly separated:**

```
financialTransactions:           activities (Timeline):
- opening (opening balance)      - promise (payment promise)
- invoice / debit                - followup (follow-up event)
- collection / credit            - note (free-text note)
- adjustment
- reversal

Only financialTransactions affect the running balance.
Activities are displayed in a separate timeline panel.
```

**Opening balance source of truth:**

```
Opening balance is derived from the operational ledger (operational_ledger),
NOT from customer_balances.accounting_balance.

The operational ledger contains journal-style entries:
- Each financial event creates a ledger entry with:
  - occurredAt, sequence, id (for deterministic ordering)
  - type (invoice, collection, adjustment, reversal)
  - debit (increase balance), credit (decrease balance)
  - running_balance (computed at insert time)

openingBalance = operational_ledger.running_balance
  for the last entry BEFORE `from` date for this customer+currency.

If no ledger entries exist before `from`:
  openingBalance = 0 (or initial balance from customer creation, if recorded).

Invariant:
  closingBalance = openingBalance + SUM(debits) - SUM(credits)
  (within the date range, for financial transactions only)
```

**Multi-currency:**

```
GET /customers/:id/statement
Query params: from, to, currencyCode (REQUIRED if customer has > 1 currency)

Response:
{
  "customer": { "id", "name", "phone", "accountRef" },
  "currencyCode": "YER",
  "summary": {
    "openingBalance": 5000,
    "totalDebits": 3000,
    "totalCredits": 2000,
    "closingBalance": 6000,
    "transactionCount": 5,
    "promiseCount": 2,
    "followupCount": 3
  },
  "balancesByCurrency": {
    "YER": { "opening": 5000, "closing": 6000 },
    "USD": { "opening": 200, "closing": 150 }
  },
  "financialTransactions": [
    {
      "id": "...",
      "occurredAt": "2026-07-24T10:00:00Z",
      "type": "collection",
      "description": "تحصيل نقدي",
      "debit": 0,
      "credit": 2000,
      "balance": 3000,
      "reference": "COL-001"
    }
  ],
  "activities": [
    {
      "id": "...",
      "occurredAt": "2026-07-24T14:00:00Z",
      "type": "promise",
      "description": "وعد بدفع 500 يمني",
      "amount": 500
    }
  ]
}
```

**Mandatory currencyCode:** If the customer has transactions in more than one currency, `currencyCode` query parameter is required. If omitted and customer is multi-currency, return 400: "يجب تحديد العملة لهذا العميل".

### Deterministic Transaction Ordering

```sql
ORDER BY occurred_at ASC, sequence ASC, id ASC
```

- `occurred_at`: timestamp of the event
- `sequence`: sub-ordering within same timestamp (for ledger entries created in batch)
- `id`: final tiebreaker (UUID, naturally unique)

This ensures running balance is computed deterministically regardless of query plan.

### Reversals in Statement

```
When a collection is reversed:
1. The original collection appears as type "collection" with credit amount.
2. A reversal entry appears as type "reversal" with debit amount (opposite).
3. Net effect on balance: zero.
4. reversed collections are NOT counted as valid collections in summary.totalCredits.
5. The reversal entry IS counted in summary.totalDebits.

Display:
- Original: "تحصيل نقدي" — credit 2000, balance 3000
- Reversal: "عكس تحصيل" — debit 2000, balance 5000
- Both visible in statement; net = 0 for this pair.
```

### API — Full Design

```
GET /customers/:id/statement
Query: from, to, currencyCode*, page*, limit*
*currencyCode: required if customer has > 1 currency
*page/limit: for pagination of financialTransactions (default: all, max: 500)

GET /customers/:id/statement.pdf
Query: from, to, currencyCode
Response: application/pdf

GET /customers/:id/statement.xlsx
Query: from, to, currencyCode
Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### Backend

| File | Change |
|------|--------|
| `customers.controller.ts` | Add `GET /:id/statement`, `/:id/statement.pdf`, `/:id/statement.xlsx` |
| `customers.service.ts` | Add `getStatement(id, query)` method |
| `customers/dto/statement.dto.ts` | `StatementQueryDto` with from, to, currencyCode, page, limit |

**Opening balance calculation:**

```sql
-- Get last ledger entry before `from` for this customer+currency
SELECT running_balance
FROM operational_ledger
WHERE customer_id = $1
  AND currency_code = $2
  AND occurred_at < $from
ORDER BY occurred_at DESC, sequence DESC, id DESC
LIMIT 1;
```

If no row found → `openingBalance = 0`.

**Financial transactions query:**

```sql
SELECT id, occurred_at, sequence, type, description, debit, credit, running_balance, reference
FROM operational_ledger
WHERE customer_id = $1
  AND currency_code = $2
  AND occurred_at >= $from
  AND occurred_at < $endExclusive
ORDER BY occurred_at ASC, sequence ASC, id ASC;
```

**Activities query (separate):**

```sql
-- Promises
SELECT id, promise_date AS occurred_at, 'promise' AS type,
       expected_amount AS amount, status AS description
FROM payment_promises
WHERE customer_id = $1
  AND promise_date >= $from AND promise_date <= $endDateInclusive
  AND currency_code = $2
ORDER BY promise_date ASC, id ASC;

-- Followups
SELECT id, followup_at AS occurred_at, 'followup' AS type,
       notes AS description
FROM followups
WHERE customer_id = $1
  AND followup_at >= $from AND followup_at < $endExclusive
  AND deleted_at IS NULL
ORDER BY followup_at ASC, id ASC;
```

**Summary computation:**

```sql
SELECT
  SUM(debit) AS total_debits,
  SUM(credit) AS total_credits,
  COUNT(*) AS transaction_count
FROM operational_ledger
WHERE customer_id = $1
  AND currency_code = $2
  AND occurred_at >= $from
  AND occurred_at < $endExclusive;

closingBalance = openingBalance + totalDebits - totalCredits;
```

### Frontend (PR #9)

| File | Change |
|------|--------|
| `customers/[id]/page.tsx` | Add "كشف حساب" button |
| `customers/[id]/statement/page.tsx` | Statement page |
| `components/statement/financial-table.tsx` | Financial transactions table |
| `components/statement/activity-timeline.tsx` | Activities timeline (promises + followups) |
| `components/statement/summary-cards.tsx` | Summary: opening, debits, credits, closing |

**Layout:**

```
┌──────────────────────────────────────────────┐
│  Summary Cards: Opening | Debits | Credits | Closing │
├──────────────────────────────────────────────┤
│  Financial Transactions Table                │
│  (date, type, description, debit, credit, balance)   │
├──────────────────────────────────────────────┤
│  Activities Timeline (right side panel)      │
│  (promise, followup, note icons + details)   │
├──────────────────────────────────────────────┤
│  Export: [Excel] [PDF] [Print]               │
└──────────────────────────────────────────────┘
```

### Database

- Query `operational_ledger` for financial transactions (if table exists; if not, derive from `collections` + adjustments).
- Query `payment_promises` and `followups` for activities.
- No schema migration needed — uses existing tables.
- If `operational_ledger` is empty/missing: fallback to deriving from `collections` table with balance computation (documented as temporary until ledger is populated).

### Risks
- `operational_ledger` may not have historical entries — fallback needed.
- Multi-currency requires all queries to filter by `currencyCode`.
- Running balance must be computed at ledger insert time, not at query time.
- Large statements (> 500 transactions) need pagination.

### Test Plan (Non-zero data)

1. **Opening + invoice + collection:**
   - Invoice 1000 → collection 400 → balance should be 600.
   - Verify closingBalance = openingBalance + debits - credits.

2. **Multiple transactions same timestamp:**
   - Two collections at same second → ordering by sequence, then id.
   - Running balance correct after each.

3. **Reversed collection:**
   - Collection 500 → reversed → reversal entry of 500.
   - Net effect = 0. Both visible in statement.
   - Summary: totalCredits excludes reversed, totalDebits includes reversal.

4. **Customer with two currencies:**
   - Collections in YER and USD.
   - Without currencyCode → 400 error.
   - With currencyCode=YER → only YER transactions shown.
   - balancesByCurrency shows both.

5. **from=to (single day):**
   - Only transactions on that day shown.

6. **Transactions at 00:00 and 23:59:**
   - Both included when from=to=today.

7. **Transaction tomorrow excluded:**
   - from=to=today → tomorrow's collection not shown.

8. **No transactions but opening balance exists:**
   - Statement shows opening balance, empty transaction list, closing = opening.

9. **Pagination doesn't change running balance:**
   - Page 1 last row balance matches page 2 first row adjustment.

10. **closingBalance matches ledger:**
    - Compare statement closingBalance with last ledger entry running_balance.

### Acceptance Criteria
- [ ] `financialTransactions` and `activities` are strictly separated.
- [ ] `financialTransactions`: opening, invoice/debit, collection/credit, adjustment, reversal.
- [ ] `activities`: promise, followup, note — do NOT affect balance.
- [ ] Opening balance derived from `operational_ledger` (not `accounting_balance`).
- [ ] `closingBalance = openingBalance + debits - credits` invariant holds.
- [ ] Multi-currency: `currencyCode` required for multi-currency customers.
- [ ] `balancesByCurrency` returned for overview.
- [ ] Ordering: `occurredAt ASC, sequence ASC, id ASC`.
- [ ] Reversed collection: both original + reversal visible, net = 0.
- [ ] Reversed collection excluded from `totalCredits` summary.
- [ ] Pagination supported for financial transactions.
- [ ] Statement PDF and Excel export available.
- [ ] Non-existent customer → 404.
- [ ] Cross-org access → 403.
- [ ] 10 test scenarios with non-zero data pass.
