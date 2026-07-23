'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDate, fmtMoney, CCY_AR, PROMISE_STATUS_AR } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Select, Field, Textarea, Badge, Pagination } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Customer { id: string; name: string; externalCustomerCode: string; }
interface Collector { user: { fullName: string }; }

interface PromiseItem {
  id: string;
  customerId: string;
  collectorId: string;
  promiseDate: string;
  dueDate: string;
  expectedAmount: number;
  currencyCode: string;
  status: string;
  statusReason: string | null;
  fulfilledAmount: number | null;
  notes: string | null;
  customer: Customer;
  collector: Collector;
}

interface PromisesResponse {
  items: PromiseItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Filters {
  customerId: string;
  status: string;
  dueFrom: string;
  dueTo: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'جميع الحالات' },
  { value: 'upcoming', label: 'قادم' },
  { value: 'due_today', label: 'مستحق اليوم' },
  { value: 'fulfilled', label: 'منفذ' },
  { value: 'partially_fulfilled', label: 'منفذ جزئيًا' },
  { value: 'unfulfilled', label: 'غير منفذ' },
  { value: 'postponed', label: 'مؤجل' },
  { value: 'cancelled_approved', label: 'ملغى' },
];

const STATUS_TONE: Record<string, 'pine' | 'hazard' | 'credit' | 'neutral' | 'debt'> = {
  upcoming: 'pine',
  due_today: 'hazard',
  fulfilled: 'credit',
  partially_fulfilled: 'pine',
  unfulfilled: 'hazard',
  postponed: 'neutral',
  cancelled_approved: 'neutral',
};

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function PromisesPage() {
  const can = useCan();
  const canWrite = can('promises.create');
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    customerId: '',
    status: '',
    dueFrom: '',
    dueTo: '',
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<PromiseItem | null>(null);
  const [statusItem, setStatusItem] = useState<PromiseItem | null>(null);

  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', '25');
    if (filters.customerId) p.set('customerId', filters.customerId);
    if (filters.status) p.set('status', filters.status);
    if (filters.dueFrom) p.set('dueFrom', filters.dueFrom);
    if (filters.dueTo) p.set('dueTo', filters.dueTo);
    return `/payment-promises?${p.toString()}`;
  }, [page, filters]);

  const promises = useQuery({
    queryKey: ['payment-promises', queryStr],
    queryFn: () => api<PromisesResponse>(queryStr),
  });

  if (!can('customers.read')) {
    return (
      <div className="space-y-5">
        <PageHeader title="وعود السداد" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض وعود السداد" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="وعود السداد"
        action={canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            وعد جديد
          </Button>
        ) : undefined}
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="رقم العميل">
            <Input
              placeholder="معرف العميل…"
              value={filters.customerId}
              onChange={(e) => { setFilters((f) => ({ ...f, customerId: e.target.value })); setPage(1); }}
              className="w-48"
            />
          </Field>
          <Field label="الحالة">
            <Select
              value={filters.status}
              onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="استحقاق من">
            <Input
              type="date"
              value={filters.dueFrom}
              onChange={(e) => { setFilters((f) => ({ ...f, dueFrom: e.target.value })); setPage(1); }}
            />
          </Field>
          <Field label="استحقاق إلى">
            <Input
              type="date"
              value={filters.dueTo}
              onChange={(e) => { setFilters((f) => ({ ...f, dueTo: e.target.value })); setPage(1); }}
            />
          </Field>
        </div>
      </Card>

      {promises.data && (
        <p className="text-xs text-concrete-500">
          إجمالي النتائج: <span className="tnum font-medium">{promises.data.total}</span>
        </p>
      )}

      <Card>
        <DataState
          isLoading={promises.isLoading}
          isError={promises.isError}
          error={promises.error}
          onRetry={() => promises.refetch()}
          isFetching={promises.isFetching}
          isEmpty={!promises.data?.items?.length}
          emptyTitle="لا وعود سداد"
          emptyHint="ابدأ بتسجيل وعد سداد جديد لأحد العملاء"
          skeletonClassName="h-64"
        >
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['العميل', 'المبلغ', 'الحالة', 'الاستحقاق', 'المحصل', 'إجراءات']} />
              <tbody>
                {(promises.data?.items ?? []).map((p) => (
                  <TRow key={p.id}>
                    <TD>
                      <Link href={`/customers/${p.customerId}`} className="text-sm font-medium text-pine-700 hover:underline dark:text-pine-100">
                        {p.customer.name}
                      </Link>
                      <span className="mr-1 text-xs text-concrete-400">{p.customer.externalCustomerCode}</span>
                    </TD>
                    <TD>
                      <span className="tnum text-sm font-bold" dir="ltr">
                        {fmtMoney(p.expectedAmount)} {p.currencyCode}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>
                        {PROMISE_STATUS_AR[p.status] ?? p.status}
                      </Badge>
                    </TD>
                    <TD className="tnum text-xs text-concrete-500">{fmtDate(p.dueDate)}</TD>
                    <TD className="text-sm text-concrete-500">{p.collector.user.fullName}</TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        {canWrite && (
                          <>
                            <button
                              onClick={() => setEditItem(p)}
                              className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-pine-600 dark:hover:bg-white/10"
                              aria-label="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setStatusItem(p)}
                              className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-hazard-600 dark:hover:bg-white/10"
                              aria-label="تغيير الحالة"
                              title="تغيير الحالة"
                            >
                              <CalendarClock className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </div>

          {promises.data && (
            <div className="border-t border-concrete-100 dark:border-white/10">
              <Pagination page={promises.data.page} totalPages={promises.data.totalPages} onPage={setPage} />
            </div>
          )}
        </DataState>
      </Card>

      {createOpen && (
        <PromiseFormDialog onClose={() => setCreateOpen(false)} />
      )}

      {editItem && (
        <PromiseFormDialog initial={editItem} onClose={() => setEditItem(null)} />
      )}

      {statusItem && (
        <PromiseStatusDialog item={statusItem} onClose={() => setStatusItem(null)} />
      )}
    </div>
  );
}

/* ─── Create / Edit Dialog ─────────────────────────────────────────── */
function PromiseFormDialog({ initial, onClose }: { initial?: PromiseItem; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '');
  const [expectedAmount, setExpectedAmount] = useState(String(initial?.expectedAmount ?? ''));
  const [currencyCode, setCurrencyCode] = useState(initial?.currencyCode ?? 'YER');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return api(`/payment-promises/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            dueDate: dueDate || undefined,
            expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
            notes: notes || undefined,
          }),
        });
      }
      return api('/payment-promises', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          dueDate,
          expectedAmount: Number(expectedAmount),
          currencyCode,
          notes: notes || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast(isEdit ? 'تم تعديل الوعد' : 'تم تسجيل الوعد');
      qc.invalidateQueries({ queryKey: ['payment-promises'] });
      onClose();
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err');
    },
  });

  const canSubmit = isEdit
    ? (dueDate || expectedAmount)
    : (customerId && dueDate && expectedAmount);

  return (
    <Dialog open onClose={onClose} title={isEdit ? 'تعديل الوعد' : 'وعد سداد جديد'}>
      <div className="space-y-4">
        {!isEdit && (
          <Field label="العميل" error={!customerId && mutation.isError ? 'إلزامي' : undefined}>
            <Input
              placeholder="معرف العميل (UUID)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            />
          </Field>
        )}

        <Field label="تاريخ الاستحقاق">
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ المتوقع">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
            />
          </Field>

          {!isEdit && (
            <Field label="العملة">
              <Select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                <option value="YER">ريال يمني</option>
                <option value="SAR">ريال سعودي</option>
                <option value="USD">دولار</option>
              </Select>
            </Field>
          )}
        </div>

        <Field label="ملاحظات">
          <Textarea
            rows={3}
            placeholder="ملاحظات إضافية…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {isEdit ? 'حفظ التعديلات' : 'تسجيل الوعد'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ─── Status Change Dialog ─────────────────────────────────────────── */
const OPEN_STATUSES = new Set(['upcoming', 'due_today', 'partially_fulfilled']);

function PromiseStatusDialog({ item, onClose }: { item: PromiseItem; onClose: () => void }) {
  const qc = useQueryClient();
  const isOpen = OPEN_STATUSES.has(item.status);

  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [fulfilledAmount, setFulfilledAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const allowedTransitions: Record<string, string[]> = {
    upcoming: ['fulfilled', 'partially_fulfilled', 'unfulfilled', 'cancelled_approved', 'postponed'],
    due_today: ['fulfilled', 'partially_fulfilled', 'unfulfilled', 'cancelled_approved', 'postponed'],
    partially_fulfilled: ['fulfilled', 'partially_fulfilled', 'unfulfilled', 'cancelled_approved', 'postponed'],
  };

  const transitions = allowedTransitions[item.status] ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { status };
      if (reason) body.reason = reason;
      if (status === 'partially_fulfilled') body.fulfilledAmount = Number(fulfilledAmount);
      if (status === 'postponed') body.newDueDate = newDueDate;
      return api(`/payment-promises/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast('تم تحديث حالة الوعد');
      qc.invalidateQueries({ queryKey: ['payment-promises'] });
      onClose();
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err');
    },
  });

  const needsReason = ['unfulfilled', 'cancelled_approved', 'postponed'].includes(status);
  const canSubmit = status && (!needsReason || reason) &&
    (status !== 'partially_fulfilled' || (fulfilledAmount && Number(fulfilledAmount) > 0 && Number(fulfilledAmount) < Number(item.expectedAmount))) &&
    (status !== 'postponed' || newDueDate);

  if (!isOpen) {
    return (
      <Dialog open onClose={onClose} title="حالة الوعد">
        <p className="text-sm text-concrete-600 dark:text-concrete-300">
          هذا الوعد بحالة <strong>{PROMISE_STATUS_AR[item.status]}</strong> — لا يمكن تغيير الحالات النهائية.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="تغيير حالة الوعد">
      <div className="space-y-4">
        <div className="rounded-lg bg-concrete-50 p-3 text-sm dark:bg-white/5">
          <p className="font-medium">{item.customer.name}</p>
          <p className="tnum text-concrete-500">
            {fmtMoney(item.expectedAmount)} {item.currencyCode} — استحقاق: {fmtDate(item.dueDate)}
          </p>
        </div>

        <Field label="الحالة الجديدة">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">اختر الحالة…</option>
            {transitions.map((s) => (
              <option key={s} value={s}>{PROMISE_STATUS_AR[s]}</option>
            ))}
          </Select>
        </Field>

        {status === 'partially_fulfilled' && (
          <Field label={`المبلغ المنفذ (أقل من ${fmtMoney(Number(item.expectedAmount))})`}>
            <Input
              type="number"
              min="0.01"
              max={Number(item.expectedAmount) - 0.01}
              step="0.01"
              placeholder="0.00"
              value={fulfilledAmount}
              onChange={(e) => setFulfilledAmount(e.target.value)}
            />
          </Field>
        )}

        {status === 'postponed' && (
          <Field label="موعد الاستحقاق الجديد">
            <Input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
            />
          </Field>
        )}

        {needsReason && (
          <Field label="السبب" error={!reason && mutation.isError ? 'إلزامي' : undefined}>
            <Textarea
              rows={3}
              placeholder="اذكر السبب…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            تحديث الحالة
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
