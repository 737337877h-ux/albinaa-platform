'use client';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, CalendarClock, ClipboardList, Coins, Download,
  HandCoins, History, User, UserCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, CCY_AR, PROMISE_STATUS_AR, COLLECTION_STATUS_AR } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, CardHeader, Badge, Money, Empty, Skeleton, Pagination, Select } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CustomerBasic {
  id: string;
  name: string;
  externalCustomerCode: string;
  isActive: boolean;
  createdAt: string;
  currentCollector: { id: string; fullName: string } | null;
}

interface BalanceItem {
  currencyCode: string;
  balance: number;
  openingBalance: number;
  collected: number;
  invoicesTotal: number;
}

interface TimelineEvent {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface FollowupItem {
  id: string;
  status: string;
  contactResult: string | null;
  notes: string | null;
  scheduledAt: string;
  completedAt: string | null;
  collector: { id: string; fullName: string };
}

interface PromiseItem {
  id: string;
  expectedAmount: number;
  currencyCode: string;
  status: string;
  dueDate: string;
  fulfilledAt: string | null;
  notes: string | null;
}

interface CollectionItem {
  id: string;
  amount: number;
  currencyCode: string;
  collectedAt: string;
  method: { name: string };
  collector: { id: string; fullName: string };
  status: string;
}

interface CustomerDetail {
  customer: CustomerBasic;
  balances: BalanceItem[];
  timeline: { items: TimelineEvent[] };
  followups: { items: FollowupItem[]; total: number };
  promises: { current: PromiseItem | null; upcoming: PromiseItem | null; items: PromiseItem[] };
  collections: { items: CollectionItem[]; total: number };
}

const TIMELINE_TYPE_AR: Record<string, string> = {
  created: 'إنشاء الحساب',
  balance_imported: 'استيراد رصيد',
  followup_done: 'متابعة',
  promise_created: 'وعد سداد',
  promise_fulfilled: 'تنفيذ الوعد',
  collection: 'تحصيل',
  transfer: 'نقل',
  note: 'ملاحظة',
};

export default function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const canRead = can('customers.read');
  const router = useRouter();

  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');
  const [stmtCurrency, setStmtCurrency] = useState('USD');

