import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ExportDto,
  ExportExecutiveDto,
  ExportAgingDto,
  ExportAgingDetailDto,
  ExportCollectorsDto,
  MAX_EXPORT_ROWS,
  STREAMING_THRESHOLD,
  ExportReportType,
} from '../dto/export.dto';
import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;

function toNum(v: Decimal | bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return Number(v);
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportToExcel(
    user: AuthUser,
    dto: ExportDto,
    res: Response,
  ): Promise<void> {
    const { report, format } = dto;
    if (format !== 'xlsx') {
      throw new BadRequestException('هذه الدالة تدعم تصدير Excel فقط');
    }

    const data = await this.fetchReportData(user, dto);
    if (data.rows.length > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `التصدير محدود بـ ${MAX_EXPORT_ROWS.toLocaleString('ar')} صف. استخدم الفلاتر لتضييق النطاق.`,
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'البناء الراقي';
    wb.created = new Date();

    for (const sheet of data.sheets) {
      const ws = wb.addWorksheet(sheet.name);
      ws.views = [{ rightToLeft: true }];

      const headerRow = ws.addRow(sheet.headers);
      headerRow.font = { bold: true, size: 11, name: 'Arial' };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF227850' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
      });

      sheet.rows.forEach((row) => ws.addRow(row));

      ws.columns?.forEach((col) => {
        if (!col || !col.eachCell) return;
        let maxLen = 10;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const val = cell.value?.toString() ?? '';
          const arLen = val.length * 1.5;
          maxLen = Math.max(maxLen, Math.min(arLen, 50));
        });
        col.width = maxLen + 2;
      });

      if (sheet.rows.length <= STREAMING_THRESHOLD) {
        // In-memory is fine (already added)
      } else {
        this.logger.log(
          `Streaming mode for sheet "${sheet.name}" (${sheet.rows.length} rows)`,
        );
      }
    }

    const reportNames: Record<ExportReportType, string> = {
      executive: 'التقارير_التنفيذية',
      aging: 'أعمار_الديون',
      'aging-detail': 'تفصيل_أعمار_الديون',
      collectors: 'أداء_المحصلين',
    };

    const buffer = await wb.xlsx.writeBuffer();
    const nodeBuffer = Buffer.from(buffer);

    const fileName = `${reportNames[report] ?? report}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Content-Length', nodeBuffer.length);
    res.send(nodeBuffer);
  }

  private async fetchReportData(
    user: AuthUser,
    dto: ExportDto,
  ): Promise<{ sheets: SheetData[]; rows: unknown[] }> {
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

  private async fetchExecutiveData(
    user: AuthUser,
    dto: ExportExecutiveDto,
  ): Promise<{ sheets: SheetData[]; rows: unknown[] }> {
    const orgId = user.organizationId;
    const from = dto.from ? new Date(dto.from) : undefined;
    const to = dto.to ? new Date(dto.to) : undefined;

    const where: Prisma.Sql[] = [
      Prisma.sql`c.organization_id = CAST(${orgId} AS uuid)`,
      Prisma.sql`AND c.status <> 'reversed'`,
    ];
    if (dto.branchId)
      where.push(Prisma.sql`AND cust.branch_id = CAST(${dto.branchId} AS uuid)`);
    if (from) where.push(Prisma.sql`AND c.collected_at >= ${from}`);
    if (to) where.push(Prisma.sql`AND c.collected_at <= ${to}`);

    const [debtByCurrency, collectionsByMonth, collectionsByMethod, promises, followups, unfollowed] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ currency_code: string; total: Decimal }>>`
          SELECT cb.currency_code,
                 COALESCE(SUM(CASE WHEN cb.accounting_balance > 0 THEN cb.accounting_balance ELSE 0 END), 0) AS total
            FROM customer_balances cb
            JOIN customers cust ON cust.id = cb.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid)
           GROUP BY cb.currency_code
        `,
        this.prisma.$queryRaw<Array<{ period: string; total: Decimal }>>`
          SELECT TO_CHAR(DATE_TRUNC('month', c.collected_at), 'YYYY-MM') AS period,
                 COALESCE(SUM(c.amount), 0) AS total
            FROM collections c
            JOIN customers cust ON cust.id = c.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid) AND c.status <> 'reversed'
             ${dto.from ? Prisma.sql`AND c.collected_at >= ${new Date(dto.from)}` : Prisma.empty}
             ${dto.to ? Prisma.sql`AND c.collected_at <= ${new Date(dto.to)}` : Prisma.empty}
             ${dto.branchId ? Prisma.sql`AND cust.branch_id = CAST(${dto.branchId} AS uuid)` : Prisma.empty}
           GROUP BY 1 ORDER BY 1
        `,
        this.prisma.$queryRaw<Array<{ method: string; total: Decimal; count: bigint }>>`
          SELECT cm.name AS method, COALESCE(SUM(c.amount), 0) AS total, COUNT(*) AS count
            FROM collections c
            JOIN customers cust ON cust.id = c.customer_id
            JOIN collection_methods cm ON cm.id = c.method_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid) AND c.status <> 'reversed'
             ${dto.from ? Prisma.sql`AND c.collected_at >= ${new Date(dto.from)}` : Prisma.empty}
             ${dto.to ? Prisma.sql`AND c.collected_at <= ${new Date(dto.to)}` : Prisma.empty}
           GROUP BY cm.name ORDER BY total DESC
        `,
        this.prisma.$queryRaw<Array<{ status: string; count: bigint; total: Decimal }>>`
          SELECT p.status, COUNT(*) AS count, COALESCE(SUM(p.expected_amount), 0) AS total
            FROM payment_promises p
            JOIN customers cust ON cust.id = p.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid)
           GROUP BY p.status ORDER BY count DESC
        `,
        this.prisma.$queryRaw<Array<{ type_ar: string; count: bigint }>>`
          SELECT ft.name AS type_ar, COUNT(*) AS count
            FROM followups f
            JOIN customers c ON c.id = f.customer_id
            JOIN followup_types ft ON ft.id = f.type_id
           WHERE f.deleted_at IS NULL AND c.organization_id = CAST(${orgId} AS uuid)
           GROUP BY ft.name ORDER BY count DESC
        `,
        this.prisma.$queryRaw<Array<{ name: string; code: string }>>`
          SELECT c.name, c.external_customer_code AS code
            FROM customers c
           WHERE c.organization_id = CAST(${orgId} AS uuid)
             AND c.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM followups f WHERE f.customer_id = c.id AND f.deleted_at IS NULL
             )
           ORDER BY c.name LIMIT 100
        `,
      ]);

    const sheets: SheetData[] = [
      {
        name: 'ملخص المديونية',
        headers: ['العملة', 'الإجمالي'],
        rows: debtByCurrency.map((r) => [r.currency_code, toNum(r.total)]),
      },
      {
        name: 'التحصيل الشهري',
        headers: ['الفترة', 'الإجمالي'],
        rows: collectionsByMonth.map((r) => [r.period, toNum(r.total)]),
      },
      {
        name: 'التحصيل حسب الطريقة',
        headers: ['الطريقة', 'الإجمالي', 'العدد'],
        rows: collectionsByMethod.map((r) => [r.method, toNum(r.total), Number(r.count)]),
      },
      {
        name: 'الوعود حسب الحالة',
        headers: ['الحالة', 'العدد', 'الإجمالي'],
        rows: promises.map((r) => [r.status, Number(r.count), toNum(r.total)]),
      },
      {
        name: 'المتابعات حسب النوع',
        headers: ['النوع', 'العدد'],
        rows: followups.map((r) => [r.type_ar, Number(r.count)]),
      },
      {
        name: 'عملاء بدون متابعة',
        headers: ['الاسم', 'الكود'],
        rows: unfollowed.map((r) => [r.name, r.code]),
      },
    ];

    return { sheets, rows: [] };
  }

  private async fetchAgingData(
    user: AuthUser,
    dto: ExportAgingDto,
  ): Promise<{ sheets: SheetData[]; rows: unknown[] }> {
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
      settled: 'غير مستحق',
      '1-30': '1-30 يومًا',
      '31-60': '31-60 يومًا',
      '61-90': '61-90 يومًا',
      '91-180': '91-180 يومًا',
      '180+': 'أكثر من 180 يومًا',
    };

    const resultRows = buckets.map((r) => [
      bucketLabels[r.bucket] ?? r.bucket,
      toNum(r.total),
      Number(r.customer_count),
    ]);

    const sheets: SheetData[] = [
      {
        name: `أعمار الديون (${currency})`,
        headers: ['الفئة', 'الإجمالي', 'عدد العملاء'],
        rows: resultRows,
      },
    ];

    return { sheets, rows: resultRows };
  }

  private async fetchAgingDetailData(
    user: AuthUser,
    dto: ExportAgingDetailDto,
  ): Promise<{ sheets: SheetData[]; rows: unknown[] }> {
    const orgId = user.organizationId;
    const currency = dto.currency;

    const customerWhere: Prisma.Sql[] = [
      Prisma.sql`AND c.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (dto.branchId) customerWhere.push(Prisma.sql`AND c.branch_id = CAST(${dto.branchId} AS uuid)`);
    if (dto.customerStatus && dto.customerStatus !== 'all')
      customerWhere.push(Prisma.sql`AND c.status = ${dto.customerStatus}`);
    if (currency) customerWhere.push(Prisma.sql`AND cb.currency_code = ${currency}`);
    if (dto.collectorId)
      customerWhere.push(Prisma.sql`AND ca.collector_id = CAST(${dto.collectorId} AS uuid)`);

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
           ${Prisma.join(customerWhere)}
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
      SELECT * FROM aggregated
      ORDER BY total_balance DESC
      LIMIT ${dto.limit ?? 500}
    `;

    const items = await this.prisma.$queryRaw<Array<{
      customer_name: string; customer_code: string; branch_name: string | null;
      collector_name: string | null; currency_code: string; total_balance: Decimal;
      first_tx: Date; days_overdue: bigint;
      bucket_current: Decimal; bucket_1_30: Decimal; bucket_31_60: Decimal;
      bucket_61_90: Decimal; bucket_90_plus: Decimal;
    }>>(baseQuery);

    const resultRows = items.map((r) => [
      r.customer_name,
      r.customer_code,
      r.branch_name ?? 'غير محدد',
      r.collector_name ?? 'غير محدد',
      r.currency_code,
      toNum(r.total_balance),
      toNum(r.bucket_current),
      toNum(r.bucket_1_30),
      toNum(r.bucket_31_60),
      toNum(r.bucket_61_90),
      toNum(r.bucket_90_plus),
      r.first_tx ? new Date(r.first_tx).toISOString().slice(0, 10) : '',
      Number(r.days_overdue),
    ]);

    const sheets: SheetData[] = [
      {
        name: 'تفصيل أعمار الديون',
        headers: [
          'اسم العميل', 'كود العميل', 'الفرع', 'المحصل', 'العملة',
          'الرصيد الكلي', 'الحالي', '1-30', '31-60', '61-90', '90+',
          'تاريخ أقدم دين', 'أيام التأخر',
        ],
        rows: resultRows,
      },
    ];

    return { sheets, rows: resultRows };
  }

  private async fetchCollectorsData(
    user: AuthUser,
    dto: ExportCollectorsDto,
  ): Promise<{ sheets: SheetData[]; rows: unknown[] }> {
    const orgId = user.organizationId;
    const toRaw = dto.to ?? new Date().toISOString().slice(0, 10);
    const fromRaw = dto.from ?? new Date(new Date(toRaw).getFullYear(), new Date(toRaw).getMonth() - 2, 1).toISOString().slice(0, 10);
    const startDate = new Date(fromRaw);
    const endDateInclusive = new Date(toRaw);
    const endExclusive = new Date(toRaw);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    })();
    const todayEnd = new Date();
    todayEnd.setHours(0, 0, 0, 0);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const collectorWhere: Prisma.Sql[] = [
      Prisma.sql`AND u.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (dto.collectorStatus === 'active') collectorWhere.push(Prisma.sql`AND col.active = true`);
    else if (dto.collectorStatus === 'inactive') collectorWhere.push(Prisma.sql`AND col.active = false`);
    if (dto.branchId) collectorWhere.push(Prisma.sql`AND col.branch_id = CAST(${dto.branchId} AS uuid)`);
    if (dto.collectorId) collectorWhere.push(Prisma.sql`AND col.id = CAST(${dto.collectorId} AS uuid)`);

    const baseQuery = Prisma.sql`
      WITH collector_stats AS (
        SELECT col.id AS collector_id, u.full_name AS collector,
               COUNT(DISTINCT ca.customer_id) AS customer_count
          FROM collectors col
          JOIN users u ON u.id = col.user_id
          LEFT JOIN customer_assignments ca ON ca.collector_id = col.id AND ca.effective_to IS NULL
         WHERE 1=1 ${Prisma.join(collectorWhere)}
         GROUP BY col.id, u.full_name
      ),
      collection_stats AS (
        SELECT c.collector_id,
               COALESCE(SUM(CASE WHEN c.collected_at >= GREATEST(CURRENT_DATE, ${startDate}) AND c.collected_at < LEAST(${todayEnd}, ${endExclusive}) THEN c.amount ELSE 0 END), 0) AS today_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= GREATEST(${weekStart}, ${startDate}) AND c.collected_at < LEAST(${weekEnd}, ${endExclusive}) THEN c.amount ELSE 0 END), 0) AS week_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= ${startDate} AND c.collected_at < ${endExclusive} THEN c.amount ELSE 0 END), 0) AS month_collected,
               COUNT(*) FILTER (WHERE c.collected_at >= ${startDate} AND c.collected_at < ${endExclusive}) AS collections_count
          FROM collections c
          JOIN customers cust ON cust.id = c.customer_id
         WHERE cust.organization_id = CAST(${orgId} AS uuid)
           AND c.status <> 'reversed'
           AND c.collected_at < ${endExclusive}
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
                  THEN (COALESCE(ps.fulfilled_count, 0)::numeric / ps.promise_count * 100)
                  ELSE 0 END AS fulfillment_rate,
               CASE WHEN COALESCE(cst.month_collected, 0) + COALESCE(bs.outstanding_balance, 0) > 0
                  THEN (COALESCE(cst.month_collected, 0)::numeric /
                        NULLIF(COALESCE(cst.month_collected, 0) + COALESCE(bs.outstanding_balance, 0), 0) * 100)
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

    const resultRows = items.map((r) => [
      r.collector,
      Number(r.customer_count),
      toNum(r.today_collected),
      toNum(r.week_collected),
      toNum(r.month_collected),
      Number(r.collections_count),
      toNum(r.outstanding_balance),
      `${Number(r.fulfillment_rate ?? 0).toFixed(1)}%`,
      `${Number(r.collection_rate ?? 0).toFixed(1)}%`,
    ]);

    const sheets: SheetData[] = [
      {
        name: 'أداء المحصلين',
        headers: [
          'المحصل', 'العملاء', 'اليوم', 'الأسبوع', 'الشهر',
          'عدد التحصيلات', 'الرصيد المتبقي', 'نسبة الوفاء', 'نسبة التحصيل',
        ],
        rows: resultRows,
      },
    ];

    return { sheets, rows: resultRows };
  }
}

interface SheetData {
  name: string;
  headers: string[];
  rows: unknown[][];
}
