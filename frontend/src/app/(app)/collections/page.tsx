'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, RotateCcw, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { CCY_AR, COLLECTION_STATUS_AR, fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Select, Field, Textarea, Badge, Money, Pagination } from '@/components/ui/primitives';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface CollectionItem {
  id: string;
  amount: string | number;
  currencyCode: string;
  collectedAt: string;
  notes: string | null;
  referenceNumber: string | null;
  status: string;
  customer: { id: string; name: string };
  method: { id: string; name: string };
  branch: { id: string; name: string } | null;
  recordedBy: { id: string; fullName: string } | null;
}

interface CollectionsResponse {
  items: CollectionItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CollectionDetail extends CollectionItem {
  reversedAt: string | null;
  reversedBy: { id: string; fullName: string } | null;
  reverseReason: string | null;
}

const registerSchema = z.object({
  customerId: z.string().min(1, 'اختر العميل'),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  currencyCode: z.string().min(1, 'اختر العملة'),
  methodCode: z.string().min(1, 'اختر طريقة الدفع'),
  notes: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

const reverseSchema = z.object({ reason: z.string().min(1, 'أدخل سبب الإيجاب') });
type ReverseForm = z.infer<typeof reverseSchema>;

const CURRENCIES = ['USD', 'YER', 'SAR'];
const METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'transfer', label: 'تحويل بنكي' },
  { value: 'check', label: 'شيك' },
  { value: 'other', label: 'أخرى' },
];

export default function CollectionsPage() {
  const can = useCan();
  const canRead = can('customers.read');
  const canWrite = can('customers.write');
  const qc = useQueryClient();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<CollectionItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<string | null>(null);

  const queryKey = useMemo(() => ['collections', page, customerId, fromDate, toDate], [page, customerId, fromDate, toDate]);

  const collections = useQuery({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (customerId) p.set('customerId', customerId);
      if (fromDate) p.set('fromDate', fromDate);
      if (toDate) p.set('toDate', toDate);
      return api<CollectionsResponse>(`/collections?${p.toString()}`);
    },
    enabled: canRead,
  });

  const detail = useQuery({
    queryKey: ['collection-detail', detailTarget],
    queryFn: () => api<CollectionDetail>(`/collections/${detailTarget}`),
    enabled: !!detailTarget,
  });

