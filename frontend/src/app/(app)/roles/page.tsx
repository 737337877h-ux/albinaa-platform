'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Badge } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface RoleItem {
  id: string;
  name: string;
  isSystem: boolean;
  _count: { userRoles: number; rolePermissions: number };
}

interface Permission {
  id: string;
  code: string;
  descriptionAr: string;
}

interface RolePermissions {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: Permission[];
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function RolesPage() {
  const can = useCan();
  const canManage = can('users.manage');
  const qc = useQueryClient();

  const [detailItem, setDetailItem] = useState<RoleItem | null>(null);

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<RoleItem[]>('/roles'),
    enabled: canManage,
  });

  if (!canManage) {
    return (
      <div className="space-y-5">
        <PageHeader title="الأدوار والصلاحيات" />
        <Card><PermissionNotice message="لا تملك صلاحية إدارة الأدوار" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="الأدوار والصلاحيات" />

      {roles.data && (
        <p className="text-xs text-concrete-500">
          إجمالي الأدوار: <span className="tnum font-medium">{roles.data.length}</span>
        </p>
      )}

      <Card>
        <DataState
          isLoading={roles.isLoading}
          isError={roles.isError}
          error={roles.error}
          onRetry={() => roles.refetch()}
          isFetching={roles.isFetching}
          isEmpty={!roles.data?.length}
          emptyTitle="لا أدوار"
          skeletonClassName="h-64"
        >
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['الدور', 'النوع', 'المستخدمين', 'الصلاحيات', 'إجراءات']} />
              <tbody>
                {(roles.data ?? []).map((r) => (
                  <TRow key={r.id}>
                    <TD>
                      <span className="text-sm font-medium">{r.name}</span>
                    </TD>
                    <TD>
                      <Badge tone={r.isSystem ? 'hazard' : 'pine'}>
                        {r.isSystem ? 'نظامي' : 'مخصص'}
                      </Badge>
                    </TD>
                    <TD className="tnum text-sm">{r._count.userRoles}</TD>
                    <TD className="tnum text-sm">{r._count.rolePermissions}</TD>
                    <TD>
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setDetailItem(r)}
                      >
                        عرض الصلاحيات
                      </Button>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </div>
        </DataState>
      </Card>

      {detailItem && (
        <RoleDetailDialog
          role={detailItem}
          onClose={() => setDetailItem(null)}
          canManage={canManage || !detailItem.isSystem}
        />
      )}
    </div>
  );
}

/* ─── Role Detail + Permission Management Dialog ───────────────────── */
function RoleDetailDialog({ role, onClose, canManage }: { role: RoleItem; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();

  const rolePerms = useQuery({
    queryKey: ['role-permissions', role.id],
    queryFn: () => api<RolePermissions>(`/roles/${role.id}/permissions`),
  });

  const allPerms = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<Permission[]>('/permissions'),
  });

  const grantMutation = useMutation({
    mutationFn: (permId: string) =>
      api(`/roles/${role.id}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ permissionIds: [permId] }),
      }),
    onSuccess: () => {
      toast('تم منح الصلاحية');
      qc.invalidateQueries({ queryKey: ['role-permissions', role.id] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  const revokeMutation = useMutation({
    mutationFn: (permId: string) =>
      api(`/roles/${role.id}/permissions/${permId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('تم سحب الصلاحية');
      qc.invalidateQueries({ queryKey: ['role-permissions', role.id] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  const currentPermIds = new Set(rolePerms.data?.permissions.map((p) => p.id) ?? []);

  return (
    <Dialog open onClose={onClose} title={`صلاحيات — ${role.name}`}>
      <div className="space-y-4">
        {role.isSystem && (
          <p className="text-xs text-hazard-600 dark:text-hazard-400">
            هذا دور نظامي حساس — تعديل صلاحياته يتطلب صلاحية settings.manage
          </p>
        )}

        <DataState
          isLoading={rolePerms.isLoading || allPerms.isLoading}
          isError={rolePerms.isError || allPerms.isError}
          error={rolePerms.error || allPerms.error}
          isEmpty={false}
          emptyTitle=""
          skeletonClassName="h-32"
        >
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {allPerms.data?.map((p) => {
              const has = currentPermIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                    has
                      ? 'border-pine-200 bg-pine-50 dark:border-pine-800 dark:bg-pine-900/20'
                      : 'border-concrete-100 dark:border-white/10',
                  )}
                >
                  <div>
                    <p className="font-medium" dir="ltr">{p.code}</p>
                    <p className="text-xs text-concrete-500">{p.descriptionAr}</p>
                  </div>
                  {canManage && (
                    has ? (
                      <button
                        onClick={() => revokeMutation.mutate(p.id)}
                        disabled={revokeMutation.isPending}
                        className="rounded p-1 text-hazard-500 hover:bg-hazard-50 dark:hover:bg-hazard-900/20"
                        title="سحب"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => grantMutation.mutate(p.id)}
                        disabled={grantMutation.isPending}
                        className="rounded p-1 text-pine-600 hover:bg-pine-50 dark:hover:bg-pine-900/20"
                        title="منح"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </DataState>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
    </Dialog>
  );
}