  const isNew = id === 'new';

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['customer-360', id],
    queryFn: () => api<CustomerDetail>(`/customers/${id}`),
    enabled: canRead && !isNew,
    retry: false,
  });

  const statementUrl = useMemo(() => {
    if (!id) return '#';
    const p = new URLSearchParams();
    if (stmtFrom) p.set('fromDate', stmtFrom);
    if (stmtTo) p.set('toDate', stmtTo);
    if (stmtCurrency) p.set('currency', stmtCurrency);
    return `/api/customers/${id}/statement?${p.toString()}`;
  }, [id, stmtFrom, stmtTo, stmtCurrency]);

  if (!canRead) {
    return (
      <div className="space-y-5">
        <PageHeader title="بيانات العميل" />
        <Card>
          <PermissionNotice message="لا تملك صلاحية عرض بيانات العملاء" />
        </Card>
      </div>
    );
  }

  if (isNew) {
    return (
      <div className="space-y-5">
        <PageHeader title="بيانات العميل" />
        <Card>
          <Empty title="صفحة إنشاء عميل قيد التنفيذ" hint="سيتم توفير نموذج إنشاء قريبًا" />
        </Card>
      </div>
    );
  }

  if (isError && (error as any)?.status === 404) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="العميل"
          action={
            <Button variant="ghost" onClick={() => router.back()} className="gap-1.5">
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
          }
        />
        <Card>
          <Empty title="العميل غير موجود" hint="ربما تم حذفه أو أن الرابط غير صحيح" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isLoading ? 'بيانات العميل' : `بيانات العميل — ${data?.customer?.name ?? ''}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.back()} className="gap-1.5">
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
            {data && (
              <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
                تحديث
              </Button>
            )}
          </div>
        }
      />

      <DataState
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => refetch()}
        isFetching={isFetching}
        isEmpty={false}
        emptyTitle=""
        skeletonClassName="h-96"
      >
        {data && (
          <div className="space-y-5">
            {/* البيانات الأساسية + الأرصدة */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* البيانات الأساسية */}
              <Card>
                <CardHeader
                  title="البيانات الأساسية"
                  action={
                    <Badge tone={data.customer.isActive ? 'pine' : 'neutral'}>
                      {data.customer.isActive ? 'نشط' : 'غير نشط'}
                    </Badge>
                  }
                />
                <div className="space-y-3 px-4 py-4">
                  <Row label="الاسم">
                    <span className="font-medium">{data.customer.name}</span>
                  </Row>
                  <Row label="الكود الخارجي">
                    <span className="tnum text-sm text-concrete-500">
                      {data.customer.externalCustomerCode || '—'}
                    </span>
                  </Row>
                  <Row label="المحصل">
                    {data.customer.currentCollector ? (
                      <span className="text-pine-700 dark:text-pine-100">
                        {data.customer.currentCollector.fullName}
                      </span>
                    ) : (
                      <span className="text-concrete-400">غير مسنّد</span>
                    )}
                  </Row>
                  <Row label="تاريخ الإنشاء">
                    <span className="tnum text-concrete-500">{fmtDate(data.customer.createdAt)}</span>
                  </Row>
                </div>
              </Card>

              {/* الأرصدة */}
              <Card>
                <CardHeader title="الأرصدة" />
                {data.balances.length === 0 ? (
                  <Empty title="لا أرصدة مسجّلة" />
                ) : (
                  <div className="divide-y divide-concrete-100 dark:divide-white/10">
                    {data.balances.map((b) => (
                      <div key={b.currencyCode} className="px-4 py-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-concrete-500">
                            {CCY_AR[b.currencyCode] ?? b.currencyCode}
                          </span>
                          <Badge tone="pine">{b.currencyCode}</Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-concrete-500">الرصيد الحالي</p>
                            <p
                              className={cn(
                                'tnum font-bold',
                                b.balance > 0 ? 'text-debt-600 dark:text-debt-400'
                                  : b.balance < 0 ? 'text-credit-600 dark:text-credit-400'
                                  : '',
                              )}
                              dir="ltr"
                            >
                              {fmtMoney(b.balance)} {b.currencyCode}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-concrete-500">الرصيد الافتتاحي</p>
                            <p className="tnum font-medium" dir="ltr">
                              {fmtMoney(b.openingBalance)} {b.currencyCode}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-concrete-500">الفواتير</p>
                            <p className="tnum font-medium" dir="ltr">
                              {fmtMoney(b.invoicesTotal)} {b.currencyCode}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-concrete-500">المحصّل</p>
                            <p className="tnum font-medium text-credit-600 dark:text-credit-400" dir="ltr">
                              {fmtMoney(b.collected)} {b.currencyCode}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* المتابعة الحالية + وعود السداد */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* المتابعة الحالية */}
              <Card>
                <CardHeader title="المتابعة الحالية" />
                <DataState
                  isLoading={false}
                  isError={false}
                  isEmpty={!data.followups?.items?.length}
                  emptyTitle="لا متابعات"
                  skeletonClassName="h-24"
                >
                  <div className="divide-y divide-concrete-100 dark:divide-white/10">
                    {data.followups?.items?.slice(0, 5).map((f) => (
                      <div key={f.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-concrete-500">{f.collector.fullName}</span>
                          <Badge
                            tone={
                              f.status === 'completed' ? 'credit'
                                : f.status === 'pending' ? 'pine'
                                : 'hazard'
                            }
                          >
                            {f.status === 'completed' ? 'مكتملة' : f.status === 'pending' ? 'معلّقة' : f.status}
                          </Badge>
                        </div>
                        {f.contactResult && (
                          <p className="mt-1 text-sm">{f.contactResult}</p>
                        )}
                        {f.notes && (
                          <p className="mt-0.5 text-xs text-concrete-500">{f.notes}</p>
                        )}
                        <p className="mt-1 text-xs text-concrete-400 tnum">
                          {f.scheduledAt && fmtDateTime(f.scheduledAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </DataState>
              </Card>

              {/* وعود السداد */}
              <Card>
                <CardHeader title="وعود السداد" />
                <DataState
                  isLoading={false}
                  isError={false}
                  isEmpty={!data.promises?.items?.length}
                  emptyTitle="لا وعود سداد"
                  skeletonClassName="h-24"
                >
                  <div className="space-y-3 px-4 py-4">
                    {data.promises.current && (
                      <div className="rounded-lg border border-hazard-200 bg-hazard-50/50 p-3 dark:border-hazard-700/30 dark:bg-hazard-900/10">
                        <p className="text-xs font-medium text-hazard-700 dark:text-hazard-300">الوعد الحالي</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="tnum font-bold" dir="ltr">
                            <Money value={data.promises.current.expectedAmount} currency={data.promises.current.currencyCode} />
                          </span>
                          <Badge tone="hazard">
                            {PROMISE_STATUS_AR[data.promises.current.status] ?? data.promises.current.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-concrete-500 tnum">
                          تاريخ الاستحقاق: {fmtDate(data.promises.current.dueDate)}
                        </p>
                      </div>
                    )}
                    {data.promises.upcoming && !data.promises.current && (
                      <div className="rounded-lg border border-pine-200 bg-pine-50/50 p-3 dark:border-pine-700/30 dark:bg-pine-900/10">
                        <p className="text-xs font-medium text-pine-700 dark:text-pine-300">الوعد القادم</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="tnum font-bold" dir="ltr">
                            <Money value={data.promises.upcoming.expectedAmount} currency={data.promises.upcoming.currencyCode} />
                          </span>
                          <Badge tone="pine">
                            {PROMISE_STATUS_AR[data.promises.upcoming.status] ?? data.promises.upcoming.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-concrete-500 tnum">
                          تاريخ الاستحقاق: {fmtDate(data.promises.upcoming.dueDate)}
                        </p>
                      </div>
                    )}
                    {!data.promises.current && !data.promises.upcoming && data.promises.items.length > 0 && (
                      <p className="text-xs text-concrete-500">لا وعود نشطة حاليًا</p>
                    )}
                  </div>
                </DataState>
              </Card>
            </div>

            {/* آخر التحصيلات */}
            <Card>
              <CardHeader
                title="آخر التحصيلات"
                action={
                  <Link href={`/collections?customerId=${id}`} className="text-xs text-pine-700 dark:text-pine-100">
                    الكل
                  </Link>
                }
              />
              <DataState
                isLoading={false}
                isError={false}
                isEmpty={!data.collections?.items?.length}
                emptyTitle="لا تحصيلات مسجّلة"
                skeletonClassName="h-32"
              >
                <Table>
                  <THead cols={['المبلغ', 'الطريقة', 'المحصل', 'التاريخ', 'الحالة']} />
                  <tbody>
                    {data.collections.items.slice(0, 10).map((c) => (
                      <TRow key={c.id}>
                        <TD>
                          <Money value={c.amount} currency={c.currencyCode} />
                        </TD>
                        <TD className="text-concrete-500">{c.method.name}</TD>
                        <TD className="text-concrete-500">{c.collector.fullName}</TD>
                        <TD className="tnum text-xs text-concrete-500">{fmtDateTime(c.collectedAt)}</TD>
                        <TD>
                          <Badge tone="neutral">
                            {COLLECTION_STATUS_AR[c.status] ?? c.status}
                          </Badge>
                        </TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              </DataState>
            </Card>

            {/* الخط الزمني */}
            <Card>
              <CardHeader title="الخط الزمني" />
              <DataState
                isLoading={false}
                isError={false}
                isEmpty={!data.timeline?.items?.length}
                emptyTitle="لا أحداث"
                skeletonClassName="h-48"
              >
                <div className="relative mr-4 border-r-2 border-concrete-100 dark:border-white/10">
                  <div className="space-y-0">
                    {data.timeline.items.map((ev, i) => (
                      <div key={ev.id} className="relative mr-6 py-3">
                        <div
                          className={cn(
                            'absolute -right-[calc(1.5rem+0.35rem)] top-3.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-iron-800',
                            i === 0 ? 'bg-pine-700 dark:bg-pine-500' : 'bg-concrete-300 dark:bg-concrete-500',
                          )}
                        />
                        <div>
                          <p className="text-xs font-medium text-concrete-500">
                            {TIMELINE_TYPE_AR[ev.type] ?? ev.type}
                          </p>
                          <p className="mt-0.5 text-sm">{ev.description}</p>
                          <p className="mt-0.5 text-xs text-concrete-400 tnum">{fmtDateTime(ev.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </DataState>
            </Card>

            {/* كشف الحساب */}
            <Card>
              <CardHeader title="كشف الحساب" />
              <div className="px-4 py-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[10rem]">
                    <label className="mb-1 block text-xs text-concrete-500">من تاريخ</label>
                    <input
                      type="date"
                      value={stmtFrom}
                      onChange={(e) => setStmtFrom(e.target.value)}
                      className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800 dark:text-concrete-100"
                    />
                  </div>
                  <div className="min-w-[10rem]">
                    <label className="mb-1 block text-xs text-concrete-500">إلى تاريخ</label>
                    <input
                      type="date"
                      value={stmtTo}
                      onChange={(e) => setStmtTo(e.target.value)}
                      className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-iron-800 dark:text-concrete-100"
                    />
                  </div>
                  <div className="min-w-[8rem]">
                    <label className="mb-1 block text-xs text-concrete-500">العملة</label>
                    <Select
                      value={stmtCurrency}
                      onChange={(e) => setStmtCurrency(e.target.value)}
                    >
                      <option value="USD">دولار</option>
                      <option value="YER">ريال يمني</option>
                      <option value="SAR">ريال سعودي</option>
                    </Select>
                  </div>
                  <a href={statementUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="gap-1.5">
                      <Download className="h-4 w-4" />
                      تحميل كشف الحساب
                    </Button>
                  </a>
                </div>
              </div>
            </Card>
          </div>
        )}
      </DataState>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-concrete-500">{label}</span>
      {children}
    </div>
  );
}
