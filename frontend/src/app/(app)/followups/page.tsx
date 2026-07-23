'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Select, Field, Textarea, Pagination } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface FollowupType { id: string; name: string; }
interface FollowupResult { id: string; name: string; }
interface Customer { id: string; name: string; externalCustomerCode: string; }
interface User { fullName: string; }

interface FollowupItem {
  id: string;
  customerId: string;
  userId: string;
  typeId: string;
  resultId: string;
  followupAt: string;
  notes: string | null;
  nextFollowupDate: string | null;
  expectedAmount: number | null;
  expectedCurrency: string | null;
  type: { name: string };
  result: { name: string };
  user: User;
  customer: Customer;
}

interface FollowupsResponse {
  items: FollowupItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Filters {
  customerId: string;
  collectorId: string;
  fromDate: string;
  toDate: string;
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function FollowupsPage() {
  const can = useCan();
  const canWrite = can('followups.create');
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({
    customerId: '',
    collectorId: '',
    fromDate: '',
    toDate: '',
  });

  /* ── Dialogs ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<FollowupItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<FollowupItem | null>(null);

  /* ── Query string ── */
  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', '25');
    if (filters.customerId) p.set('customerId', filters.customerId);
    if (filters.collectorId) p.set('collectorUserId', filters.collectorId);
    if (filters.fromDate) p.set('fromDate', filters.fromDate);
    if (filters.toDate) p.set('toDate', filters.toDate);
    return `/followups?${p.toString()}`;
  }, [page, filters]);

  /* ── Queries ── */
  const followups = useQuery({
    queryKey: ['followups', queryStr],
    queryFn: () => api<FollowupsResponse>(queryStr),
  });

  const followupTypes = useQuery({
    queryKey: ['followup-types'],
    queryFn: () => api<FollowupType[]>('/followups/types'),
  });

  const followupResults = useQuery({
    queryKey: ['followup-results'],
    queryFn: () => api<FollowupResult[]>('/followups/results'),
  });

