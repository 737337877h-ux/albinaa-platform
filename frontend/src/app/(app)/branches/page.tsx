'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Power } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Field, Badge } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface BranchItem {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  _count: { users: number; customers: number; collectors: number };
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function BranchesPage() {
  const can = useCan();
  const canManage = can('settings.manage');
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<BranchItem | null>(null);

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<BranchItem[]>('/branches'),
  });

  const toggleStatus = useMutation({
    mutationFn: (b: BranchItem) =>
      api(`/branches/${b.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !b.active }),
      }),
    onSuccess: () => {
      toast('تم تحديث الحالة');
      qc.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="الفروع"
        action={canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            فرع جديد
          </Button>
        ) : undefined}
      />

      {branches.data && (
        <p className="text-xs text-concrete-500">
          إجمالي الفروع: <span className="tnum font-medium">{branches.data.length}</span>
        </p>
      )}

      <Card>
        <DataState
          isLoading={branches.isLoading}
          isError={branches.isError}
          error={branches.error}
          onRetry={() => branches.refetch()}
          isFetching={branches.isFetching}
          isEmpty={!branches.data?.length}
          emptyTitle="لا فروع"
          emptyHint="ابدأ بإنشاء فرع جديد"
          skeletonClassName="h-64"
        >
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['الاسم', 'الحالة', 'المستخدمين', 'العملاء', 'المحصّلين', 'تاريخ الإنشاء', 'إجراءات']} />
              <tbody>
                {(branches.data ?? []).map((b) => (
                  <TRow key={b.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-concrete-400" />
                        <span className="text-sm font-medium">{b.name}</span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={b.active ? 'credit' : 'neutral'}>
                        {b.active ? 'نشط' : 'معطّل'}
                      </Badge>
                    </TD>
                    <TD className="tnum text-sm">{b._count.users}</TD>
                    <TD className="tnum text-sm">{b._count.customers}</TD>
                    <TD className="tnum text-sm">{b._count.collectors}</TD>
                    <TD className="tnum text-xs text-concrete-500">{fmtDateTime(b.createdAt)}</TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        {canManage && (
                          <>
                            <button
                              onClick={() => setEditItem(b)}
                              className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-pine-600 dark:hover:bg-white/10"
                              aria-label="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggleStatus.mutate(b)}
                              className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-hazard-600 dark:hover:bg-white/10"
                              aria-label={b.active ? 'تعطيل' : 'تفعيل'}
                              title={b.active ? 'تعطيل' : 'تفعيل'}
                            >
                              <Power className="h-4 w-4" />
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
        </DataState>
      </Card>

      {createOpen && <BranchFormDialog onClose={() => setCreateOpen(false)} />}
      {editItem && <BranchFormDialog initial={editItem} onClose={() => setEditItem(null)} />}
    </div>
  );
}

/* ─── Create / Edit Dialog ─────────────────────────────────────────── */
function BranchFormDialog({ initial, onClose }: { initial?: BranchItem; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return api(`/branches/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        });
      }
      return api('/branches', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      toast(isEdit ? 'تم تعديل الفرع' : 'تم إنشاء الفرع');
      qc.invalidateQueries({ queryKey: ['branches'] });
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  return (
    <Dialog open onClose={onClose} title={isEdit ? 'تعديل الفرع' : 'فرع جديد'}>
      <div className="space-y-4">
        <Field label="اسم الفرع">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            disabled={!name}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {isEdit ? 'حفظ التعديلات' : 'إنشاء الفرع'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
