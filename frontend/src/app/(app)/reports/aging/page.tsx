'use client';
import { useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { api, downloadBlob } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { CCY_AR } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, CardHeader, Badge, Money, Skeleton } from '@/components/ui/primitives';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { DataState, PermissionNotice } from '@/components/ui/data-state';

interface AgingRow {
  customerId: string;
  customerName: string;
  customerCode: string;
  branch: string;
  collector: string;
  currency: string;
  totalBalance: number;
  oldestDebtDate: string;
  daysOverdue: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}

interface AgingResponse {
  items: AgingRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalDebt: number;
    currentDebt: number;
    overdueDebt: number;
    overDue90Plus: number;
    overdueCustomers: number;
  };
}

interface FilterState {
  from: string;
  to: string;
  branchId: string;
  collectorId: string;
  currency: string;
  customerStatus: string;
  bucket: string;
  sortBy: string;
  sortDir: string;
}

const BUCKET_OPTIONS = [
  { value: 'current', label: 'حالي' },
  { value: '1-30', label: '1–30 يومًا' },
  { value: '31-60', label: '31–60 يومًا' },
  { value: '61-90', label: '61–90 يومًا' },
  { value: '90+', label: '+90 يومًا' },
];

function readFilters(sp: URLSearchParams): FilterState {
  return {
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    branchId: sp.get('branchId') ?? '',
    collectorId: sp.get('collectorId') ?? '',
    currency: sp.get('currency') ?? '',
    customerStatus: sp.get('customerStatus') ?? 'all',
    bucket: sp.get('bucket') ?? '',
    sortBy: sp.get('sortBy') ?? 'total_balance',
    sortDir: sp.get('sortDir') ?? 'desc',
  };
}

function buildParams(f: FilterState) {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.branchId) p.set('branchId', f.branchId);
  if (f.collectorId) p.set('collectorId', f.collectorId);
  if (f.currency) p.set('currency', f.currency);
  if (f.customerStatus && f.customerStatus !== 'all') p.set('customerStatus', f.customerStatus);
  if (f.bucket) p.set('bucket', f.bucket);
  p.set('sortBy', f.sortBy);
  p.set('sortDir', f.sortDir);
  return p.toString();
}

function bucketLabel(k: string) {
  const map: Record<string, string> = {
    current: 'حالي', '1-30': '1–30', '31-60': '31–60',
    '61-90': '61–90', '90+': '90+',
  };
  return map[k] ?? k;
}

function bucketTone(k: string): 'pine' | 'credit' | 'debt' | 'hazard' | 'neutral' {
  if (k === 'current') return 'pine';
  if (k === '1-30') return 'credit';
  if (k === '31-60') return 'neutral';
  if (k === '61-90') return 'debt';
  return 'hazard';
}

