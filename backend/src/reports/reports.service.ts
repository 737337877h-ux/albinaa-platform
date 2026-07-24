import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgingDetailQueryDto,
  AgingQueryDto,
  CollectionsQueryDto,
  CollectorsPerformanceQueryDto,
  DebtByBranchQueryDto,
  ExportReportDto,
  ReportFiltersDto,
  UnfollowedQueryDto,
} from './dto/reports.dto';

type Decimal = Prisma.Decimal;

function toNumber(value: Decimal | bigint | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return Number(value);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfToday(): Date {
  const start = startOfToday();
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private eqUuid(alias: string, col: string, val: string): Prisma.Sql {
    return Prisma.sql`${Prisma.raw(`${alias}.${col}`)} = CAST(${val} AS uuid)`;
  }

  private eqStr(alias: string, col: string, val: string): Prisma.Sql {
    return Prisma.sql`${Prisma.raw(`${alias}.${col}`)} = ${val}`;
  }

  private ltDate(alias: string, col: string, val: Date): Prisma.Sql {
    return Prisma.sql`${Prisma.raw(`${alias}.${col}`)} < ${val}`;
  }

  private gteDate(alias: string, col: string, val: Date): Prisma.Sql {
    return Prisma.sql`${Prisma.raw(`${alias}.${col}`)} >= ${val}`;
  }

  private joinFilters(base: Prisma.Sql, filters: Prisma.Sql[]): Prisma.Sql {
    if (filters.length === 0) return base;
    return Prisma.join([base, ...filters], ' ');
  }

  private sqlJoin(parts: Prisma.Sql[], sep: string = ' '): Prisma.Sql {
    if (parts.length === 0) return Prisma.empty;
    if (parts.length === 1) return parts[0];
    return Prisma.join(parts, sep);
  }

  private customerFilters(alias: string, f: ReportFiltersDto): Prisma.Sql[] {
    const parts: Prisma.Sql[] = [];
    if (f.branchId) {
      parts.push(Prisma.sql`AND ${this.eqUuid(alias, 'branch_id', f.branchId)}`);
    }
    if (f.customerStatus && f.customerStatus !== 'all') {
      parts.push(Prisma.sql`AND ${this.eqStr(alias, 'status', f.customerStatus)}`);
    }
    return parts;
  }

  private collectionFilters(f: ReportFiltersDto): Prisma.Sql[] {
    const parts: Prisma.Sql[] = [];
    if (f.branchId) {
      parts.push(Prisma.sql`AND ${this.eqUuid('cust', 'branch_id', f.branchId)}`);
    }
    if (f.collectorId) {
      parts.push(Prisma.sql`AND ${this.eqUuid('c', 'collector_id', f.collectorId)}`);
    }
    if (f.currency) {
      parts.push(Prisma.sql`AND ${this.eqStr('c', 'currency_code', f.currency)}`);
    }
    if (f.customerStatus && f.customerStatus !== 'all') {
      parts.push(Prisma.sql`AND ${this.eqStr('cust', 'status', f.customerStatus)}`);
    }
    return parts;
  }

  private balanceFilters(f: ReportFiltersDto): Prisma.Sql[] {
    const parts: Prisma.Sql[] = [];
    if (f.branchId) {
      parts.push(Prisma.sql`AND ${this.eqUuid('cust', 'branch_id', f.branchId)}`);
    }
    if (f.currency) {
      parts.push(Prisma.sql`AND ${this.eqStr('cb', 'currency_code', f.currency)}`);
    }
    if (f.customerStatus && f.customerStatus !== 'all') {
      parts.push(Prisma.sql`AND ${this.eqStr('cust', 'status', f.customerStatus)}`);
    }
    return parts;
  }

  private promiseFilters(f: ReportFiltersDto): Prisma.Sql[] {
    const parts: Prisma.Sql[] = [];
    if (f.branchId) {
      parts.push(Prisma.sql`AND ${this.eqUuid('cust', 'branch_id', f.branchId)}`);
    }
    if (f.collectorId) {
      parts.push(Prisma.sql`AND ${this.eqUuid('p', 'collector_id', f.collectorId)}`);
    }
    if (f.currency) {
      parts.push(Prisma.sql`AND ${this.eqStr('p', 'currency_code', f.currency)}`);
    }
    if (f.customerStatus && f.customerStatus !== 'all') {
      parts.push(Prisma.sql`AND ${this.eqStr('cust', 'status', f.customerStatus)}`);
    }
    return parts;
  }

  async kpis(user: AuthUser, query: ReportFiltersDto) {
    const orgId = user.organizationId;
    const cf = this.customerFilters('c', query);
    const bf = this.balanceFilters(query);
    const clF = this.collectionFilters(query);
    const pf = this.promiseFilters(query);

    const [totalCustomers, activeCustomers, debtByCurrency, totalCollectedRow, promisesCount, overduePromises, followupsToday, debtorsCreditors] =
      await Promise.all([
        this.prisma.customer.count({
          where: {
            organizationId: orgId,
            ...(query.customerStatus && query.customerStatus !== 'all' ? { status: query.customerStatus } : {}),
          },
        }),
        this.prisma.customer.count({ where: { organizationId: orgId, status: 'active' } }),
        this.prisma.$queryRaw<Array<{ currency_code: string; total_debt: Decimal }>>`
          SELECT cb.currency_code,
                 COALESCE(SUM(CASE WHEN cb.accounting_balance > 0 THEN cb.accounting_balance ELSE 0 END), 0) AS total_debt
            FROM customer_balances cb
            JOIN customers cust ON cust.id = cb.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid)
             ${this.sqlJoin(this.balanceFilters(query))}
           GROUP BY cb.currency_code
        `,
        this.prisma.$queryRaw<Array<{ total_collected: Decimal }>>`
          SELECT COALESCE(SUM(c.amount), 0) AS total_collected
            FROM collections c
            JOIN customers cust ON cust.id = c.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid) AND c.status <> 'reversed'
             ${this.sqlJoin(this.collectionFilters(query))}
        `,
        this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) AS count
            FROM payment_promises p
            JOIN customers cust ON cust.id = p.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid)
             ${this.sqlJoin(this.promiseFilters(query))}
        `,
        this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) AS count
            FROM payment_promises p
            JOIN customers cust ON cust.id = p.customer_id
           WHERE cust.organization_id = CAST(${orgId} AS uuid)
             AND p.due_date < CURRENT_DATE
             AND p.status IN ('upcoming', 'due_today', 'partially_fulfilled')
             ${this.sqlJoin(this.promiseFilters(query))}
        `,
        this.prisma.followup.count({
          where: {
            customer: { organizationId: orgId },
            deletedAt: null,
            followupAt: { gte: startOfToday(), lt: endOfToday() },
          },
        }),
        this.prisma.$queryRaw<Array<{ debtors: bigint; creditors: bigint; zero: bigint }>>`
          WITH totals AS (
            SELECT cu.id,
                   COALESCE(SUM(cb.accounting_balance), 0) AS balance
              FROM customers cu
              LEFT JOIN customer_balances cb ON cb.customer_id = cu.id
             WHERE cu.organization_id = CAST(${orgId} AS uuid)
               ${query.customerStatus && query.customerStatus !== 'all' ? Prisma.sql`AND cu.status = ${query.customerStatus}` : Prisma.empty}
             GROUP BY cu.id
          )
          SELECT
            SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) AS debtors,
            SUM(CASE WHEN balance < 0 THEN 1 ELSE 0 END) AS creditors,
            SUM(CASE WHEN balance = 0 THEN 1 ELSE 0 END) AS zero
          FROM totals
        `,
      ]);

    const totalDebt = debtByCurrency.reduce((acc, r) => acc + toNumber(r.total_debt), 0);
    const totalCollected = toNumber(totalCollectedRow[0]?.total_collected ?? 0);
    const collectionRate = totalDebt > 0 ? (totalCollected / totalDebt) * 100 : 0;

    return {
      totalCustomers,
      activeCustomers,
      totalDebt,
      totalCollected,
      collectionRate,
      debtByCurrency: debtByCurrency.map((r) => ({ currency: r.currency_code, total: toNumber(r.total_debt) })),
      promisesCount: toNumber(promisesCount[0]?.count ?? 0),
      overduePromises: toNumber(overduePromises[0]?.count ?? 0),
      followupsToday,
      debtors: toNumber(debtorsCreditors[0]?.debtors ?? 0),
      creditors: toNumber(debtorsCreditors[0]?.creditors ?? 0),
      zeroBalance: toNumber(debtorsCreditors[0]?.zero ?? 0),
    };
  }

  async collections(user: AuthUser, query: CollectionsQueryDto) {
    const orgId = user.organizationId;
    const clF = this.collectionFilters(query);

    const endDate = query.to ? new Date(query.to) : new Date();
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
    startDate.setHours(0, 0, 0, 0);

    const groupExpr = query.groupBy === 'day'
      ? Prisma.sql`DATE_TRUNC('day', c.collected_at)`
      : query.groupBy === 'week'
        ? Prisma.sql`DATE_TRUNC('week', c.collected_at)`
        : Prisma.sql`DATE_TRUNC('month', c.collected_at)`;

    const rows = await this.prisma.$queryRaw<Array<{ period: Date; total: Decimal }>>`
      SELECT ${groupExpr} AS period,
             COALESCE(SUM(c.amount), 0) AS total
        FROM collections c
        JOIN customers cust ON cust.id = c.customer_id
       WHERE cust.organization_id = CAST(${orgId} AS uuid) AND c.status <> 'reversed'
         ${this.sqlJoin(clF)}
         AND c.collected_at >= ${startDate}
         AND c.collected_at <= ${endDate}
       GROUP BY 1
       ORDER BY 1
    `;

    const map = new Map<string, number>();
    rows.forEach((row) => {
      const key = row.period.toISOString().slice(0, query.groupBy === 'day' ? 10 : 7);
      map.set(key, (map.get(key) ?? 0) + toNumber(row.total));
    });

    const results: { period: string; total: number }[] = [];
    const current = new Date(startDate);
    const fmt = query.groupBy === 'day' ? 10 : 7;
    while (current <= endDate) {
      const key = current.toISOString().slice(0, fmt);
      results.push({ period: key, total: map.get(key) ?? 0 });
      if (query.groupBy === 'day') current.setDate(current.getDate() + 1);
      else if (query.groupBy === 'week') current.setDate(current.getDate() + 7);
      else current.setMonth(current.getMonth() + 1);
    }

    return results;
  }

  async debtByBranch(user: AuthUser, query: ReportFiltersDto) {
    const orgId = user.organizationId;
    const bf = this.balanceFilters(query);
    const rows = await this.prisma.$queryRaw<Array<{ branch: string; total: Decimal }>>`
      SELECT COALESCE(b.name, 'غير محدد') AS branch,
             COALESCE(SUM(CASE WHEN cb.accounting_balance > 0 THEN cb.accounting_balance ELSE 0 END), 0) AS total
        FROM customer_balances cb
        JOIN customers cust ON cust.id = cb.customer_id
        LEFT JOIN branches b ON b.id = cust.branch_id
       WHERE cust.organization_id = CAST(${orgId} AS uuid)
         ${this.sqlJoin(bf)}
       GROUP BY branch
       ORDER BY total DESC
    `;
    return rows.map((r) => ({ branch: r.branch ?? 'غير محدد', total: toNumber(r.total) }));
  }

  async customersCollectionState(user: AuthUser) {
    const orgId = user.organizationId;
    const [row] = await this.prisma.$queryRaw<Array<{ debtors: bigint; creditors: bigint; zero: bigint }>>`
      WITH totals AS (
        SELECT c.id,
               COALESCE(SUM(cb.accounting_balance), 0) AS balance
          FROM customers c
          LEFT JOIN customer_balances cb ON cb.customer_id = c.id
         WHERE c.organization_id = CAST(${orgId} AS uuid)
         GROUP BY c.id
      )
      SELECT
        SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) AS debtors,
        SUM(CASE WHEN balance < 0 THEN 1 ELSE 0 END) AS creditors,
        SUM(CASE WHEN balance = 0 THEN 1 ELSE 0 END) AS zero
      FROM totals
    `;
    return {
      debtors: toNumber(row?.debtors ?? 0),
      creditors: toNumber(row?.creditors ?? 0),
      zero: toNumber(row?.zero ?? 0),
    };
  }

  async aging(user: AuthUser, query: AgingQueryDto) {
    const orgId = user.organizationId;
    const currency = query.currency ?? 'USD';

    const bf: Prisma.Sql[] = [];
    if (query.branchId) {
      bf.push(Prisma.sql`AND ${this.eqUuid('c', 'branch_id', query.branchId)}`);
    }
    if (query.customerStatus && query.customerStatus !== 'all') {
      bf.push(Prisma.sql`AND ${this.eqStr('c', 'status', query.customerStatus)}`);
    }

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
           ${this.sqlJoin(bf)}
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

    const result: Record<string, { total: number; customers: number }> = {
      settled: { total: 0, customers: 0 },
      '1-30': { total: 0, customers: 0 },
      '31-60': { total: 0, customers: 0 },
      '61-90': { total: 0, customers: 0 },
      '91-180': { total: 0, customers: 0 },
      '180+': { total: 0, customers: 0 },
    };
    buckets.forEach((r) => {
      const key = r.bucket as keyof typeof result;
      if (result[key]) {
        result[key].total += toNumber(r.total);
        result[key].customers += Number(r.customer_count);
      }
    });
    return result;
  }

  async agingDetail(user: AuthUser, query: AgingDetailQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    }

    const orgId = user.organizationId;
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'total_balance';
    const sortDir = query.sortDir ?? 'desc';
    const currency = query.currency;

    const customerWhere: Prisma.Sql[] = [
      Prisma.sql`AND c.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (query.branchId) {
      customerWhere.push(Prisma.sql`AND c.branch_id = CAST(${query.branchId} AS uuid)`);
    }
    if (query.customerStatus && query.customerStatus !== 'all') {
      customerWhere.push(Prisma.sql`AND c.status = ${query.customerStatus}`);
    }
    if (currency) {
      customerWhere.push(Prisma.sql`AND cb.currency_code = ${currency}`);
    }
    if (query.collectorId) {
      customerWhere.push(Prisma.sql`AND ca.collector_id = CAST(${query.collectorId} AS uuid)`);
    }

    const sortColMap: Record<string, string> = {
      customer_name: 'customer_name',
      customer_code: 'customer_code',
      branch: 'branch_name',
      collector: 'collector_name',
      currency: 'currency_code',
      total_balance: 'total_balance',
      current: 'bucket_current',
      d1_30: 'bucket_1_30',
      d31_60: 'bucket_31_60',
      d61_90: 'bucket_61_90',
      d90_plus: 'bucket_90_plus',
      oldest_debt_date: 'first_tx',
      days_overdue: 'days_overdue',
    };
    const sortSql = Prisma.raw(sortColMap[sortBy] ?? 'total_balance');
    const dirSql = sortDir === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');

    const bucketColMap: Record<string, string> = {
      current: 'bucket_current',
      '1-30': 'bucket_1_30',
      '31-60': 'bucket_31_60',
      '61-90': 'bucket_61_90',
      '90+': 'bucket_90_plus',
    };
    const bucketFilter = query.bucket
      ? Prisma.sql`AND ${Prisma.raw(bucketColMap[query.bucket] ?? '1=0')} > 0`
      : Prisma.empty;

    const fromFilter = query.from
      ? Prisma.sql`AND first_tx >= ${new Date(query.from)}`
      : Prisma.empty;
    const toFilter = query.to
      ? Prisma.sql`AND first_tx <= ${new Date(query.to)}`
      : Prisma.empty;

    const baseQuery = Prisma.sql`
      WITH per_customer AS (
        SELECT c.id AS customer_id,
               c.name AS customer_name,
               c.external_customer_code AS customer_code,
               b.name AS branch_name,
               u.full_name AS collector_name,
               cb.currency_code,
               cb.accounting_balance,
               COALESCE(
                 (SELECT MIN(tx.tx_date)
                    FROM imported_transactions tx
                   WHERE tx.customer_id = c.id AND tx.currency_code = cb.currency_code),
                 c.created_at::date
               ) AS first_tx
          FROM customer_balances cb
          JOIN customers c ON c.id = cb.customer_id
          LEFT JOIN branches b ON b.id = c.branch_id
          LEFT JOIN customer_assignments ca ON ca.customer_id = c.id AND ca.effective_to IS NULL
          LEFT JOIN collectors col ON col.id = ca.collector_id
          LEFT JOIN users u ON u.id = col.user_id
         WHERE cb.accounting_balance > 0
           ${this.sqlJoin(customerWhere)}
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
         WHERE 1=1 ${fromFilter} ${toFilter}
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
    `;

    const sortLimit = Prisma.sql` ORDER BY ${sortSql} ${dirSql} NULLS LAST LIMIT ${limit} OFFSET ${offset}`;

    const [items, countResult, summaryResult] = await Promise.all([
      this.prisma.$queryRaw<unknown[]>(Prisma.sql`${baseQuery} ${sortLimit}`),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*) AS count FROM (${baseQuery}) _cnt`
      ),
      this.prisma.$queryRaw<Array<{
        total_debt: Decimal; current_debt: Decimal; overdue_debt: Decimal;
        bucket_90_plus: Decimal; overdue_customers: bigint;
      }>>(Prisma.sql`
        SELECT COALESCE(SUM(total_balance), 0) AS total_debt,
               COALESCE(SUM(bucket_current), 0) AS current_debt,
               COALESCE(SUM(total_balance) - SUM(bucket_current), 0) AS overdue_debt,
               COALESCE(SUM(bucket_90_plus), 0) AS bucket_90_plus,
               COUNT(*) FILTER (WHERE total_balance - bucket_current > 0) AS overdue_customers
          FROM (${baseQuery}) _sum
      `),
    ]);

    const typedItems = items as Array<{
      customer_id: string; customer_name: string; customer_code: string;
      branch_name: string | null; collector_name: string | null;
      currency_code: string; total_balance: Decimal; first_tx: Date;
      days_overdue: bigint; bucket_current: Decimal; bucket_1_30: Decimal;
      bucket_31_60: Decimal; bucket_61_90: Decimal; bucket_90_plus: Decimal;
    }>;

    return {
      items: typedItems.map((r) => ({
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerCode: r.customer_code,
        branch: r.branch_name ?? 'غير محدد',
        collector: r.collector_name ?? 'غير محدد',
        currency: r.currency_code,
        totalBalance: toNumber(r.total_balance),
        oldestDebtDate: r.first_tx,
        daysOverdue: Number(r.days_overdue),
        current: toNumber(r.bucket_current),
        d1_30: toNumber(r.bucket_1_30),
        d31_60: toNumber(r.bucket_31_60),
        d61_90: toNumber(r.bucket_61_90),
        d90_plus: toNumber(r.bucket_90_plus),
      })),
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
      totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
      summary: {
        totalDebt: toNumber(summaryResult[0]?.total_debt ?? 0),
        currentDebt: toNumber(summaryResult[0]?.current_debt ?? 0),
        overdueDebt: toNumber(summaryResult[0]?.overdue_debt ?? 0),
        overDue90Plus: toNumber(summaryResult[0]?.bucket_90_plus ?? 0),
        overdueCustomers: Number(summaryResult[0]?.overdue_customers ?? 0),
      },
    };
  }

  async collectorsPerformance(user: AuthUser, query: CollectorsPerformanceQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    }

    const orgId = user.organizationId;
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'month';
    const sortDir = query.sortDir ?? 'desc';
    const endDate = query.to ? new Date(query.to) : new Date();
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getFullYear(), endDate.getMonth() - 2, 1);
    const weekStart = (() => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)); })();

    const collectorWhere: Prisma.Sql[] = [
      Prisma.sql`AND u.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (query.collectorStatus === 'active') {
      collectorWhere.push(Prisma.sql`AND col.active = true`);
    } else if (query.collectorStatus === 'inactive') {
      collectorWhere.push(Prisma.sql`AND col.active = false`);
    }
    if (query.branchId) {
      collectorWhere.push(Prisma.sql`AND col.branch_id = CAST(${query.branchId} AS uuid)`);
    }
    if (query.collectorId) {
      collectorWhere.push(Prisma.sql`AND col.id = CAST(${query.collectorId} AS uuid)`);
    }

    const sortColMap: Record<string, string> = {
      collector_name: 'collector',
      customers: 'customer_count',
      today: 'today_collected',
      week: 'week_collected',
      month: 'month_collected',
      collections_count: 'collections_count',
      outstanding_balance: 'outstanding_balance',
      fulfillment_rate: 'fulfillment_rate',
      collection_rate: 'collection_rate',
    };
    const sortCol = sortColMap[sortBy] ?? 'month_collected';
    const sortDirStr = sortDir === 'asc' ? 'ASC' : 'DESC';

    const baseQuery = Prisma.sql`
      WITH collector_stats AS (
        SELECT col.id AS collector_id, u.full_name AS collector,
               COUNT(DISTINCT ca.customer_id) AS customer_count
          FROM collectors col
          JOIN users u ON u.id = col.user_id
          LEFT JOIN customer_assignments ca ON ca.collector_id = col.id AND ca.effective_to IS NULL
         WHERE 1=1 ${this.sqlJoin(collectorWhere)}
         GROUP BY col.id, u.full_name
      ),
      collection_stats AS (
        SELECT c.collector_id,
               COALESCE(SUM(CASE WHEN c.collected_at >= CURRENT_DATE THEN c.amount ELSE 0 END), 0) AS today_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= ${weekStart} THEN c.amount ELSE 0 END), 0) AS week_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= ${startDate} AND c.collected_at <= ${endDate} THEN c.amount ELSE 0 END), 0) AS month_collected,
               COUNT(*) FILTER (WHERE c.collected_at >= ${startDate} AND c.collected_at <= ${endDate}) AS collections_count
          FROM collections c
          JOIN customers cust ON cust.id = c.customer_id
         WHERE cust.organization_id = CAST(${orgId} AS uuid)
           AND c.status <> 'reversed'
           AND c.collected_at <= ${endDate}
         GROUP BY c.collector_id
      ),
      promise_stats AS (
        SELECT p.collector_id,
               COUNT(*) AS promise_count,
               COUNT(*) FILTER (WHERE p.status = 'fulfilled') AS fulfilled_count
          FROM payment_promises p
          JOIN customers cust ON cust.id = p.customer_id
         WHERE cust.organization_id = CAST(${orgId} AS uuid)
           AND p.promise_date >= ${startDate} AND p.promise_date <= ${endDate}
         GROUP BY p.collector_id
      ),
      followup_stats AS (
        SELECT col.id AS collector_id,
               COUNT(f.id) AS followup_count
          FROM collectors col
          JOIN users u ON u.id = col.user_id
          LEFT JOIN followups f ON f.user_id = col.user_id AND f.deleted_at IS NULL
           AND f.followup_at >= ${startDate} AND f.followup_at <= ${endDate}
         WHERE u.organization_id = CAST(${orgId} AS uuid)
         GROUP BY col.id
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
               COALESCE(fs.followup_count, 0) AS followup_count,
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
          LEFT JOIN followup_stats fs ON fs.collector_id = cs.collector_id
          LEFT JOIN promise_stats ps ON ps.collector_id = cs.collector_id
          LEFT JOIN balance_stats bs ON bs.collector_id = cs.collector_id
      )
      SELECT * FROM base
    `;

    const sortLimit = Prisma.raw(` ORDER BY ${sortCol} ${sortDirStr} NULLS LAST LIMIT ${limit} OFFSET ${offset}`);

    const [items, countResult, summaryResult, topPerfResult] = await Promise.all([
      this.prisma.$queryRaw<unknown[]>(Prisma.sql`${baseQuery} ${sortLimit}`),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*) AS count FROM (${baseQuery}) _cnt`
      ),
      this.prisma.$queryRaw<Array<{
        total_collectors: bigint; total_collected: Decimal;
        avg_fulfillment: Decimal; total_customers: bigint;
      }>>(Prisma.sql`
        SELECT COUNT(*) AS total_collectors,
               COALESCE(SUM(month_collected), 0) AS total_collected,
               CASE WHEN SUM(CASE WHEN promise_count > 0 THEN 1 ELSE 0 END) > 0
                 THEN SUM(fulfilled_count)::numeric / NULLIF(SUM(CASE WHEN promise_count > 0 THEN promise_count END), 0) * 100
                 ELSE 0 END AS avg_fulfillment,
               COALESCE(SUM(customer_count), 0) AS total_customers
          FROM (${baseQuery}) _sum
      `),
      this.prisma.$queryRaw<Array<{ collector: string }>>(
        Prisma.sql`SELECT collector FROM (${baseQuery}) _top
          ORDER BY month_collected DESC, fulfillment_rate DESC LIMIT 1`
      ),
    ]);

    const typed = items as Array<{
      collector_id: string; collector: string; customer_count: bigint;
      today_collected: Decimal; week_collected: Decimal; month_collected: Decimal;
      collections_count: bigint; followup_count: bigint; promise_count: bigint;
      fulfilled_count: bigint; outstanding_balance: Decimal;
      fulfillment_rate: number; collection_rate: number;
    }>;

    const summaryRow = summaryResult[0];
    const topPerformer = topPerfResult[0]?.collector ?? null;

    return {
      items: typed.map((r) => ({
        collectorId: r.collector_id,
        collector: r.collector,
        customerCount: Number(r.customer_count),
        todayCollected: toNumber(r.today_collected),
        weekCollected: toNumber(r.week_collected),
        monthCollected: toNumber(r.month_collected),
        collectionsCount: Number(r.collections_count),
        followupCount: Number(r.followup_count),
        promiseCount: Number(r.promise_count),
        fulfilledCount: Number(r.fulfilled_count),
        outstandingBalance: toNumber(r.outstanding_balance),
        fulfillmentRate: Number(r.fulfillment_rate ?? 0),
        collectionRate: Number(r.collection_rate ?? 0),
      })),
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
      totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
      summary: {
        totalCollectors: Number(summaryRow?.total_collectors ?? 0),
        totalCollected: toNumber(summaryRow?.total_collected ?? 0),
        avgFulfillmentRate: Number(summaryRow?.avg_fulfillment ?? 0),
        totalCustomers: Number(summaryRow?.total_customers ?? 0),
        topPerformer,
      },
    };
  }

  async unfollowedCustomers(user: AuthUser, query: UnfollowedQueryDto) {
    const orgId = user.organizationId;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const cf = this.customerFilters('c', query);
    const dateClauses: Prisma.Sql[] = [];
    if (query.from) {
      dateClauses.push(Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM followups f WHERE f.customer_id = c.id AND f.deleted_at IS NULL AND f.followup_at >= ${new Date(query.from)}
      )`);
    } else {
      dateClauses.push(Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM followups f WHERE f.customer_id = c.id AND f.deleted_at IS NULL
      )`);
    }
    if (query.to) {
      dateClauses.push(Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM followups f WHERE f.customer_id = c.id AND f.deleted_at IS NULL AND f.followup_at <= ${new Date(query.to)}
      )`);
    }

    const whereClauses = [...cf, ...dateClauses];

    const [items, countResult] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; name: string; code: string }>>`
        SELECT c.id, c.name, c.external_customer_code AS code
          FROM customers c
         WHERE c.organization_id = CAST(${orgId} AS uuid)
           AND c.status = 'active'
           ${this.sqlJoin(whereClauses)}
         ORDER BY c.name
         LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
          FROM customers c
         WHERE c.organization_id = CAST(${orgId} AS uuid)
           AND c.status = 'active'
           ${this.sqlJoin(whereClauses)}
      `,
    ]);

    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
      totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
    };
  }

  async collectionsByMethod(user: AuthUser, query: ReportFiltersDto) {
    const orgId = user.organizationId;
    const clF = this.collectionFilters(query);

    const rows = await this.prisma.$queryRaw<Array<{ method: string; total: Decimal; count: bigint }>>`
      SELECT cm.name AS method,
             COALESCE(SUM(c.amount), 0) AS total,
             COUNT(*) AS count
        FROM collections c
        JOIN customers cust ON cust.id = c.customer_id
        JOIN collection_methods cm ON cm.id = c.method_id
       WHERE cust.organization_id = CAST(${orgId} AS uuid) AND c.status <> 'reversed'
         ${this.sqlJoin(clF)}
       GROUP BY cm.name
       ORDER BY total DESC
    `;
    return rows.map((r) => ({ method: r.method, total: toNumber(r.total), count: Number(r.count) }));
  }

  async promisesByStatus(user: AuthUser, query: ReportFiltersDto) {
    const orgId = user.organizationId;
    const pf = this.promiseFilters(query);

    const rows = await this.prisma.$queryRaw<Array<{ status: string; count: bigint; total: Decimal }>>`
      SELECT p.status,
             COUNT(*) AS count,
             COALESCE(SUM(p.expected_amount), 0) AS total
        FROM payment_promises p
        JOIN customers cust ON cust.id = p.customer_id
       WHERE cust.organization_id = CAST(${orgId} AS uuid)
         ${this.sqlJoin(pf)}
       GROUP BY p.status
       ORDER BY count DESC
    `;
    return rows.map((r) => ({ status: r.status, count: Number(r.count), total: toNumber(r.total) }));
  }

  async followupsSummary(user: AuthUser, query: ReportFiltersDto) {
    const orgId = user.organizationId;

    const fClauses: Prisma.Sql[] = [
      Prisma.sql`f.deleted_at IS NULL`,
      Prisma.sql`AND c.organization_id = CAST(${orgId} AS uuid)`,
    ];
    if (query.from) fClauses.push(Prisma.sql`AND f.followup_at >= ${new Date(query.from)}`);
    if (query.to) fClauses.push(Prisma.sql`AND f.followup_at <= ${new Date(query.to)}`);
    if (query.branchId) fClauses.push(Prisma.sql`AND c.branch_id = CAST(${query.branchId} AS uuid)`);
    if (query.collectorId) {
      fClauses.push(Prisma.sql`AND f.user_id = (SELECT col.user_id FROM collectors col WHERE col.id = CAST(${query.collectorId} AS uuid))`);
    }

    const [byType, byResult, upcoming, overdue] = await Promise.all([
      this.prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
        SELECT ft.name AS type, COUNT(*) AS count
          FROM followups f
          JOIN customers c ON c.id = f.customer_id
          JOIN followup_types ft ON ft.id = f.type_id
         WHERE ${this.sqlJoin(fClauses)}
         GROUP BY ft.name ORDER BY count DESC
      `,
      this.prisma.$queryRaw<Array<{ result: string; count: bigint }>>`
        SELECT fr.name AS result, COUNT(*) AS count
          FROM followups f
          JOIN customers c ON c.id = f.customer_id
          JOIN followup_results fr ON fr.id = f.result_id
         WHERE ${this.sqlJoin(fClauses)}
         GROUP BY fr.name ORDER BY count DESC
      `,
      this.prisma.followup.count({
        where: {
          customer: { organizationId: orgId },
          deletedAt: null,
          nextFollowupDate: { gte: startOfToday() },
        },
      }),
      this.prisma.followup.count({
        where: {
          customer: { organizationId: orgId },
          deletedAt: null,
          nextFollowupDate: { lt: startOfToday() },
          followupAt: { lt: startOfToday() },
        },
      }),
    ]);

    return {
      byType: byType.map((r) => ({ type: r.type, count: Number(r.count) })),
      byResult: byResult.map((r) => ({ result: r.result, count: Number(r.count) })),
      upcoming,
      overdue,
    };
  }

  async collectorsList(user: AuthUser) {
    const orgId = user.organizationId;
    return this.prisma.$queryRaw<Array<{ id: string; full_name: string }>>`
      SELECT col.id, u.full_name
        FROM collectors col
        JOIN users u ON u.id = col.user_id
       WHERE col.active = true
         AND u.organization_id = CAST(${orgId} AS uuid)
       ORDER BY u.full_name
    `;
  }

  async export(_user: AuthUser, _body: ExportReportDto) {
    throw new Error('Export not implemented yet.');
  }
}