  /* ── Delete mutation ── */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/followups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('تم حذف المتابعة');
      qc.invalidateQueries({ queryKey: ['followups'] });
      setDeleteItem(null);
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'فشل الحذف', 'err');
    },
  });

  /* ── Permission guard ── */
  if (!can('customers.read')) {
    return (
      <div className="space-y-5">
        <PageHeader title="المتابعات" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض المتابعات" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="المتابعات"
        action={canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            متابعة جديدة
          </Button>
        ) : undefined}
      />

      {/* ── Filters ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="من تاريخ">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e) => { setFilters((f) => ({ ...f, fromDate: e.target.value })); setPage(1); }}
            />
          </Field>
          <Field label="إلى تاريخ">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(e) => { setFilters((f) => ({ ...f, toDate: e.target.value })); setPage(1); }}
            />
          </Field>
          <Field label="رقم العميل">
            <Input
              placeholder="معرف العميل…"
              value={filters.customerId}
              onChange={(e) => { setFilters((f) => ({ ...f, customerId: e.target.value })); setPage(1); }}
              className="w-48"
            />
          </Field>
          <Field label="معرف المحصل">
            <Input
              placeholder="معرف المستخدم…"
              value={filters.collectorId}
              onChange={(e) => { setFilters((f) => ({ ...f, collectorId: e.target.value })); setPage(1); }}
              className="w-48"
            />
          </Field>
        </div>
      </Card>

      {/* ── Results count ── */}
      {followups.data && (
        <p className="text-xs text-concrete-500">
          إجمالي النتائج: <span className="tnum font-medium">{followups.data.total}</span>
        </p>
      )}

      {/* ── Table ── */}
      <Card>
        <DataState
          isLoading={followups.isLoading}
          isError={followups.isError}
          error={followups.error}
          onRetry={() => followups.refetch()}
          isFetching={followups.isFetching}
          isEmpty={!followups.data?.items?.length}
          emptyTitle="لا متابعات بعد"
          emptyHint="ابدأ بتسجيل متابعة جديدة لأحد العملاء"
          skeletonClassName="h-64"
        >
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['العميل', 'النوع', 'النتيجة', 'المحصل', 'التاريخ', 'المتابعة القادمة', 'إجراءات']} />
              <tbody>
                {(followups.data?.items ?? []).map((f) => (
                  <TRow key={f.id}>
                    <TD>
                      <span className="text-sm font-medium">{f.customer.name}</span>
                      <span className="mr-1 text-xs text-concrete-400">{f.customer.externalCustomerCode}</span>
                    </TD>
                    <TD className="text-sm">{f.type.name}</TD>
                    <TD>
                      <span className="inline-flex items-center rounded-full bg-pine-50 px-2 py-0.5 text-xs font-medium text-pine-700 dark:bg-pine-900/30 dark:text-pine-100">
                        {f.result.name}
                      </span>
                    </TD>
                    <TD className="text-sm text-concrete-500">{f.user.fullName}</TD>
                    <TD className="tnum text-xs text-concrete-500">{fmtDateTime(f.followupAt)}</TD>
                    <TD className="tnum text-xs text-concrete-500">
                      {f.nextFollowupDate ? fmtDate(f.nextFollowupDate) : '—'}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        {canWrite && (
                          <>
                            <button
                              onClick={() => setEditItem(f)}
                              className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-pine-600 dark:hover:bg-white/10"
                              aria-label="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteItem(f)}
                              className="rounded p-1 text-concrete-400 hover:bg-debt-50 hover:text-debt-600 dark:hover:bg-debt-900/20"
                              aria-label="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
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

          {followups.data && (
            <div className="border-t border-concrete-100 dark:border-white/10">
              <Pagination page={followups.data.page} totalPages={followups.data.totalPages} onPage={setPage} />
            </div>
          )}
        </DataState>
      </Card>

      {/* ── Create Dialog ── */}
      {createOpen && (
        <FollowupFormDialog
          title="متابعة جديدة"
          types={followupTypes.data ?? []}
          results={followupResults.data ?? []}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {/* ── Edit Dialog ── */}
      {editItem && (
        <FollowupFormDialog
          title="تعديل المتابعة"
          types={followupTypes.data ?? []}
          results={followupResults.data ?? []}
          initial={editItem}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {deleteItem && (
        <Dialog open onClose={() => setDeleteItem(null)} title="حذف المتابعة">
          <p className="text-sm text-concrete-600 dark:text-concrete-300">
            هل أنت متأكد من حذف متابعة <strong>{deleteItem.customer.name}</strong> بتاريخ {fmtDateTime(deleteItem.followupAt)}؟
          </p>
          <p className="mt-1 text-xs text-concrete-400">سيتم الحذف ناعمًا — السجل يبقى للتدقيق.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteItem(null)}>إلغاء</Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteItem.id)}
            >
              حذف
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ─── Followup Form Dialog ──────────────────────────────────────────── */
function FollowupFormDialog({
  title,
  types,
  results,
  initial,
  onClose,
}: {
  title: string;
  types: FollowupType[];
  results: FollowupResult[];
  initial?: FollowupItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [typeId, setTypeId] = useState(initial?.typeId ?? '');
  const [resultId, setResultId] = useState(initial?.resultId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [nextFollowupDate, setNextFollowupDate] = useState(
    initial?.nextFollowupDate ? initial.nextFollowupDate.slice(0, 10) : '',
  );

  const isEdit = !!initial;

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { typeId, resultId };
      if (!isEdit) body.customerId = customerId;
      if (notes) body.notes = notes;
      if (nextFollowupDate) body.nextFollowupDate = nextFollowupDate;

      if (isEdit) {
        return api(`/followups/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      return api('/followups', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast(isEdit ? 'تم تعديل المتابعة' : 'تم تسجيل المتابعة');
      qc.invalidateQueries({ queryKey: ['followups'] });
      onClose();
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err');
    },
  });

  const canSubmit = isEdit ? (typeId && resultId) : (customerId && typeId && resultId);

  return (
    <Dialog open onClose={onClose} title={title}>
      <div className="space-y-4">
        {!isEdit && (
          <Field label="العميل" error={!customerId && mutation.isError ? 'إلزامي' : undefined}>
            <Input
              placeholder="معرف العميل (UUID)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={isEdit}
            />
          </Field>
        )}

        <Field label="نوع المتابعة">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">اختر النوع…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="النتيجة">
          <Select value={resultId} onChange={(e) => setResultId(e.target.value)}>
            <option value="">اختر النتيجة…</option>
            {results.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="ملاحظات">
          <Textarea
            rows={3}
            placeholder="ملاحظات إضافية…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <Field label="موعد المتابعة القادمة">
          <Input
            type="date"
            value={nextFollowupDate}
            onChange={(e) => setNextFollowupDate(e.target.value)}
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
            {isEdit ? 'حفظ التعديلات' : 'تسجيل المتابعة'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
