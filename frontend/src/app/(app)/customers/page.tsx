'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtMoney } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Select, Pagination } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CustomerItem {
  id: string;
  externalCustomerCode: string;
  name: string;
  isActive: boolean;
  balances: { currencyCode: string; balance: number }[];
  currentCollector: { id: string; fullName: string } | null;
  createdAt: string;
}

interface CustomersResponse {
  items: CustomerItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Filters {
  search: string;
  currency: string;
  status: string;
  collectorId: string;
  sortBy: string;
  sortDir: string;
}

function buildQuery(f: Filters, page: number) {
  const p = new URLSearchParams();
  p.set('page', String(page));
  p.set('limit', '20');
  if (f.search) p.set('search', f.search);
  if (f.currency) p.set('currency', f.currency);
  if (f.status) p.set('status', f.status);
  if (f.collectorId) p.set('collectorId', f.collectorId);
  if (f.sortBy) p.set('sortBy', f.sortBy);
  if (f.sortDir) p.set('sortDir', f.sortDir);
  return `/customers?${p.toString()}`;
}

const CURRENCIES = ['USD', 'YER', 'SAR'];
const SORT_OPTIONS = [
  { value: 'name', label: 'الاسم' },
  { value: 'balance', label: 'الرصيد' },
] as const;

export default function CustomersPage() {
  const can = useCan();
  const canWrite = can('customers.write');
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    currency: '',
    status: '',
    collectorId: '',
    sortBy: 'name',
    sortDir: 'asc',
  });
  const [searchInput, setSearchInput] = useState('');

  const queryKey = useMemo(() => ['customers', page, filters], [page, filters]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api<CustomersResponse>(buildQuery(filters, page)),
  });

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput }));
    setPage(1);
  };

  const toggleSort = (field: string) => {
    setFilters((f) => {
      const nextSortDir = f.sortBy === field && f.sortDir === 'asc' ? 'desc' : 'asc';
      const nextCurrency = field === 'balance' && !f.currency ? 'SAR' : f.currency;
      return { ...f, sortBy: field, sortDir: nextSortDir, currency: nextCurrency };
    });
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setFilters({ search: '', currency: '', status: '', collectorId: '', sortBy: 'name', sortDir: 'asc' });
    setPage(1);
  };

  const hasActiveFilters = filters.search || filters.currency || filters.status || filters.collectorId;

  return (
    <div className="space-y-5">
      <PageHeader
        title="العملاء"
        action={
          canWrite ? (
            <Button onClick={() => router.push('/customers/new')}>
              <Plus className="h-4 w-4" />
              عميل جديد
            </Button>
          ) : undefined
        }
      />

      {!can('customers.read') ? (
        <Card>
          <PermissionNotice message="لا تملك صلاحية عرض قائمة العملاء" />
        </Card>
      ) : (
        <>
          {/* شريط البحث والفلاتر */}
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  placeholder="بحث بالاسم أو رقم العميل…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pr-9"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-concrete-400" />
              </div>
              <Button variant="secondary" onClick={handleSearch}>بحث</Button>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[8rem]">
                <label className="mb-1 block text-xs text-concrete-500">العملة</label>
                <Select
                  value={filters.currency}
                  onChange={(e) => { setFilters((f) => ({ ...f, currency: e.target.value })); setPage(1); }}
                >
                  <option value="">الكل</option>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>

              <div className="min-w-[8rem]">
                <label className="mb-1 block text-xs text-concrete-500">الحالة</label>
                <Select
                  value={filters.status}
                  onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
                >
                  <option value="">الكل</option>
                  <option value="true">نشط</option>
                  <option value="false">غير نشط</option>
                </Select>
              </div>

              <div className="min-w-[8rem]">
                <label className="mb-1 block text-xs text-concrete-500">ترتيب حسب</label>
                <Select
                  value={filters.sortBy}
                  onChange={(e) => { setFilters((f) => ({ ...f, sortBy: e.target.value })); setPage(1); }}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>

              <Button
                variant="ghost"
                onClick={() => toggleSort(filters.sortBy)}
                className="gap-1.5"
              >
                {filters.sortDir === 'asc' ? 'تصاعدي ↓' : 'تنازلي ↑'}
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters} className="gap-1 text-concrete-500">
                  <X className="h-3.5 w-3.5" />
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </Card>

          {/* عدد النتائج */}
          {data && (
            <p className="text-xs text-concrete-500">
              إجمالي النتائج: <span className="tnum font-medium">{data.total}</span>
            </p>
          )}

          {/* جدول العملاء */}
          <Card>
            <DataState
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={() => refetch()}
              isFetching={isFetching}
              isEmpty={!data?.items?.length}
              emptyTitle="لا نتائج"
              emptyHint={hasActiveFilters ? 'جرّب تغيير معايير البحث أو الفلاتر' : 'لا عملاء مسجّلين بعد'}
              skeletonClassName="h-64"
            >
              <div className="overflow-x-auto">
                <Table>
                  <THead cols={['الكود', 'اسم العميل', 'المحصل', ...CURRENCIES.map((c) => `الرصيد (${c})`), 'الحالة']} />
                  <tbody>
                    {(data?.items ?? []).map((customer) => {
                      const balanceByCurrency = customer.balances.reduce<Record<string, number>>((acc, bal) => {
                        acc[bal.currencyCode] = bal.balance;
                        return acc;
                      }, {});
                      return (
                        <TRow key={customer.id} onClick={() => router.push(`/customers/${customer.id}`)}>
                          <TD className="tnum text-xs text-concrete-500">{customer.externalCustomerCode || '—'}</TD>
                          <TD className="font-medium">{customer.name}</TD>
                          <TD className="text-concrete-500">{customer.currentCollector?.fullName ?? '—'}</TD>
                          {CURRENCIES.map((ccy) => {
                            const balance = balanceByCurrency[ccy];
                            const hasValue = balance !== undefined;
                            return (
                              <TD key={ccy}>
                                {hasValue ? (
                                  <span
                                    dir="ltr"
                                    className={cn(
                                      'tnum font-medium',
                                      balance > 0
                                        ? 'text-debt-600 dark:text-debt-400'
                                        : balance < 0
                                          ? 'text-credit-600 dark:text-credit-400'
                                          : '',
                                    )}
                                  >
                                    {fmtMoney(balance)} {ccy}
                                  </span>
                                ) : '—'}
                              </TD>
                            );
                          })}
                          <TD>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                customer.isActive
                                  ? 'bg-pine-50 text-pine-700 dark:bg-pine-900/30 dark:text-pine-100'
                                  : 'bg-concrete-100 text-concrete-500 dark:bg-white/10 dark:text-concrete-400',
                              )}
                            >
                              {customer.isActive ? 'نشط' : 'غير نشط'}
                            </span>
                          </TD>
                        </TRow>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {/* Pagination */}
              {data && (
                <div className="border-t border-concrete-100 dark:border-white/10">
                  <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
                </div>
              )}
            </DataState>
          </Card>
        </>
      )}
    </div>
  );
}