export default function AgingDetailPage() {
  const can = useCan();
  const canExec = can('reports.executive');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const fp = useMemo(() => buildParams(filters), [filters]);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadBlob('/reports/export', {
        report: 'aging-detail',
        format: 'xlsx',
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.collectorId ? { collectorId: filters.collectorId } : {}),
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(filters.customerStatus !== 'all' ? { customerStatus: filters.customerStatus } : {}),
        ...(filters.bucket ? { bucket: filters.bucket } : {}),
      }, 'تفصيل_أعمار_الديون.xlsx');
    } finally {
      setExporting(false);
    }
  }, [filters]);

  const setFilter = useCallback((key: keyof FilterState, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all' && value !== '') next.set(key, value);
    else next.delete(key);
    setPage(1);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const clearFilters = useCallback(() => {
    setPage(1);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const setSort = useCallback((col: string) => {
    const next = new URLSearchParams(searchParams);
    const isCurrentSort = (filters.sortBy ?? 'total_balance') === col;
    const newDir = isCurrentSort && filters.sortDir === 'desc' ? 'asc' : 'desc';
    next.set('sortBy', col);
    next.set('sortDir', newDir);
    setPage(1);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [router, pathname, searchParams, filters.sortBy, filters.sortDir]);

  const data = useQuery<AgingResponse>({
    queryKey: ['r-aging-detail', fp, page],
    queryFn: () => api<AgingResponse>(`/reports/executive/aging-detail?${fp}&page=${page}&limit=25`),
    enabled: canExec,
  });

  const branches = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api<{ id: string; name: string }[]>('/branches'),
    enabled: canExec,
  });

  const collectors = useQuery({
    queryKey: ['collectors-list'],
    queryFn: () => api<{ id: string; full_name: string }[]>('/reports/collectors'),
    enabled: canExec,
  });

  const hasFilters = !!(filters.from || filters.to || filters.branchId || filters.collectorId ||
    filters.currency || filters.customerStatus !== 'all' || filters.bucket);

  if (!canExec) {
    return (
      <div className="space-y-5">
        <PageHeader title="تفصيل أعمار الديون" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض تقارير أعمار الديون" /></Card>
      </div>
    );
  }

  const s = data.data?.summary;

  const sortIcon = (col: string) => {
    if ((filters.sortBy ?? 'total_balance') !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return filters.sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-brand-600" />
      : <ArrowDown className="h-3 w-3 text-brand-600" />;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تفصيل أعمار الديون" />

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-wrap">
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">من تاريخ</label>
            <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800" />
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">إلى تاريخ</label>
            <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800" />
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">الفرع</label>
            <select value={filters.branchId} onChange={(e) => setFilter('branchId', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="">جميع الفروع</option>
              {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">المحصل</label>
            <select value={filters.collectorId} onChange={(e) => setFilter('collectorId', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="">جميع المحصلين</option>
              {(collectors.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          <div className="min-w-[8rem]">
            <label className="mb-1 block text-xs text-concrete-500">العملة</label>
            <select value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="">جميع العملات</option>
              {Object.entries(CCY_AR).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
            </select>
          </div>
          <div className="min-w-[8rem]">
            <label className="mb-1 block text-xs text-concrete-500">حالة العميل</label>
            <select value={filters.customerStatus} onChange={(e) => setFilter('customerStatus', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">فئة التأخر</label>
            <select value={filters.bucket} onChange={(e) => setFilter('bucket', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="">جميع الفئات</option>
              {BUCKET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">ترتيب حسب</label>
            <select value={filters.sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="total_balance">الرصيد الكلي</option>
              <option value="days_overdue">أيام التأخر</option>
              <option value="customer_name">اسم العميل</option>
              <option value="d90_plus">90+</option>
              <option value="oldest_debt_date">تاريخ أقدم دين</option>
            </select>
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>مسح الفلاتر</Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="إجمالي المديونية" loading={data.isLoading}>
          <Money value={s?.totalDebt ?? 0} />
        </SummaryCard>
        <SummaryCard label="الديون الحالية" loading={data.isLoading}>
          <Money value={s?.currentDebt ?? 0} />
        </SummaryCard>
        <SummaryCard label="المديونية المتأخرة" loading={data.isLoading}>
          <Money value={s?.overdueDebt ?? 0} />
        </SummaryCard>
        <SummaryCard label="تأخر +90 يومًا" loading={data.isLoading}>
          <div><Money value={s?.overDue90Plus ?? 0} /></div>
        </SummaryCard>
        <SummaryCard label="عملاء متأخرون" loading={data.isLoading}>
          <span className="text-lg font-bold">{s?.overdueCustomers ?? 0}</span>
        </SummaryCard>
      </div>

      <Card>
        <CardHeader title="تفاصيل أعمار الديون" action={
          <div className="flex items-center gap-2">
            {data.data && <Badge>{data.data.total} عميل</Badge>}
            <Button variant="secondary" onClick={handleExport} disabled={exporting} className="text-xs">
              {exporting ? 'جاري...' : 'تصدير Excel'}
            </Button>
          </div>
        } />
        <div className="p-4">
          <DataState isLoading={data.isLoading} isError={data.isError} error={data.error}
            isEmpty={!data.data?.items?.length} emptyTitle="لا ديون" skeletonClassName="h-48">
            <div className="overflow-x-auto">
              <Table>
                <THead cols={[
                  'اسم العميل', 'الكود', 'الفرع', 'المحصل', 'العملة',
                  'الرصيد الكلي', 'حالي', '1–30', '31–60', '61–90', '90+',
                  'تاريخ أقدم دين', 'أيام التأخر',
                ]} />
                <tbody>
                  {(data.data?.items ?? []).map((r) => (
                    <TRow key={r.customerId + r.currency}>
                      <TD className="font-medium">{r.customerName}</TD>
                      <TD className="tnum text-concrete-500">{r.customerCode}</TD>
                      <TD>{r.branch}</TD>
                      <TD>{r.collector}</TD>
                      <TD><Badge tone="neutral">{r.currency}</Badge></TD>
                      <TD className="tnum font-bold"><Money value={r.totalBalance} currency={r.currency} /></TD>
                      <TD className="tnum"><Money value={r.current} currency={r.currency} /></TD>
                      <TD className="tnum"><Money value={r.d1_30} currency={r.currency} /></TD>
                      <TD className="tnum"><Money value={r.d31_60} currency={r.currency} /></TD>
                      <TD className="tnum"><Money value={r.d61_90} currency={r.currency} /></TD>
                      <TD className="tnum">{r.d90_plus > 0 ? <span className="text-debt-600 font-bold"><Money value={r.d90_plus} currency={r.currency} /></span> : <Money value={r.d90_plus} currency={r.currency} />}</TD>
                      <TD className="tnum text-xs">{r.oldestDebtDate ? new Date(r.oldestDebtDate).toLocaleDateString('ar') : '—'}</TD>
                      <TD className="tnum">{r.daysOverdue > 0 ? <Badge tone={r.daysOverdue > 90 ? 'hazard' : r.daysOverdue > 60 ? 'debt' : r.daysOverdue > 30 ? 'neutral' : 'pine'}>{r.daysOverdue}</Badge> : <span className="text-concrete-400">0</span>}</TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </div>
            {data.data && data.data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-concrete-500">
                <span>صفحة {data.data.page} / {data.data.totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
                  <Button variant="ghost" disabled={page >= data.data.totalPages}
                    onClick={() => setPage((p) => p + 1)}>التالي</Button>
                </div>
              </div>
            )}
          </DataState>
        </div>
      </Card>
    </div>
  );
}

function SummaryCard({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-medium text-concrete-500">{label}</p>
      {loading ? <Skeleton className="h-8 w-24" /> : <div>{children}</div>}
    </Card>
  );
}
