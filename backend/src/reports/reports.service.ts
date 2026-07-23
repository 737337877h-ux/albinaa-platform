import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgingQueryDto,
  CollectionsQueryDto,
  CollectorsPerformanceQueryDto,
  ExportReportDto,
  KpisQueryDto,
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

  async kpis(user: AuthUser, _query: KpisQueryDto) {
    const organizationId = user.organizationId;

    const orgId = organizationId;
    const [totalCustomers, activeCustomers, totalDebtRow, totalCollectedRow, promisesCount, overduePromises, followupsToday] =
      await Promise.all([
        this.prisma.customer.count({ where: { organizationId: orgId } }),
        this.prisma.customer.count({ where: { organizationId: orgId, status: 'active' } }),
        this.prisma.$queryRaw<Array<{ total_debt: Decimal }>>`
          SELECT COALESCE(SUM(CASE WHEN cb.accounting_balance > 0 THEN cb.accounting_balance ELSE 0 END), 0) AS total_debt
          FROM customer_balances cb
          JOIN customers c ON c.id = cb.customer_id
          WHERE c.organization_id = CAST(${orgId} AS uuid)
        `,
        this.prisma.$queryRaw<Array<{ total_collected: Decimal }>>`
          SELECT COALESCE(SUM(c.amount), 0) AS total_collected
          FROM collections c
          JOIN customers cust ON cust.id = c.customer_id
          WHERE cust.organization_id = CAST(${orgId} AS uuid)
            AND c.status <> 'reversed'
        `,
        this.prisma.paymentPromise.count({ where: { customer: { organizationId: orgId } } }),
        this.prisma.paymentPromise.count({
          where: {
            customer: { organizationId: orgId },
            dueDate: { lt: startOfToday() },
            status: { in: ['upcoming', 'due_today', 'partially_fulfilled'] },
          },
        }),
        this.prisma.followup.count({
          where: {
            customer: { organizationId: orgId },
            deletedAt: null,
            followupAt: { gte: startOfToday(), lt: endOfToday() },
          },
        }),
      ]);

    const totalDebt = toNumber(totalDebtRow[0]?.total_debt ?? 0);
    const totalCollected = toNumber(totalCollectedRow[0]?.total_collected ?? 0);
    const collectionRate = totalDebt > 0 ? (totalCollected / totalDebt) * 100 : 0;

    return {
      totalCustomers,
      activeCustomers,
      totalDebt,
      totalCollected,
      collectionRate,
      promisesCount,
      overduePromises,
      followupsToday,
    };
  }

  async collections(user: AuthUser, query: CollectionsQueryDto) {
    const organizationId = user.organizationId;
    const endDate = query.to ? new Date(query.to) : new Date();
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
    startDate.setHours(0, 0, 0, 0);

    const rows = await this.prisma.$queryRaw<Array<{ month: Date; total: Decimal }>>`
      SELECT DATE_TRUNC('month', c.collected_at) AS month,
             COALESCE(SUM(c.amount), 0) AS total
        FROM collections c
        JOIN customers cust ON cust.id = c.customer_id
       WHERE cust.organization_id = CAST(${organizationId} AS uuid)
         AND c.status <> 'reversed'
         AND c.collected_at >= ${startDate}
         AND c.collected_at <= ${endDate}
       GROUP BY 1
       ORDER BY 1
    `;

    const map = new Map<string, number>();
    rows.forEach((row) => {
      const key = row.month.toISOString().slice(0, 7); // YYYY-MM
      map.set(key, toNumber(row.total));
    });

    const results: { month: string; total: number }[] = [];
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (current <= limit) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      results.push({ month: key, total: map.get(key) ?? 0 });
      current.setMonth(current.getMonth() + 1);
    }

    return results;
  }

  async debtByBranch(user: AuthUser) {
    const organizationId = user.organizationId;
    const rows = await this.prisma.$queryRaw<Array<{ branch: string | null; total: Decimal }>>`
      SELECT COALESCE(b.name, 'غير محدد') AS branch,
             COALESCE(SUM(CASE WHEN cb.accounting_balance > 0 THEN cb.accounting_balance ELSE 0 END), 0) AS total
        FROM customer_balances cb
        JOIN customers cust ON cust.id = cb.customer_id
        LEFT JOIN branches b ON b.id = cust.branch_id
       WHERE cust.organization_id = CAST(${organizationId} AS uuid)
       GROUP BY branch
       ORDER BY total DESC
    `;

    return rows.map((row) => ({ branch: row.branch ?? 'غير محدد', total: toNumber(row.total) }));
  }

  async customersCollectionState(user: AuthUser) {
    const organizationId = user.organizationId;
    const [row] = await this.prisma.$queryRaw<Array<{ debtors: bigint; creditors: bigint; zero: bigint }>>`
      WITH totals AS (
        SELECT c.id,
               COALESCE(SUM(cb.accounting_balance), 0) AS balance
          FROM customers c
          LEFT JOIN customer_balances cb ON cb.customer_id = c.id
         WHERE c.organization_id = CAST(${organizationId} AS uuid)
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
    const organizationId = user.organizationId;
    const currency = query.currency ?? 'USD';

    const buckets = await this.prisma.$queryRaw<Array<{ bucket: string; total: Decimal }>>`
      WITH balances AS (
        SELECT c.id,
               c.name,
               cb.currency_code,
               cb.accounting_balance,
               COALESCE(
                 (SELECT MIN(tx.tx_date)
                  FROM imported_transactions tx
                  WHERE tx.customer_id = c.id AND tx.currency_code = cb.currency_code),
                 c.created_at
               ) AS first_tx
        FROM customer_balances cb
        JOIN customers c ON c.id = cb.customer_id
        WHERE c.organization_id = CAST(${organizationId} AS uuid)
          AND cb.currency_code = ${currency}
      )
      SELECT CASE
               WHEN accounting_balance <= 0 THEN '0'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '30 days') THEN '0-30'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '60 days') THEN '31-60'
               WHEN first_tx >= (CURRENT_DATE - INTERVAL '90 days') THEN '61-90'
               ELSE '90+'
             END AS bucket,
             SUM(accounting_balance) AS total
        FROM balances
       GROUP BY bucket
    `;

    const normalized = {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0,
    } as Record<string, number>;

    buckets.forEach((row) => {
      const key = row.bucket as keyof typeof normalized;
      if (normalized[key] !== undefined) normalized[key] += toNumber(row.total);
    });

    return normalized;
  }

  async collectorsPerformance(user: AuthUser, query: CollectorsPerformanceQueryDto) {
    const organizationId = user.organizationId;
    const endDate = query.to ? new Date(query.to) : new Date();
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getFullYear(), endDate.getMonth() - 2, 1);

    const rows = await this.prisma.$queryRaw<Array<{ collector: string; total: Decimal }>>`
      SELECT u.full_name AS collector,
             COALESCE(SUM(c.amount), 0) AS total
        FROM collections c
        JOIN customers cust ON cust.id = c.customer_id
        JOIN collectors col ON col.id = c.collector_id
        JOIN users u ON u.id = col.user_id
       WHERE cust.organization_id = CAST(${organizationId} AS uuid)
         AND c.status <> 'reversed'
         AND c.collected_at >= ${startDate}
         AND c.collected_at <= ${endDate}
       GROUP BY u.full_name
       ORDER BY total DESC
       LIMIT 10
    `;

    return rows.map((row) => ({ collector: row.collector, total: toNumber(row.total) }));
  }

  async export(_user: AuthUser, _body: ExportReportDto) {
    throw new Error('Export not implemented yet.');
  }
}