  const reverseMutation = useMutation({
    mutationFn: (payload: { id: string; reason: string }) =>
      api(`/collections/${payload.id}/reverse`, { method: 'POST', body: JSON.stringify({ reason: payload.reason }) }),
    onSuccess: () => {
      toast('تم عكس التحصيل بنجاح');
      setReverseTarget(null);
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (e: any) => toast(e.message || 'فشل عكس التحصيل', 'err'),
  });

  if (!canRead) {
    return (
      <div className="space-y-5">
        <PageHeader title="التحصيلات" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض التحصيلات" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="التحصيلات"
        action={canWrite ? (
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="h-4 w-4" />
            تسجيل تحصيل
          </Button>
        ) : undefined}
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-concrete-500">رقم العميل</label>
            <Input
              placeholder="بحث برقم العميل…"
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">من تاريخ</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            />
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-concrete-500">إلى تاريخ</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            />
          </div>
          {(customerId || fromDate || toDate) && (
            <Button variant="ghost" onClick={() => { setCustomerId(''); setFromDate(''); setToDate(''); setPage(1); }}>
              مسح الفلاتر
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <DataState
          isLoading={collections.isLoading}
          isError={collections.isError}
          error={collections.error}
          onRetry={() => collections.refetch()}
          isFetching={collections.isFetching}
          isEmpty={!collections.data?.items?.length}
          emptyTitle="لا تحصيلات"
          emptyHint={(customerId || fromDate || toDate) ? 'جرّب تغيير معايير البحث' : 'لم تُسجَّل تحصيلات بعد'}
          skeletonClassName="h-64"
        >
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['العميل', 'المبلغ', 'العملة', 'الطريقة', 'التاريخ', 'الحالة', 'إجراءات']} />
              <tbody>
                {(collections.data?.items ?? []).map((c) => (
                  <TRow key={c.id}>
                    <TD>
                      <Link className="text-pine-700 hover:underline dark:text-pine-100" href={`/customers/${c.customer.id}`}>
                        {c.customer.name}
                      </Link>
                    </TD>
                    <TD><Money value={Number(c.amount)} currency={c.currencyCode} /></TD>
                    <TD><Badge tone="pine">{CCY_AR[c.currencyCode] ?? c.currencyCode}</Badge></TD>
                    <TD className="text-concrete-500">{c.method.name}</TD>
                    <TD className="tnum text-xs text-concrete-500">{fmtDateTime(c.collectedAt)}</TD>
                    <TD>
                      <Badge tone={c.status === 'reversed' ? 'hazard' : c.status === 'approved' ? 'credit' : 'neutral'}>
                        {COLLECTION_STATUS_AR[c.status] ?? c.status}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" className="!px-2 !py-1" onClick={() => setDetailTarget(c.id)}>
                          التفاصيل
                        </Button>
                        {canWrite && c.status !== 'reversed' && (
                          <Button variant="ghost" className="!px-2 !py-1 text-debt-600 dark:text-debt-400" onClick={() => setReverseTarget(c)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </div>
          {collections.data && (
            <div className="border-t border-concrete-100 dark:border-white/10">
              <Pagination page={collections.data.page} totalPages={collections.data.totalPages} onPage={setPage} />
            </div>
          )}
        </DataState>
      </Card>

      <RegisterDialog open={registerOpen} onClose={() => setRegisterOpen(false)} />

      <ReverseDialog
        open={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        collection={reverseTarget}
        onConfirm={(reason) => {
          if (reverseTarget) reverseMutation.mutate({ id: reverseTarget.id, reason });
        }}
        loading={reverseMutation.isPending}
      />

      <DetailDialog
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        data={detail.data}
        isLoading={detail.isLoading}
        isError={detail.isError}
      />
    </div>
  );
}

function RegisterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors }, reset } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { customerId: '', amount: 0, currencyCode: '', methodCode: '', notes: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: RegisterForm) => api('/collections', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast('تم تسجيل التحصيل بنجاح');
      reset();
      onClose();
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (e: any) => toast(e.message || 'فشل تسجيل التحصيل', 'err'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="تسجيل تحصيل جديد">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Field label="رقم العميل" error={errors.customerId?.message}>
          <Input {...register('customerId')} placeholder="أدخل رقم العميل" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ" error={errors.amount?.message}>
            <Input type="number" step="0.01" {...register('amount')} placeholder="0.00" />
          </Field>
          <Field label="العملة" error={errors.currencyCode?.message}>
            <Select {...register('currencyCode')}>
              <option value="">اختر</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c} — {CCY_AR[c]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="طريقة الدفع" error={errors.methodCode?.message}>
          <Select {...register('methodCode')}>
            <option value="">اختر</option>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="ملاحظات" hint="اختياري">
          <Textarea {...register('notes')} rows={2} placeholder="أضف ملاحظات…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>إلغاء</Button>
          <Button type="submit" loading={mutation.isPending}>تسجيل</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReverseDialog({ open, onClose, collection, onConfirm, loading }: {
  open: boolean; onClose: () => void; collection: CollectionItem | null;
  onConfirm: (reason: string) => void; loading: boolean;
}) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ReverseForm>({
    resolver: zodResolver(reverseSchema),
  });

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onClose={handleClose} title="عكس التحصيل">
      {collection && (
        <div className="space-y-4">
          <div className="rounded-lg bg-concrete-50 p-3 dark:bg-white/5">
            <p className="text-sm font-medium">{collection.customer.name}</p>
            <p className="tnum mt-1 text-sm">
              <Money value={Number(collection.amount)} currency={collection.currencyCode} />
              {' — '}
              <span className="text-concrete-500">{fmtDateTime(collection.collectedAt)}</span>
            </p>
          </div>
          <div className="rounded-lg border border-hazard-500/30 bg-hazard-50 p-3 text-sm text-hazard-700 dark:bg-hazard-700/20 dark:text-hazard-100">
            هل أنت متأكد من عكس هذا التحصيل؟ لا يمكن التراجع عن هذا الإجراء.
          </div>
          <form onSubmit={handleSubmit((d) => onConfirm(d.reason))} className="space-y-3">
            <Field label="سبب الإيجاب" error={errors.reason?.message}>
              <Textarea {...register('reason')} rows={2} placeholder="اذكر سبب الإيجاب…" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={handleClose}>إلغاء</Button>
              <Button variant="danger" type="submit" loading={loading}>تأكيد العكس</Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  );
}

function DetailDialog({ open, onClose, data, isLoading, isError }: {
  open: boolean; onClose: () => void; data: CollectionDetail | undefined;
  isLoading: boolean; isError: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="تفاصيل التحصيل">
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-concrete-100 dark:bg-white/10" />)}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-debt-600">تعذّر جلب التفاصيل</p>
      ) : (
        <div className="space-y-3 text-sm">
          <DetailRow label="رقم السند" value={data.id} />
          <DetailRow label="العميل" value={data.customer.name} />
          <DetailRow label="المبلغ">
            <Money value={Number(data.amount)} currency={data.currencyCode} />
          </DetailRow>
          <DetailRow label="العملة" value={`${data.currencyCode} — ${CCY_AR[data.currencyCode] ?? ''}`} />
          <DetailRow label="طريقة الدفع" value={data.method.name} />
          <DetailRow label="التاريخ" value={fmtDateTime(data.collectedAt)} />
          <DetailRow label="الحالة">
            <Badge tone={data.status === 'reversed' ? 'hazard' : 'neutral'}>
              {COLLECTION_STATUS_AR[data.status] ?? data.status}
            </Badge>
          </DetailRow>
          <DetailRow label="المرجع" value={data.referenceNumber ?? '—'} />
          <DetailRow label="الفرع" value={data.branch?.name ?? '—'} />
          <DetailRow label="سجّل بواسطة" value={data.recordedBy?.fullName ?? '—'} />
          {data.notes && <DetailRow label="ملاحظات" value={data.notes} />}
          {data.reversedAt && (
            <>
              <DetailRow label="تاريخ الإيجاب" value={fmtDateTime(data.reversedAt)} />
              <DetailRow label="تم الإيجاب بواسطة" value={data.reversedBy?.fullName ?? '—'} />
              <DetailRow label="سبب الإيجاب" value={data.reverseReason ?? '—'} />
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

function DetailRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-concrete-100 pb-2 last:border-0 dark:border-white/10">
      <span className="text-concrete-500">{label}</span>
      {children ?? <span className="tnum font-medium">{value}</span>}
    </div>
  );
}
