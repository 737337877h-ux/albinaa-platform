# M8 Implementation Plan

Export, Printing & Customer Statement — Albinaa Platform

---

## 1. Excel Export

### Goal
Export any report (executive dashboard, aging, collector performance) to a multi-sheet `.xlsx` file, preserving all filters applied by the user.

### API

```
POST /reports/export
Content-Type: application/json
Authorization: Bearer <token>

Body:
{
  "report": "executive" | "aging" | "aging-detail" | "collectors",
  "format": "xlsx",
  "from": "2026-01-01",
  "to": "2026-07-24",
  "branchId": "...",
  "collectorId": "...",
  "collectorStatus": "active"
}

Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (binary)
```

**Notes:**
- Existing endpoint `POST /reports/export` already registered in controller — extend its handler.
- Use `exceljs` library (npm package) for .xlsx generation.
- Each report produces one sheet with headers + data rows.
- Aging report produces two sheets: summary + detail.
- KPIs row at top, then data table.
- Arabic column headers, RTL sheet direction.

### Backend

| File | Change |
|------|--------|
| `reports.service.ts` | Add `exportExcel(report, query)` method |
| `reports.module.ts` | Add `exceljs` import |
| `package.json` | Add `exceljs` dependency |

**Implementation:**
- Route query to the corresponding `collectorsPerformance()`, `agingDetail()`, etc.
- Collect full dataset (no pagination — export all rows).
- Build workbook with `exceljs`: header styling (bold, background, borders), column widths, number formatting for currency/percentages.
- RTL worksheet direction via `worksheet.views = [{ rightToLeft: true }]`.
- Return buffer as `Content-Disposition: attachment; filename="report.xlsx"`.

### Frontend

| File | Change |
|------|--------|
| Each report page | Add "تصدير Excel" button |
| `lib/api.ts` | Add `downloadBlob()` helper |

**Implementation:**
- Button triggers `POST /reports/export` with current filter state.
- Response is a Blob; trigger browser download via `URL.createObjectURL`.
- Show loading spinner during generation.
- Disabled when data is empty.

### Database
None — uses existing report queries.

### Risks
- Large datasets (10k+ rows) may be slow — mitigate with streaming export.
- `exceljs` memory usage on large files — consider `xlsx-populate` as lighter alternative.
- Browser may block popup downloads — use `<a download>` pattern.

### Test Plan
- Export executive report with no filters → single sheet, correct row count.
- Export aging with from/to → data matches API response.
- Export collector performance → all columns present, currency formatted.
- Export with filters applied → exported data matches filtered view.
- Export empty dataset → empty sheet with headers only.
- Verify `.xlsx` opens correctly in Excel / LibreOffice / Google Sheets.
- Verify Arabic text renders correctly (UTF-8).

### Acceptance Criteria
- [ ] `POST /reports/export` returns valid `.xlsx` file for all 4 report types.
- [ ] All active filters from the UI are applied to the export.
- [ ] Headers are styled (bold, background color, borders).
- [ ] Currency columns formatted with 2 decimal places.
- [ ] Percentage columns formatted as `%`.
- [ ] RTL direction set on worksheet.
- [ ] Download triggers automatically in browser.
- [ ] Loading state shown during generation.
- [ ] Button disabled when no data.
- [ ] File opens correctly in Excel / LibreOffice.

---

## 2. PDF Export

### Goal
Generate server-side PDF for any report, suitable for printing or emailing to stakeholders.

### API

```
POST /reports/export
Content-Type: application/json
Authorization: Bearer <token>

Body:
{
  "report": "executive" | "aging" | "aging-detail" | "collectors",
  "format": "pdf",
  "from": "2026-01-01",
  "to": "2026-07-24",
  ...
}

Response: application/pdf (binary)
```

**Notes:**
- Same endpoint as Excel, different `format` value.
- Use `@react-pdf/renderer` on backend, or `puppeteer` / `pdf-lib` for generation.
- Recommended: `puppeteer` (already commonly available) with HTML template → PDF.

### Backend

| File | Change |
|------|--------|
| `reports.service.ts` | Add `exportPdf(report, query)` method |
| `reports/pdf.template.ts` | HTML template for each report type |
| `package.json` | Add `puppeteer` or `pdf-lib` dependency |

