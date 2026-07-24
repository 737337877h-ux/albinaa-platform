'use client';
import { useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, CardHeader, Badge, Money, Skeleton } from '@/components/ui/primitives';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { DataState, PermissionNotice } from '@/components/ui/data-state';

interface CollectorRow {
  collectorId: string;
  collector: string;
  customerCount: number;
  todayCollected: number;
  weekCollected: number;
  monthCollected: number;
  collectionsCount: number;
  followupCount: number;
  promiseCount: number;
  fulfilledCount: number;
  outstandingBalance: number;
  fulfillmentRate: number;
  collectionRate: number;
}

interface CollectorsResponse {
  items: CollectorRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalCollectors: number;
    totalCollected: number;
    avgFulfillmentRate: number;
    totalCustomers: number;
    topPerformer: string | null;
  };
}

interface FilterState {
  from: string;
  to: string;
  branchId: string;
  collectorId: string;
  collectorStatus: string;
  sortBy: string;
  sortDir: string;
}

const SORT_COLUMNS = [
  { value: 'collector_name', label: 'المحصل' },
  { value: 'customers', label: 'العملاء' },
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'collections_count', label: 'التحصيلات' },
  { value: 'outstanding_balance', label: 'الرصيد المعلق' },
  { value: 'fulfillment_rate', label: 'نسبة الوفاء' },
  { value: 'collection_rate', label: 'نسبة التحصيل' },
];

function readFilters(sp: URLSearchParams): FilterState {
  return {
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    branchId: sp.get('branchId') ?? '',
    collectorId: sp.get('collectorId') ?? '',
    collectorStatus: sp.get('collectorStatus') ?? 'active',
    sortBy: sp.get('sortBy') ?? 'month',
    sortDir: sp.get('sortDir') ?? 'desc',
  };
}

function buildParams(f: FilterState) {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.branchId) p.set('branchId', f.branchId);
  if (f.collectorId) p.set('collectorId', f.collectorId);
  if (f.collectorStatus && f.collectorStatus !== 'all') p.set('collectorStatus', f.collectorStatus);
  p.set('sortBy', f.sortBy);
  p.set('sortDir', f.sortDir);
  return p.toString();
}

export default function CollectorsPerformancePage() {
  const can = useCan();
  const canExec = can('reports.executive');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const fp = useMemo(() => buildParams(filters), [filters]);
  const [page, setPage] = useState(1);

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
    const isCurrentSort = (filters.sortBy ?? 'month') === col;
    const newDir = isCurrentSort && filters.sortDir === 'desc' ? 'asc' : 'desc';
    next.set('sortBy', col);
    next.set('sortDir', newDir);
    setPage(1);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [router, pathname, searchParams, filters.sortBy, filters.sortDir]);

  const data = useQuery<CollectorsResponse>({
    queryKey: ['r-collectors-detail', fp, page],
    queryFn: () => api<CollectorsResponse>(`/reports/executive/top-collectors?${fp}&page=${page}&limit=25`),
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

  const hasFilters = !!(filters.from || filters.to || filters.branchId || filters.collectorId || filters.collectorStatus !== 'active');

  if (!canExec) {
    return (
      <div className="space-y-5">
        <PageHeader title="أداء المحصلين" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض تقارير أداء المحصلين" /></Card>
      </div>
    );
  }

  const s = data.data?.summary;

  const sortIcon = (col: string) => {
    if ((filters.sortBy ?? 'month') !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return filters.sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-brand-600" />
      : <ArrowDown className="h-3 w-3 text-brand-600" />;
  };

  const pct = (v: number) => `${v.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <PageHeader title="أداء المحصلين" />

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
            <label className="mb-1 block text-xs text-concrete-500">حالة المحصل</label>
            <select value={filters.collectorStatus} onChange={(e) => setFilter('collectorStatus', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">ترتيب حسب</label>
            <select value={filters.sortBy} onChange={(e) => setFilter('sortBy', e.target.value)}
              className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800">
              {SORT_COLUMNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>مسح الفلاتر</Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="إجمالي المحصلين" loading={data.isLoading}>
          <span className="text-lg font-bold">{s?.totalCollectors ?? 0}</span>
        </SummaryCard>
        <SummaryCard label="إجمالي التحصيل" loading={data.isLoading}>
          <Money value={s?.totalCollected ?? 0} />
        </SummaryCard>
        <SummaryCard label="متوسط نسبة الوفاء" loading={data.isLoading}>
          <span className="text-lg font-bold">{pct(s?.avgFulfillmentRate ?? 0)}</span>
        </SummaryCard>
        <SummaryCard label="إجمالي العملاء" loading={data.isLoading}>
          <span className="text-lg font-bold">{s?.totalCustomers ?? 0}</span>
        </SummaryCard>
        <SummaryCard label="أفضل أداء" loading={data.isLoading}>
          <span className="text-sm font-bold">{s?.topPerformer ?? '—'}</span>
        </SummaryCard>
      </div>

      <Card>
        <CardHeader title="أداء المحصلين" action={
          data.data ? <Badge>{data.data.total} محصل</Badge> : undefined
        } />
        <div className="p-4">
          <DataState isLoading={data.isLoading} isError={data.isError} error={data.error}
            isEmpty={!data.data?.items?.length} emptyTitle="لا محصلين" skeletonClassName="h-48">
            <div className="overflow-x-auto">
              <Table>
                <THead cols={[
                  'المحصل', 'العملاء', 'اليوم', 'الأسبوع', 'الشهر',
                  'التحصيلات', 'المتابعات', 'الوعود', 'الموفيّة',
                  'نسبة الوفاء', 'الرصيد المعلق', 'نسبة التحصيل',
                ]} />
                <tbody>
                  {(data.data?.items ?? []).map((r) => (
                    <TRow key={r.collectorId}>
                      <TD className="font-medium">{r.collector}</TD>
                      <TD className="tnum">{r.customerCount}</TD>
                      <TD className="tnum"><Money value={r.todayCollected} /></TD>
                      <TD className="tnum"><Money value={r.weekCollected} /></TD>
                      <TD className="tnum font-bold"><Money value={r.monthCollected} /></TD>
                      <TD className="tnum">{r.collectionsCount}</TD>
                      <TD className="tnum">{r.followupCount}</TD>
                      <TD className="tnum">{r.promiseCount}</TD>
                      <TD className="tnum">{r.fulfilledCount}</TD>
                      <TD className="tnum">
                        <Badge tone={r.fulfillmentRate >= 70 ? 'credit' : r.fulfillmentRate >= 40 ? 'neutral' : 'hazard'}>
                          {pct(r.fulfillmentRate)}
                        </Badge>
                      </TD>
                      <TD className="tnum"><Money value={r.outstandingBalance} /></TD>
                      <TD className="tnum">
                        <span className={r.collectionRate > 0 ? 'font-bold text-pine-600' : 'text-concrete-400'}>
                          {pct(r.collectionRate)}
                        </span>
                      </TD>
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
