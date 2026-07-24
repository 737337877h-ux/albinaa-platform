'use client';
import { useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  Tooltip, Legend,
} from 'chart.js';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { CCY_AR, PROMISE_STATUS_AR } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, CardHeader, Badge, Money, Skeleton } from '@/components/ui/primitives';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { DataState, PermissionNotice } from '@/components/ui/data-state';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

interface FilterState {
  from: string;
  to: string;
  branchId: string;
  currency: string;
  customerStatus: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function readFilters(sp: URLSearchParams): FilterState {
  return {
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    branchId: sp.get('branchId') ?? '',
    currency: sp.get('currency') ?? '',
    customerStatus: sp.get('customerStatus') ?? 'all',
  };
}

function buildParams(f: FilterState) {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.branchId) p.set('branchId', f.branchId);
  if (f.currency) p.set('currency', f.currency);
  if (f.customerStatus && f.customerStatus !== 'all') p.set('customerStatus', f.customerStatus);
  return p.toString();
}

export default function ReportsPage() {
  const can = useCan();
  const canExec = can('reports.executive');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const fp = useMemo(() => buildParams(filters), [filters]);

  const setFilter = useCallback((key: keyof FilterState, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const kpis = useQuery({
    queryKey: ['r-kpis', fp],
    queryFn: () => api<any>(`/reports/executive/kpis?${fp}`),
    enabled: canExec,
  });

  const collections = useQuery({
    queryKey: ['r-collections', fp],
    queryFn: () => api<any[]>(`/reports/executive/collections-monthly?groupBy=month&${fp}`),
    enabled: canExec,
  });

  const debtByBranch = useQuery({
    queryKey: ['r-debt-branch', fp],
    queryFn: () => api<any[]>(`/reports/executive/debt-by-branch?${fp}`),
    enabled: canExec,
  });

  const aging = useQuery({
    queryKey: ['r-aging', fp],
    queryFn: () => api<Record<string, { total: number; customers: number }>>(`/reports/executive/aging?${fp}`),
    enabled: canExec,
  });

  const topCollectors = useQuery({
    queryKey: ['r-collectors', fp],
    queryFn: () => api<any[]>(`/reports/executive/top-collectors?${fp}`),
    enabled: canExec,
  });

  const methods = useQuery({
    queryKey: ['r-methods', fp],
    queryFn: () => api<any[]>(`/reports/executive/collections-by-method?${fp}`),
    enabled: canExec,
  });

  const promises = useQuery({
    queryKey: ['r-promises', fp],
    queryFn: () => api<any[]>(`/reports/executive/promises-by-status?${fp}`),
    enabled: canExec,
  });

  const followups = useQuery({
    queryKey: ['r-followups', fp],
    queryFn: () => api<any>(`/reports/executive/followups-summary?${fp}`),
    enabled: canExec,
  });

  const [unfollowedPage, setUnfollowedPage] = useState(1);

  const unfollowed = useQuery({
    queryKey: ['r-unfollowed', fp, unfollowedPage],
    queryFn: () => api<PaginatedResponse<{ id: string; name: string; code: string }>>(`/reports/executive/unfollowed-customers?${fp}${fp ? '&' : ''}page=${unfollowedPage}&limit=20`),
    enabled: canExec,
  });

  const branches = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api<{ id: string; name: string }[]>('/branches'),
    enabled: canExec,
  });

  if (!canExec) {
    return (
      <div className="space-y-5">
        <PageHeader title="التقارير التنفيذية" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض التقارير التنفيذية" /></Card>
      </div>
    );
  }

  const d = kpis.data;
  const hasFilters = !!(filters.from || filters.to || filters.branchId || filters.currency || filters.customerStatus !== 'all');

  return (
    <div className="space-y-6">
      <PageHeader title="التقارير التنفيذية" />

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
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>مسح الفلاتر</Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="إجمالي المديونية" loading={kpis.isLoading}>
          {d && d.debtByCurrency?.length > 0
            ? d.debtByCurrency.map((r: any) => (
                <div key={r.currency} className="text-sm">
                  <Money value={r.total} currency={r.currency} />
                </div>
              ))
            : <Money value={d?.totalDebt ?? 0} />
          }
        </KPICard>
        <KPICard label="إجمالي التحصيل" loading={kpis.isLoading}>
          <Money value={d?.totalCollected ?? 0} />
        </KPICard>
        <KPICard label="نسبة التحصيل" loading={kpis.isLoading}>
          <span className="text-lg font-bold">{(d?.collectionRate ?? 0).toFixed(1)}%</span>
        </KPICard>
        <KPICard label="العملاء" loading={kpis.isLoading}>
          <div className="text-sm">المدينون: <span className="font-bold text-debt-600">{d?.debtors ?? 0}</span></div>
          <div className="text-sm">الدائنون: <span className="font-bold text-pine-600">{d?.creditors ?? 0}</span></div>
          <div className="text-sm">رصيد صفر: {d?.zeroBalance ?? 0}</div>
        </KPICard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="الوعود" loading={kpis.isLoading}>
          <div className="text-sm">الكل: {d?.promisesCount ?? 0}</div>
          <div className="text-sm text-debt-600">المتأخرة: {d?.overduePromises ?? 0}</div>
        </KPICard>
        <KPICard label="المتابعات" loading={kpis.isLoading}>
          <div className="text-sm">اليوم: {d?.followupsToday ?? 0}</div>
        </KPICard>
        <KPICard label="المتابعات القادمة" loading={followups.isLoading}>
          <div className="text-sm">{followups.data?.upcoming ?? 0}</div>
        </KPICard>
        <KPICard label="المتابعات المتأخرة" loading={followups.isLoading}>
          <div className="text-sm text-debt-600">{followups.data?.overdue ?? 0}</div>
        </KPICard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="التحصيل الشهري" />
          <div className="p-4">
            <DataState isLoading={collections.isLoading} isError={collections.isError} error={collections.error}
              isEmpty={!collections.data?.length} emptyTitle="لا بيانات" skeletonClassName="h-64">
              <div className="h-64">
                <Bar data={{
                  labels: (collections.data ?? []).map((r: any) => r.period),
                  datasets: [{ label: 'التحصيل', data: (collections.data ?? []).map((r: any) => r.total),
                    backgroundColor: 'rgba(34,120,80,0.7)' }],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true } },
                }} />
              </div>
            </DataState>
          </div>
        </Card>

        <Card>
          <CardHeader title="المديونية حسب الفرع" />
          <div className="p-4">
            <DataState isLoading={debtByBranch.isLoading} isError={debtByBranch.isError} error={debtByBranch.error}
              isEmpty={!debtByBranch.data?.length} emptyTitle="لا بيانات" skeletonClassName="h-64">
              <div className="h-64">
                <Doughnut data={{
                  labels: (debtByBranch.data ?? []).map((r: any) => r.branch),
                  datasets: [{ data: (debtByBranch.data ?? []).map((r: any) => r.total),
                    backgroundColor: ['#227850', '#E5724A', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'] }],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
                }} />
              </div>
            </DataState>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="أداء المحصلين" />
          <div className="p-4">
            <DataState isLoading={topCollectors.isLoading} isError={topCollectors.isError} error={topCollectors.error}
              isEmpty={!topCollectors.data?.length} emptyTitle="لا محصلين" skeletonClassName="h-48">
              <div className="h-64">
                <Bar data={{
                  labels: (topCollectors.data ?? []).map((r: any) => r.collector),
                  datasets: [{ label: 'التحصيل', data: (topCollectors.data ?? []).map((r: any) => r.monthCollected),
                    backgroundColor: 'rgba(59,130,246,0.7)' }],
                }} options={{
                  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                  plugins: { legend: { display: false } },
                  scales: { x: { beginAtZero: true } },
                }} />
              </div>
            </DataState>
          </div>
        </Card>

        <Card>
          <CardHeader title="أعمار الديون" />
          <div className="p-4">
            <DataState isLoading={aging.isLoading} isError={aging.isError} error={aging.error}
              isEmpty={!aging.data || Object.values(aging.data).every((v: any) => v.total === 0)}
              emptyTitle="لا ديون" skeletonClassName="h-48">
              <Table>
                <THead cols={['الفئة', 'الإجمالي', 'عدد العملاء']} />
                <tbody>
                  {Object.entries(aging.data ?? {}).map(([k, v]: [string, any]) => (
                    <TRow key={k}>
                      <TD><Badge tone={k === 'settled' ? 'credit' : 'neutral'}>{agingLabel(k)}</Badge></TD>
                      <TD><Money value={v.total} /></TD>
                      <TD className="tnum">{v.customers}</TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </DataState>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="التحصيل حسب طريقة الدفع" />
          <div className="p-4">
            <DataState isLoading={methods.isLoading} isError={methods.isError} error={methods.error}
              isEmpty={!methods.data?.length} emptyTitle="لا بيانات" skeletonClassName="h-48">
              <Table>
                <THead cols={['الطريقة', 'الإجمالي', 'عدد']} />
                <tbody>
                  {(methods.data ?? []).map((m: any, i: number) => (
                    <TRow key={i}>
                      <TD className="font-medium">{m.method}</TD>
                      <TD><Money value={m.total} /></TD>
                      <TD className="tnum">{m.count}</TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </DataState>
          </div>
        </Card>

        <Card>
          <CardHeader title="الوعود حسب الحالة" />
          <div className="p-4">
            <DataState isLoading={promises.isLoading} isError={promises.isError} error={promises.error}
              isEmpty={!promises.data?.length} emptyTitle="لا وعود" skeletonClassName="h-48">
              <Table>
                <THead cols={['الحالة', 'العدد', 'الإجمالي']} />
                <tbody>
                  {(promises.data ?? []).map((p: any, i: number) => (
                    <TRow key={i}>
                      <TD><Badge tone={promiseTone(p.status)}>{PROMISE_STATUS_AR[p.status] ?? p.status}</Badge></TD>
                      <TD className="tnum">{p.count}</TD>
                      <TD><Money value={p.total} /></TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </DataState>
          </div>
        </Card>
      </div>

      {followups.data && (followups.data.byType.length > 0 || followups.data.byResult.length > 0) && (
        <div className="grid gap-5 xl:grid-cols-2">
          {followups.data.byType.length > 0 && (
            <Card>
              <CardHeader title="المتابعات حسب النوع" />
              <div className="p-4">
                <Table>
                  <THead cols={['النوع', 'العدد']} />
                  <tbody>
                    {followups.data.byType.map((t: any, i: number) => (
                      <TRow key={i}><TD>{t.type}</TD><TD className="tnum">{t.count}</TD></TRow>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
          {followups.data.byResult.length > 0 && (
            <Card>
              <CardHeader title="المتابعات حسب النتيجة" />
              <div className="p-4">
                <Table>
                  <THead cols={['النتيجة', 'العدد']} />
                  <tbody>
                    {followups.data.byResult.map((r: any, i: number) => (
                      <TRow key={i}><TD>{r.result}</TD><TD className="tnum">{r.count}</TD></TRow>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}

      {unfollowed.data && unfollowed.data.items.length > 0 && (
        <Card>
          <CardHeader title="عملاء بدون متابعة" action={<Badge tone="hazard">{unfollowed.data.total}</Badge>} />
          <div className="p-4">
            <Table>
              <THead cols={['الاسم', 'الكود']} />
              <tbody>
                {unfollowed.data.items.map((c) => (
                  <TRow key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="tnum text-concrete-500">{c.code}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
            {unfollowed.data.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-concrete-500">
                <span>صفحة {unfollowed.data.page} / {unfollowed.data.totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={unfollowed.data.page <= 1}
                    onClick={() => setUnfollowedPage((p) => Math.max(1, p - 1))}>السابق</Button>
                  <Button variant="ghost" disabled={unfollowed.data.page >= unfollowed.data.totalPages}
                    onClick={() => setUnfollowedPage((p) => p + 1)}>التالي</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function KPICard({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-medium text-concrete-500">{label}</p>
      {loading ? <Skeleton className="h-8 w-24" /> : <div>{children}</div>}
    </Card>
  );
}

function agingLabel(k: string) {
  const map: Record<string, string> = {
    settled: 'غير مستحق', '1-30': '1–30 يومًا', '31-60': '31–60 يومًا',
    '61-90': '61–90 يومًا', '91-180': '91–180 يومًا', '180+': 'أكثر من 180 يومًا',
  };
  return map[k] ?? k;
}

function promiseTone(s: string): 'pine' | 'hazard' | 'credit' | 'neutral' | 'debt' {
  if (s === 'fulfilled') return 'credit';
  if (s === 'unfulfilled' || s === 'cancelled_approved') return 'hazard';
  if (s === 'partially_fulfilled') return 'debt';
  return 'neutral';
}
