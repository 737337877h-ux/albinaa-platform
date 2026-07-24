import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
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

  async collectorsPerformance(user: AuthUser, query: CollectorsPerformanceQueryDto) {
    const orgId = user.organizationId;
    const endDate = query.to ? new Date(query.to) : new Date();
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getFullYear(), endDate.getMonth() - 2, 1);

    const rows = await this.prisma.$queryRaw<Array<{
      collector_id: string; collector: string; customer_count: bigint;
      today_collected: Decimal; month_collected: Decimal;
      followup_count: bigint; promise_count: bigint; fulfilled_count: bigint;
    }>>`
      WITH collector_stats AS (
        SELECT col.id AS collector_id, u.full_name AS collector,
               COUNT(DISTINCT ca.customer_id) AS customer_count
          FROM collectors col
          JOIN users u ON u.id = col.user_id
          LEFT JOIN customer_assignments ca ON ca.collector_id = col.id AND ca.effective_to IS NULL
         WHERE col.active = true
           AND u.organization_id = CAST(${orgId} AS uuid)
         GROUP BY col.id, u.full_name
      ),
      collection_stats AS (
        SELECT c.collector_id,
               COALESCE(SUM(CASE WHEN c.collected_at >= CURRENT_DATE THEN c.amount ELSE 0 END), 0) AS today_collected,
               COALESCE(SUM(CASE WHEN c.collected_at >= ${startDate} THEN c.amount ELSE 0 END), 0) AS month_collected
          FROM collections c
          JOIN customers cust ON cust.id = c.customer_id
         WHERE cust.organization_id = CAST(${orgId} AS uuid)
           AND c.status <> 'reversed'
           AND c.collected_at >= ${startDate}
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
         GROUP BY p.collector_id
      ),
      followup_stats AS (
        SELECT col.id AS collector_id,
               COUNT(f.id) AS followup_count
          FROM collectors col
          JOIN users u ON u.id = col.user_id
          LEFT JOIN followups f ON f.user_id = col.user_id AND f.deleted_at IS NULL
         WHERE u.organization_id = CAST(${orgId} AS uuid)
         GROUP BY col.id
      )
      SELECT cs.collector_id, cs.collector, cs.customer_count,
             COALESCE(cst.month_collected, 0) AS month_collected,
             COALESCE(cst.today_collected, 0) AS today_collected,
             COALESCE(fs.followup_count, 0) AS followup_count,
             COALESCE(ps.promise_count, 0) AS promise_count,
             COALESCE(ps.fulfilled_count, 0) AS fulfilled_count
        FROM collector_stats cs
        LEFT JOIN collection_stats cst ON cst.collector_id = cs.collector_id
        LEFT JOIN followup_stats fs ON fs.collector_id = cs.collector_id
        LEFT JOIN promise_stats ps ON ps.collector_id = cs.collector_id
       ORDER BY month_collected DESC
    `;

    return rows.map((r) => ({
      collectorId: r.collector_id,
      collector: r.collector,
      customerCount: Number(r.customer_count),
      monthCollected: toNumber(r.month_collected),
      todayCollected: toNumber(r.today_collected),
      followupCount: Number(r.followup_count),
      promiseCount: Number(r.promise_count),
      fulfilledCount: Number(r.fulfilled_count),
      fulfillmentRate: Number(r.promise_count) > 0 ? (Number(r.fulfilled_count) / Number(r.promise_count)) * 100 : 0,
    }));
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

  async export(_user: AuthUser, _body: ExportReportDto) {
    throw new Error('Export not implemented yet.');
  }
}