**Implementation:**
- Fetch report data via existing service methods.
- Render HTML template with data (Handlebars or template literals).
- Convert HTML to PDF via Puppeteer (`page.pdf()`).
- Include: company logo, report title, filters applied, date range, data table, KPIs.
- Page size: A4 landscape for wide tables, A4 portrait for statements.
- Arabic font: embed Noto Sans Arabic or similar for proper rendering.
- Return as `Content-Disposition: attachment; filename="report.pdf"`.

### Frontend

| File | Change |
|------|--------|
| Each report page | Add "تصدير PDF" button (next to Excel button) |
| `lib/api.ts` | Reuse `downloadBlob()` helper |

**Implementation:**
- Same pattern as Excel export.
- Button shows PDF icon, triggers download.

### Database
None — uses existing report queries.

### Risks
- Puppeteer requires headless Chrome in Docker — add to `Dockerfile`.
- PDF generation may be slow (2-5s) — use background job for large reports.
- Arabic text rendering requires correct font embedding.
- Memory usage with Puppeteer — manage browser instances carefully.

### Test Plan
- Export executive report PDF → opens correctly, shows all KPIs.
- Export aging PDF → table renders with correct columns.
- Export collector performance PDF → all 12 columns visible.
- Arabic text renders without boxes/garbled characters.
- Logo and company name appear in header.
- Filters applied section shows active filters.
- Page breaks don't split rows mid-way.
- PDF size < 1MB for typical reports.

### Acceptance Criteria
- [ ] `POST /reports/export` with `format=pdf` returns valid PDF.
- [ ] Company logo and name in page header.
- [ ] Report title and date range displayed.
- [ ] Active filters shown in header section.
- [ ] Data table renders correctly with all columns.
- [ ] Arabic text renders properly (no missing glyphs).
- [ ] Currency and percentage formatting preserved.
- [ ] Page layout: A4 landscape for wide tables.
- [ ] PDF < 1MB for typical datasets.
- [ ] File downloads automatically in browser.

---

## 3. Receipt Printing

### Goal
Generate a printable receipt for each collection transaction, suitable for hand-off to customer.

### API

```
GET /collections/:id/receipt
Authorization: Bearer <token>

Response: application/pdf (binary)
```

### Backend

| File | Change |
|------|--------|
| `collections.controller.ts` | Add `GET /:id/receipt` endpoint |
| `collections.service.ts` | Add `generateReceipt(id)` method |
| `collections/receipt.template.ts` | Receipt HTML template |

**Implementation:**
- Fetch collection by ID with customer, collector, method, currency data.
- Render receipt template:
  - Organization name & logo
  - Receipt number (collection ID truncated)
  - Date & time of collection
  - Customer name & account reference
  - Collector name
  - Amount (large, prominent)
  - Currency
  - Payment method
  - Remaining balance (if available)
  - QR code or barcode (optional — using `qrcode` npm package)
- Generate PDF via Puppeteer.
- Print-optimized: no background colors, minimal margins, thermal printer width (80mm) option.

### Frontend

| File | Change |
|------|--------|
| Collection detail page | Add "طباعة الإيصال" button |
| `components/receipt-preview.tsx` | Print dialog component |

**Implementation:**
- Button triggers `GET /collections/:id/receipt`.
- Opens PDF in new tab / triggers download.
- Alternative: `window.print()` with CSS `@media print` for browser-native printing.
- Show receipt preview before printing.

### Database
None — uses existing `collections` table data.

### Risks
- Thermal printer compatibility (80mm width) — test with actual hardware.
- PDF generation latency — should be < 1s per receipt.
- Receipt numbering — use collection UUID (short) or sequential number from `system_settings`.
- Paper size varies — support A4 and thermal widths.

### Test Plan
- Generate receipt for existing collection → PDF contains correct data.
- Receipt shows customer name, amount, date, collector, method.
- Receipt prints correctly on A4.
- Receipt preview shows correct layout.
- Non-existent collection ID → 404.
- Receipt includes organization name and logo.
- Amount displayed prominently and formatted.

### Acceptance Criteria
- [ ] `GET /collections/:id/receipt` returns valid PDF.
- [ ] Receipt includes: org name, receipt #, date, customer, collector, amount, method, currency.
- [ ] Amount displayed prominently (large font).
- [ ] Receipt formatted for A4 paper.
- [ ] "Print" button on collection detail page.
- [ ] PDF generates in < 1 second.
- [ ] Non-existent collection returns 404.
- [ ] Arabic text renders correctly.

---

## 4. Customer Statement

