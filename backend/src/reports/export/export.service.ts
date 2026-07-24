import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ExportExecutiveDto,
  ExportAgingDto,
  ExportAgingDetailDto,
  ExportCollectorsDto,
  MAX_EXPORT_ROWS,
} from '../dto/export.dto';
import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;

function toNum(v: Decimal | bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return Number(v);
}

function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endExclusive(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const CURRENCY_FMT = '#,##0.00';
const PCT_FMT = '0.0%';

interface SheetData {
  name: string;
  headers: string[];
  columnFormats: ('text' | 'currency' | 'percent' | 'integer' | 'date')[];
  rows: unknown[][];
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ======================== VALIDATION ======================== */

  private static readonly DTO_MAP: Record<string, new () => object> = {
    executive: ExportExecutiveDto,
    aging: ExportAgingDto,
    'aging-detail': ExportAgingDetailDto,
    collectors: ExportCollectorsDto,
  };

  async validateExportBody(body: Record<string, unknown>): Promise<
    ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto
  > {
    if (!body || typeof body.report !== 'string') {
      throw new BadRequestException('حقل report مطلوب');
    }
    if (!body.format || body.format !== 'xlsx') {
      throw new BadRequestException('حقل format يجب أن يكون xlsx');
    }

    const DtoClass = ExportService.DTO_MAP[body.report];
    if (!DtoClass) {
      throw new BadRequestException(
        `نوع التقرير "${body.report}" غير مدعوم. الأنواع المدعومة: ${Object.keys(ExportService.DTO_MAP).join(', ')}`,
      );
    }

    const dto = plainToInstance(DtoClass, body, { excludeExtraneousValues: false });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(
        messages.length > 0 ? messages.join('، ') : 'البيانات غير صحيحة',
      );
    }

    return dto as ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto;
  }

  /* ======================== MAIN EXPORT ENTRY ======================== */

  async exportToExcel(
    user: AuthUser,
    body: Record<string, unknown>,
    res: Response,
  ): Promise<void> {
    const dto = await this.validateExportBody(body);
    const data = await this.fetchReportData(user, dto);

    /* ---- Fix 2: count total rows across ALL sheets, enforce limit ---- */
    const totalRows = data.sheets.reduce((sum, s) => sum + s.rows.length, 0);
    if (totalRows > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `التصدير محدود بـ 50,000 صف. تم العثور على ${totalRows.toLocaleString('ar')} صف. استخدم الفلاتر لتضييق النطاق.`,
      );
    }

    /* ---- Build Excel workbook (50k row cap keeps memory bounded) ---- */
    const fileName = this.fileNameFor(dto);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'البناء الراقي';
    wb.created = new Date();

    for (const sheet of data.sheets) {
      const ws = wb.addWorksheet(sheet.name);
      ws.views = [{ rightToLeft: true }];

      /* Headers */
      const headerRow = ws.addRow(sheet.headers);
      headerRow.font = { bold: true, size: 11, name: 'Arial' };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: 'FF227850' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
      });

      /* Data rows */
      for (const row of data.rows) {
        if (row._sheet !== sheet.name) continue;
        const values = row._values as unknown[];
        const excelRow = ws.addRow(values);

        for (let ci = 0; ci < values.length; ci++) {
          const cell = excelRow.getCell(ci + 1);
          const fmt = sheet.columnFormats[ci];
          if (fmt === 'currency') {
            cell.numFmt = CURRENCY_FMT;
          } else if (fmt === 'percent') {
            cell.numFmt = PCT_FMT;
          } else if (fmt === 'integer') {
            cell.numFmt = '0';
          } else if (fmt === 'date') {
            cell.numFmt = 'YYYY-MM-DD';
          }
        }
      }

      /* Auto-width */
      const colWidths = this.computeColumnWidths(sheet);
      colWidths.forEach((w, i) => {
        ws.getColumn(i + 1)!.width = w;
      });
    }

    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(buffer);
  }

  /* ======================== ROW COUNT (pre-check) ======================== */

  async countExportRows(
    user: AuthUser,
    dto: ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto,
  ): Promise<number> {
    const data = await this.fetchReportData(user, dto);
    return data.sheets.reduce((sum, s) => sum + s.rows.length, 0);
  }

  /* ======================== ROUTING ======================== */

  private async fetchReportData(
    user: AuthUser,
    dto: ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto,
  ): Promise<{ sheets: SheetData[]; rows: { _sheet: string; _values: unknown[] }[] }> {
    switch (dto.report) {
      case 'executive':
        return this.fetchExecutiveData(user, dto);
      case 'aging':
        return this.fetchAgingData(user, dto);
      case 'aging-detail':
        return this.fetchAgingDetailData(user, dto);
      case 'collectors':
        return this.fetchCollectorsData(user, dto);
      default:
        throw new BadRequestException('نوع التقرير غير مدعوم');
    }
  }

  /* ======================== EXECUTIVE (Fix 4: ALL filters on ALL sheets) ======================== */

  private async fetchExecutiveData(
    user: AuthUser,
    dto: ExportExecutiveDto,
  ): Promise<{ sheets: SheetData[]; rows: { _sheet: string; _values: unknown[] }[] }> {
    const orgId = user.organizationId;
    const startDate = dto.from ? startOfDay(dto.from) : undefined;
    const endDate = dto.to ? endExclusive(dto.to) : undefined;

    const orgFilter = Prisma.sql`cust.organization_id = CAST(${orgId} AS uuid)`;
    const orgFilterCust = Prisma.sql`cust.organization_id = CAST(${orgId} AS uuid)`;
    const orgFilterFollowup = Prisma.sql`c.organization_id = CAST(${orgId} AS uuid)`;

    const branchFilter = dto.branchId
      ? Prisma.sql`AND cust.branch_id = CAST(${dto.branchId} AS uuid)`
      : Prisma.empty;
    const branchFilterCb = dto.branchId
      ? Prisma.sql`AND cust.branch_id = CAST(${dto.branchId} AS uuid)`
      : Prisma.empty;
    const dateFrom = startDate
      ? Prisma.sql`AND c.collected_at >= ${startDate}`
      : Prisma.empty;
    const dateTo = endDate
      ? Prisma.sql`AND c.collected_at < ${endDate}`
      : Prisma.empty;
    const statusFilter = dto.customerStatus && dto.customerStatus !== 'all'
      ? Prisma.sql`AND cust.status = ${dto.customerStatus}`
      : Prisma.empty;
    const statusFilterCb = dto.customerStatus && dto.customerStatus !== 'all'
      ? Prisma.sql`AND cust.status = ${dto.customerStatus}`
      : Prisma.empty;

    const [debtByCurrency, collectionsByMonth, collectionsByMethod, promises, followups, unfollowed] =
      await Promise.all([
        /* debtByCurrency: org + branch + customerStatus */
        this.prisma.$queryRaw<Array<{ currency_code: string; total: Decimal }>>`
          SELECT cb.currency_code,
                 COALESCE(SUM(CASE WHEN cb.accounting_balance > 0 THEN cb.accounting_balance ELSE 0 END), 0) AS total
            FROM customer_balances cb
            JOIN customers cust ON cust.id = cb.customer_id
           WHERE ${orgFilter}
             ${branchFilterCb}
             ${statusFilterCb}
           GROUP BY cb.currency_code
           ORDER BY cb.currency_code
        `,
        /* collectionsByMonth: org + branch + customerStatus + date */
        this.prisma.$queryRaw<Array<{ period: string; total: Decimal }>>`
          SELECT TO_CHAR(DATE_TRUNC('month', c.collected_at), 'YYYY-MM') AS period,
                 COALESCE(SUM(c.amount), 0) AS total
            FROM collections c
            JOIN customers cust ON cust.id = c.customer_id
           WHERE ${orgFilter}
             AND c.status <> 'reversed'
             ${branchFilter}
             ${statusFilter}
             ${dateFrom}
             ${dateTo}
           GROUP BY 1 ORDER BY 1
        `,
        /* collectionsByMethod: org + branch + customerStatus + date */
        this.prisma.$queryRaw<Array<{ method: string; total: Decimal; count: bigint }>>`
          SELECT cm.name AS method, COALESCE(SUM(c.amount), 0) AS total, COUNT(*) AS count
            FROM collections c
            JOIN customers cust ON cust.id = c.customer_id
            JOIN collection_methods cm ON cm.id = c.method_id
           WHERE ${orgFilter}
             AND c.status <> 'reversed'
             ${branchFilter}
             ${statusFilter}
             ${dateFrom}
             ${dateTo}
           GROUP BY cm.name ORDER BY total DESC
        `,
        /* promises: org + branch + customerStatus + date */
        this.prisma.$queryRaw<Array<{ status: string; count: bigint; total: Decimal }>>`
          SELECT p.status, COUNT(*) AS count, COALESCE(SUM(p.expected_amount), 0) AS total
            FROM payment_promises p
            JOIN customers cust ON cust.id = p.customer_id
           WHERE ${orgFilterCust}
             ${dto.branchId ? Prisma.sql`AND cust.branch_id = CAST(${dto.branchId} AS uuid)` : Prisma.empty}
             ${dto.customerStatus && dto.customerStatus !== 'all' ? Prisma.sql`AND cust.status = ${dto.customerStatus}` : Prisma.empty}
             ${startDate ? Prisma.sql`AND p.promise_date >= ${startDate}` : Prisma.empty}
             ${endDate ? Prisma.sql`AND p.promise_date < ${endDate}` : Prisma.empty}
           GROUP BY p.status ORDER BY count DESC
        `,
        /* followups: org + branch + customerStatus + date */
        this.prisma.$queryRaw<Array<{ type_ar: string; count: bigint }>>`
          SELECT ft.name AS type_ar, COUNT(*) AS count
            FROM followups f
            JOIN customers c ON c.id = f.customer_id
            JOIN followup_types ft ON ft.id = f.type_id
           WHERE f.deleted_at IS NULL
             AND ${orgFilterFollowup}
             ${dto.branchId ? Prisma.sql`AND c.branch_id = CAST(${dto.branchId} AS uuid)` : Prisma.empty}
             ${dto.customerStatus && dto.customerStatus !== 'all' ? Prisma.sql`AND c.status = ${dto.customerStatus}` : Prisma.empty}
             ${startDate ? Prisma.sql`AND f.followup_at >= ${startDate}` : Prisma.empty}
             ${endDate ? Prisma.sql`AND f.followup_at < ${endDate}` : Prisma.empty}
           GROUP BY ft.name ORDER BY count DESC
        `,
        /* unfollowed: org + branch + customerStatus + date */
        this.prisma.$queryRaw<Array<{ name: string; code: string }>>`
          SELECT c.name, c.external_customer_code AS code
            FROM customers c
           WHERE ${orgFilterFollowup}
             AND c.status = 'active'
             ${dto.branchId ? Prisma.sql`AND c.branch_id = CAST(${dto.branchId} AS uuid)` : Prisma.empty}
             ${dto.customerStatus && dto.customerStatus !== 'all' ? Prisma.sql`AND c.status = ${dto.customerStatus}` : Prisma.empty}
             AND NOT EXISTS (
               SELECT 1 FROM followups f
                WHERE f.customer_id = c.id AND f.deleted_at IS NULL
                  ${startDate ? Prisma.sql`AND f.followup_at >= ${startDate}` : Prisma.empty}
                  ${endDate ? Prisma.sql`AND f.followup_at < ${endDate}` : Prisma.empty}
             )
           ORDER BY c.name LIMIT 1000
        `,
      ]);

    const sheets: SheetData[] = [
      {
        name: 'ملخص المديونية',
        headers: ['العملة', 'الإجمالي'],
        columnFormats: ['text', 'currency'],
        rows: debtByCurrency.map((r) => [r.currency_code, toNum(r.total)]),
      },
      {
        name: 'التحصيل الشهري',
        headers: ['الفترة', 'الإجمالي'],
        columnFormats: ['text', 'currency'],
        rows: collectionsByMonth.map((r) => [r.period, toNum(r.total)]),
      },
      {
        name: 'التحصيل حسب الطريقة',
        headers: ['الطريقة', 'الإجمالي', 'العدد'],
        columnFormats: ['text', 'currency', 'integer'],
        rows: collectionsByMethod.map((r) => [r.method, toNum(r.total), Number(r.count)]),
      },
      {
        name: 'الوعود حسب الحالة',
        headers: ['الحالة', 'العدد', 'الإجمالي'],
        columnFormats: ['text', 'integer', 'currency'],
        rows: promises.map((r) => [r.status, Number(r.count), toNum(r.total)]),
      },
      {
        name: 'المتابعات حسب النوع',
        headers: ['النوع', 'العدد'],
        columnFormats: ['text', 'integer'],
        rows: followups.map((r) => [r.type_ar, Number(r.count)]),
      },
      {
        name: 'عملاء بدون متابعة',
        headers: ['الاسم', 'الكود'],
        columnFormats: ['text', 'text'],
        rows: unfollowed.map((r) => [r.name, r.code]),
      },
    ];

    return this.buildResult(sheets);
  }

  /* ======================== AGING ======================== */

  private async fetchAgingData(
    user: AuthUser,
    dto: ExportAgingDto,
  ): Promise<{ sheets: SheetData[]; rows: { _sheet: string; _values: unknown[] }[] }> {
    const orgId = user.organizationId;
    const currency = dto.currency ?? 'USD';

    const bf: Prisma.Sql[] = [];
    if (dto.branchId) bf.push(Prisma.sql`AND c.branch_id = CAST(${dto.branchId} AS uuid)`);
    if (dto.customerStatus && dto.customerStatus !== 'all')
      bf.push(Prisma.sql`AND c.status = ${dto.customerStatus}`);

    const buckets = await this.prisma.$queryRaw<Array<{ bucket: string; total: Decimal; customer_count: bigint }>>`
      WITH balances AS (
        SELECT c.id, cb.accounting_balance,
               COALESCE(
                 (SELECT MIN(tx.tx_date) FROM imported_transactions tx WHERE tx.customer_id = c.id AND tx.currency_code = cb.currency_code),
                 c.created_at
               ) AS first_tx
          FROM customer_balances cb
          JOIN customers c ON c.id = cb.customer_id
         WHERE c.organization_id = CAST(${orgId} AS uuid)
           AND cb.currency_code = ${currency}
           ${bf.length > 0 ? Prisma.join(bf) : Prisma.empty}
      )
      SELECT CASE
               WHEN accounting_balance <= 0 THEN 'settled'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '30 days') THEN '1-30'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '60 days') THEN '31-60'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '90 days') THEN '61-90'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '180 days') THEN '91-180'
               ELSE '180+'
             END AS bucket,
             SUM(accounting_balance) AS total,
             COUNT(DISTINCT id) AS customer_count
        FROM balances
       WHERE accounting_balance > 0
       GROUP BY bucket
    `;

    const bucketLabels: Record<string, string> = {
      settled: 'غير مستحق', '1-30': '1-30 يومًا', '31-60': '31-60 يومًا',
      '61-90': '61-90 يومًا', '91-180': '91-180 يومًا', '180+': 'أكثر من 180 يومًا',
    };

    const sheet: SheetData = {
      name: `أعمار الديون (${currency})`,
      headers: ['الفئة', 'الإجمالي', 'عدد العملاء'],
      columnFormats: ['text', 'currency', 'integer'],
      rows: buckets.map((r) => [
        bucketLabels[r.bucket] ?? r.bucket,
        toNum(r.total),
        Number(r.customer_count),
      ]),
    };

    return this.buildResult([sheet]);
  }

  /* ======================== AGING DETAIL (Fix 6: COUNT first, no LIMIT) ======================== */

  private async fetchAgingDetailData(
    user: AuthUser,
    dto: ExportAgingDetailDto,
  ): Promise<{ sheets: SheetData[]; rows: { _sheet: string; _values: unknown[] }[] }> {
    const orgId = user.organizationId;
    const currency = dto.currency;

    const cw: Prisma.Sql[] = [
      Prisma.sql`AND c.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (dto.branchId) cw.push(Prisma.sql`AND c.branch_id = CAST(${dto.branchId} AS uuid)`);
    if (dto.customerStatus && dto.customerStatus !== 'all')
      cw.push(Prisma.sql`AND c.status = ${dto.customerStatus}`);
    if (currency) cw.push(Prisma.sql`AND cb.currency_code = ${currency}`);
    if (dto.collectorId) cw.push(Prisma.sql`AND ca.collector_id = CAST(${dto.collectorId} AS uuid)`);

    const bucketColMap: Record<string, string> = {
      current: 'bucket_current', '1-30': 'bucket_1_30',
      '31-60': 'bucket_31_60', '61-90': 'bucket_61_90', '90+': 'bucket_90_plus',
    };
    const bucketFilter = dto.bucket
      ? Prisma.sql`AND ${Prisma.raw(bucketColMap[dto.bucket] ?? '1=0')} > 0`
      : Prisma.empty;

    const baseQuery = Prisma.sql`
      WITH per_customer AS (
        SELECT c.id AS customer_id, c.name AS customer_name,
               c.external_customer_code AS customer_code,
               b.name AS branch_name, u.full_name AS collector_name,
               cb.currency_code, cb.accounting_balance,
               COALESCE(
                 (SELECT MIN(tx.tx_date) FROM imported_transactions tx WHERE tx.customer_id = c.id AND tx.currency_code = cb.currency_code),
                 c.created_at::date
               ) AS first_tx
          FROM customer_balances cb
          JOIN customers c ON c.id = cb.customer_id
          LEFT JOIN branches b ON b.id = c.branch_id
          LEFT JOIN customer_assignments ca ON ca.customer_id = c.id AND ca.effective_to IS NULL
          LEFT JOIN collectors col ON col.id = ca.collector_id
          LEFT JOIN users u ON u.id = col.user_id
         WHERE cb.accounting_balance > 0
           ${Prisma.join(cw)}
      ),
      bucketed AS (
        SELECT *,
               CASE
                 WHEN GREATEST(0, CURRENT_DATE - first_tx) = 0 THEN 'current'
                 WHEN GREATEST(0, CURRENT_DATE - first_tx) <= 30 THEN '1-30'
                 WHEN GREATEST(0, CURRENT_DATE - first_tx) <= 60 THEN '31-60'
                 WHEN GREATEST(0, CURRENT_DATE - first_tx) <= 90 THEN '61-90'
                 ELSE '90+'
               END AS bucket_assign,
               GREATEST(0, CURRENT_DATE - first_tx) AS days_overdue
          FROM per_customer
      ),
      aggregated AS (
        SELECT customer_id, customer_name, customer_code, branch_name,
               collector_name, currency_code,
               SUM(accounting_balance) AS total_balance,
               MAX(first_tx) AS first_tx,
               MAX(days_overdue) AS days_overdue,
               SUM(CASE WHEN bucket_assign = 'current' THEN accounting_balance ELSE 0 END) AS bucket_current,
               SUM(CASE WHEN bucket_assign = '1-30' THEN accounting_balance ELSE 0 END) AS bucket_1_30,
               SUM(CASE WHEN bucket_assign = '31-60' THEN accounting_balance ELSE 0 END) AS bucket_31_60,
               SUM(CASE WHEN bucket_assign = '61-90' THEN accounting_balance ELSE 0 END) AS bucket_61_90,
               SUM(CASE WHEN bucket_assign = '90+' THEN accounting_balance ELSE 0 END) AS bucket_90_plus
          FROM bucketed
         GROUP BY customer_id, customer_name, customer_code, branch_name,
                  collector_name, currency_code
         HAVING SUM(accounting_balance) > 0
      )
      SELECT * FROM aggregated WHERE 1=1 ${bucketFilter}
      ORDER BY total_balance DESC
    `;

    /* Fix 6: COUNT query first to enforce MAX_EXPORT_ROWS */
    const [countResult] = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM (${baseQuery}) _cnt`,
    );
    const totalRows = Number(countResult?.count ?? 0);
    if (totalRows > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `التصدير محدود بـ 50,000 صف. تم العثور على ${totalRows.toLocaleString('ar')} صف. استخدم الفلاتر لتضييق النطاق.`,
      );
    }

    const items = await this.prisma.$queryRaw<Array<{
      customer_name: string; customer_code: string; branch_name: string | null;
      collector_name: string | null; currency_code: string; total_balance: Decimal;
      first_tx: Date; days_overdue: bigint;
      bucket_current: Decimal; bucket_1_30: Decimal; bucket_31_60: Decimal;
      bucket_61_90: Decimal; bucket_90_plus: Decimal;
    }>>(baseQuery);

    const sheet: SheetData = {
      name: 'تفصيل أعمار الديون',
      headers: [
        'اسم العميل', 'كود العميل', 'الفرع', 'المحصل', 'العملة',
        'الرصيد الكلي', 'الحالي', '1-30', '31-60', '61-90', '90+',
        'تاريخ أقدم دين', 'أيام التأخر',
      ],
      columnFormats: [
        'text', 'text', 'text', 'text', 'text',
        'currency', 'currency', 'currency', 'currency', 'currency', 'currency',
        'date', 'integer',
      ],
      rows: items.map((r) => [
        r.customer_name, r.customer_code, r.branch_name ?? 'غير محدد',
        r.collector_name ?? 'غير محدد', r.currency_code,
        toNum(r.total_balance), toNum(r.bucket_current), toNum(r.bucket_1_30),
        toNum(r.bucket_31_60), toNum(r.bucket_61_90), toNum(r.bucket_90_plus),
        r.first_tx ? new Date(r.first_tx).toISOString().slice(0, 10) : '',
        Number(r.days_overdue),
      ]),
    };

    return this.buildResult([sheet]);
  }

  /* ======================== COLLECTORS (Fix 5: date boundaries) ======================== */

  private async fetchCollectorsData(
    user: AuthUser,
    dto: ExportCollectorsDto,
  ): Promise<{ sheets: SheetData[]; rows: { _sheet: string; _values: unknown[] }[] }> {
    const orgId = user.organizationId;
    const toRaw = dto.to ?? new Date().toISOString().slice(0, 10);
    const fromRaw = dto.from ?? new Date(new Date(toRaw).getFullYear(), new Date(toRaw).getMonth() - 2, 1).toISOString().slice(0, 10);
    const startDate = startOfDay(fromRaw);
    const endExcl = endExclusive(toRaw);
    const endDateInclusive = new Date(endExcl.getTime() - 86400000);
    const weekStart = (() => {
      const d = new Date(); const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff);
    })();
    const todayEnd = new Date(); todayEnd.setHours(0, 0, 0, 0); todayEnd.setDate(todayEnd.getDate() + 1);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

    const cw: Prisma.Sql[] = [
      Prisma.sql`AND u.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (dto.collectorStatus === 'active') cw.push(Prisma.sql`AND col.active = true`);
    else if (dto.collectorStatus === 'inactive') cw.push(Prisma.sql`AND col.active = false`);
    if (dto.branchId) cw.push(Prisma.sql`AND col.branch_id = CAST(${dto.branchId} AS uuid)`);
    if (dto.collectorId) cw.push(Prisma.sql`AND col.id = CAST(${dto.collectorId} AS uuid)`);

    const baseQuery = Prisma.sql`
      WITH collector_stats AS (
        SELECT col.id AS collector_id, u.full_name AS collector,
               COUNT(DISTINCT ca.customer_id) AS customer_count
          FROM collectors col
          JOIN users u ON u.id = col.user_id
          LEFT JOIN customer_assignments ca ON ca.collector_id = col.id AND ca.effective_to IS NULL
         WHERE 1=1 ${Prisma.join(cw)}
         GROUP BY col.id, u.full_name
      ),
      collection_stats AS (
        SELECT c.collector_id,
               COALESCE(SUM(CASE WHEN c.collected_at >= GREATEST(CURRENT_DATE, ${startDate}) AND c.collected_at < LEAST(${todayEnd}, ${endExcl}) THEN c.amount ELSE 0 END), 0) AS today_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= GREATEST(${weekStart}, ${startDate}) AND c.collected_at < LEAST(${weekEnd}, ${endExcl}) THEN c.amount ELSE 0 END), 0) AS week_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= ${startDate} AND c.collected_at < ${endExcl} THEN c.amount ELSE 0 END), 0) AS month_collected,
               COUNT(*) FILTER (WHERE c.collected_at >= ${startDate} AND c.collected_at < ${endExcl}) AS collections_count
          FROM collections c
          JOIN customers cust ON cust.id = c.customer_id
         WHERE cust.organization_id = CAST(${orgId} AS uuid)
           AND c.status <> 'reversed'
           AND c.collected_at < ${endExcl}
         GROUP BY c.collector_id
      ),
      promise_stats AS (
        SELECT p.collector_id,
               COUNT(*) AS promise_count,
               COUNT(*) FILTER (WHERE p.status = 'fulfilled') AS fulfilled_count
          FROM payment_promises p
          JOIN customers cust ON cust.id = p.customer_id
         WHERE cust.organization_id = CAST(${orgId} AS uuid)
           AND p.promise_date >= ${startDate} AND p.promise_date <= ${endDateInclusive}
         GROUP BY p.collector_id
      ),
      balance_stats AS (
        SELECT ca.collector_id,
               COALESCE(SUM(cb.accounting_balance), 0) AS outstanding_balance
          FROM customer_assignments ca
          JOIN customer_balances cb ON cb.customer_id = ca.customer_id AND cb.accounting_balance > 0
         WHERE ca.effective_to IS NULL
         GROUP BY ca.collector_id
      ),
      base AS (
        SELECT cs.collector_id, cs.collector, cs.customer_count,
               COALESCE(cst.today_collected, 0) AS today_collected,
               COALESCE(cst.week_collected, 0) AS week_collected,
               COALESCE(cst.month_collected, 0) AS month_collected,
               COALESCE(cst.collections_count, 0) AS collections_count,
               COALESCE(ps.promise_count, 0) AS promise_count,
               COALESCE(ps.fulfilled_count, 0) AS fulfilled_count,
               COALESCE(bs.outstanding_balance, 0) AS outstanding_balance,
               CASE WHEN COALESCE(ps.promise_count, 0) > 0
                  THEN (COALESCE(ps.fulfilled_count, 0)::numeric / ps.promise_count)
                  ELSE 0 END AS fulfillment_rate,
               CASE WHEN COALESCE(cst.month_collected, 0) + COALESCE(bs.outstanding_balance, 0) > 0
                  THEN (COALESCE(cst.month_collected, 0)::numeric /
                        NULLIF(COALESCE(cst.month_collected, 0) + COALESCE(bs.outstanding_balance, 0), 0))
                  ELSE 0 END AS collection_rate
          FROM collector_stats cs
          LEFT JOIN collection_stats cst ON cst.collector_id = cs.collector_id
          LEFT JOIN promise_stats ps ON ps.collector_id = cs.collector_id
          LEFT JOIN balance_stats bs ON bs.collector_id = cs.collector_id
      )
      SELECT * FROM base
      ORDER BY month_collected DESC, fulfillment_rate DESC, collector ASC
    `;

    const items = await this.prisma.$queryRaw<Array<{
      collector: string; customer_count: bigint;
      today_collected: Decimal; week_collected: Decimal; month_collected: Decimal;
      collections_count: bigint; promise_count: bigint; fulfilled_count: bigint;
      outstanding_balance: Decimal; fulfillment_rate: number; collection_rate: number;
    }>>(baseQuery);

    const sheet: SheetData = {
      name: 'أداء المحصلين',
      headers: [
        'المحصل', 'العملاء', 'اليوم', 'الأسبوع', 'الشهر',
        'عدد التحصيلات', 'الرصيد المتبقي', 'نسبة الوفاء', 'نسبة التحصيل',
      ],
      columnFormats: [
        'text', 'integer', 'currency', 'currency', 'currency',
        'integer', 'currency', 'percent', 'percent',
      ],
      rows: items.map((r) => [
        r.collector,
        Number(r.customer_count),
        toNum(r.today_collected),
        toNum(r.week_collected),
        toNum(r.month_collected),
        Number(r.collections_count),
        toNum(r.outstanding_balance),
        Number(r.fulfillment_rate ?? 0),
        Number(r.collection_rate ?? 0),
      ]),
    };

    return this.buildResult([sheet]);
  }

  /* ======================== HELPERS ======================== */

  private buildResult(sheets: SheetData[]): { sheets: SheetData[]; rows: { _sheet: string; _values: unknown[] }[] } {
    const rows: { _sheet: string; _values: unknown[] }[] = [];
    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        rows.push({ _sheet: sheet.name, _values: row });
      }
    }
    return { sheets, rows };
  }

  private computeColumnWidths(sheet: SheetData): number[] {
    const widths: number[] = [];
    for (let ci = 0; ci < sheet.headers.length; ci++) {
      let maxLen = sheet.headers[ci].length * 1.5;
      for (const row of sheet.rows) {
        const val = row[ci];
        const len = (val?.toString() ?? '').length * 1.5;
        maxLen = Math.max(maxLen, len);
      }
      widths.push(Math.min(maxLen + 2, 50));
    }
    return widths;
  }

  private fileNameFor(
    dto: ExportExecutiveDto | ExportAgingDto | ExportAgingDetailDto | ExportCollectorsDto,
  ): string {
    const names: Record<string, string> = {
      executive: 'التقارير_التنفيذية',
      aging: 'أعمار_الديون',
      'aging-detail': 'تفصيل_أعمار_الديون',
      collectors: 'أداء_المحصلين',
    };
    return `${names[dto.report] ?? dto.report}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  }
}