### Goal
Generate a comprehensive account statement for a specific customer, showing all transactions, promises, and follow-ups within a date range.

### API

```
GET /customers/:id/statement
Query params: from, to
Authorization: Bearer <token>

Response:
{
  "customer": { "id", "name", "phone", "accountRef" },
  "summary": {
    "openingBalance": 5000,
    "totalCollected": 2000,
    "totalPromised": 1500,
    "closingBalance": 3000,
    "collectionCount": 4,
    "promiseCount": 3,
    "followupCount": 2
  },
  "transactions": [
    { "date", "type": "collection"|"promise"|"followup", "description", "amount", "balance" }
  ]
}
```

### Backend

| File | Change |
|------|--------|
| `customers.controller.ts` | Add `GET /:id/statement` endpoint |
| `customers.service.ts` | Add `getStatement(id, query)` method |
| `customers/dto/statement.dto.ts` | `StatementQueryDto` with from/to |

**Implementation:**
- Fetch customer by ID.
- Query collections within date range (ordered by `collected_at`).
- Query payment promises within date range (ordered by `promise_date`).
- Query followups within date range (ordered by `followup_at`).
- Merge into unified transaction list, sorted by date.
- Compute running balance: `openingBalance - cumulative collections`.
- Opening balance: `SUM(accounting_balance) + SUM(collected)` at start of range.
- Return structured JSON with summary + transactions.
- Additional endpoint: `GET /customers/:id/statement.pdf` for PDF version.

### Frontend

| File | Change |
|------|--------|
| `customers/[id]/page.tsx` | Add "كشف حساب" button |
| `customers/[id]/statement/page.tsx` | Statement page |
| `components/statement-table.tsx` | Transaction table component |

**Implementation:**
- New page: `/customers/:id/statement` with date range picker.
- Summary cards: opening balance, collected, promised, closing balance.
- Transaction table: date, type icon, description, amount, running balance.
- Type icons: collection (green), promise (blue), followup (gray).
- Export buttons (Excel, PDF) reuse M8 export infrastructure.
- Print-friendly layout option.

### Database
- Query existing tables: `collections`, `payment_promises`, `followups`.
- `customer_balances` for opening/closing balance calculation.
- No schema changes needed.

### Risks
- Opening balance calculation may be complex if range starts mid-month.
- Large transaction histories (> 1000) need pagination.
- Running balance calculation requires ordered processing — ensure correct sort.
- Currency handling: customer may have multi-currency transactions.

### Test Plan
- Statement for customer with collections, promises, and followups → all appear.
- Date range filters correctly → only transactions in range shown.
- Opening balance matches expected value.
- Closing balance = opening - collected.
- Running balance is correct at each row.
- Empty range → summary only, no transactions.
- PDF export of statement → correct layout.
- Excel export of statement → correct columns.
- Non-existent customer → 404.

### Acceptance Criteria
- [ ] `GET /customers/:id/statement` returns customer summary + transactions.
- [ ] Date range filter (from/to) works correctly.
- [ ] Opening and closing balances calculated correctly.
- [ ] Running balance shown for each transaction.
- [ ] Transaction types: collection, promise, followup — each with icon/color.
- [ ] Sorted chronologically (newest first or oldest first, user choice).
- [ ] Export to Excel and PDF from statement page.
- [ ] Print-friendly layout.
- [ ] Handles customers with no transactions gracefully.
- [ ] Non-existent customer returns 404.

---

## Implementation Order

| Phase | Feature | Est. Days | Dependencies |
|-------|---------|-----------|--------------|
| 1 | Excel Export | 2 | `exceljs` library |
| 2 | PDF Export | 3 | Puppeteer setup in Docker |
| 3 | Receipt Printing | 2 | PDF infrastructure from Phase 2 |
| 4 | Customer Statement | 3 | Export infrastructure from Phase 1-2 |

**Total estimated effort:** ~10 days

---

## Shared Infrastructure

| Component | Purpose |
|-----------|---------|
| `POST /reports/export` | Unified export endpoint (xlsx/pdf) |
| `lib/api.ts::downloadBlob()` | Frontend download helper |
| `reports/pdf.template.ts` | Shared PDF HTML template base |
| `reports/pdf-renderer.ts` | Puppeteer PDF generation wrapper |
| Docker: Puppeteer | Headless Chrome for PDF generation |
| Arabic font (Noto Sans Arabic) | PDF/Receipt Arabic text rendering |
