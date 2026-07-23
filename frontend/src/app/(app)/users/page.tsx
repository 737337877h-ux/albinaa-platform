'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Shield, ShieldOff, UserPlus, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Select, Field, Badge, Pagination } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Role { id: string; name: string; isSystem: boolean; }
interface Branch { id: string; name: string; }

interface UserItem {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  branchId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Role[];
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function UsersPage() {
  const can = useCan();
  const canManage = can('users.manage');
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<UserItem | null>(null);
  const [roleItem, setRoleItem] = useState<UserItem | null>(null);
  const [resetItem, setResetItem] = useState<UserItem | null>(null);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserItem[]>('/users'),
    enabled: canManage,
  });

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<Role[]>('/roles'),
    enabled: canManage,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
    enabled: canManage,
  });

  const toggleStatus = useMutation({
    mutationFn: (u: UserItem) =>
      api(`/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      }),
    onSuccess: () => {
      toast('تم تحديث الحالة');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  if (!canManage) {
    return (
      <div className="space-y-5">
        <PageHeader title="المستخدمين" />
        <Card><PermissionNotice message="لا تملك صلاحية إدارة المستخدمين" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="المستخدمين"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            مستخدم جديد
          </Button>
        }
      />

      {users.data && (
        <p className="text-xs text-concrete-500">
          إجمالي المستخدمين: <span className="tnum font-medium">{users.data.length}</span>
        </p>
      )}

      <Card>
        <DataState
          isLoading={users.isLoading}
          isError={users.isError}
          error={users.error}
          onRetry={() => users.refetch()}
          isFetching={users.isFetching}
          isEmpty={!users.data?.length}
          emptyTitle="لا مستخدمين"
          emptyHint="ابدأ بإنشاء مستخدم جديد"
          skeletonClassName="h-64"
        >
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['الاسم', 'اسم المستخدم', 'الأدوار', 'الحالة', 'آخر دخول', 'إجراءات']} />
              <tbody>
                {(users.data ?? []).map((u) => (
                  <TRow key={u.id}>
                    <TD>
                      <span className="text-sm font-medium">{u.fullName}</span>
                      {u.phone && <span className="mr-1 text-xs text-concrete-400">{u.phone}</span>}
                    </TD>
                    <TD className="tnum text-sm text-concrete-500">{u.username}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r.id} tone={r.isSystem ? 'hazard' : 'pine'}>
                            {r.name}
                          </Badge>
                        ))}
                        {u.roles.length === 0 && <span className="text-xs text-concrete-400">—</span>}
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={u.isActive ? 'credit' : 'neutral'}>
                        {u.isActive ? 'نشط' : 'معطّل'}
                      </Badge>
                    </TD>
                    <TD className="tnum text-xs text-concrete-500">
                      {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'لم يسجل دخولًا'}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditItem(u)}
                          className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-pine-600 dark:hover:bg-white/10"
                          aria-label="تعديل"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setRoleItem(u)}
                          className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-pine-600 dark:hover:bg-white/10"
                          aria-label="الأدوار"
                          title="إدارة الأدوار"
                        >
                          <Shield className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setResetItem(u)}
                          className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-hazard-600 dark:hover:bg-white/10"
                          aria-label="إعادة تعيين كلمة المرور"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus.mutate(u)}
                          className="rounded p-1 text-concrete-400 hover:bg-concrete-100 hover:text-hazard-600 dark:hover:bg-white/10"
                          aria-label={u.isActive ? 'تعطيل' : 'تفعيل'}
                          title={u.isActive ? 'تعطيل' : 'تفعيل'}
                        >
                          {u.isActive ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                        </button>
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </div>
        </DataState>
      </Card>

      {createOpen && (
        <UserFormDialog
          branches={branches.data ?? []}
          roles={roles.data ?? []}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editItem && (
        <UserFormDialog
          initial={editItem}
          branches={branches.data ?? []}
          roles={roles.data ?? []}
          onClose={() => setEditItem(null)}
        />
      )}

      {roleItem && (
        <UserRoleDialog user={roleItem} allRoles={roles.data ?? []} onClose={() => setRoleItem(null)} />
      )}

      {resetItem && (
        <ResetPasswordDialog user={resetItem} onClose={() => setResetItem(null)} />
      )}
    </div>
  );
}

/* ─── Create / Edit Dialog ─────────────────────────────────────────── */
function UserFormDialog({
  initial,
  branches,
  roles,
  onClose,
}: {
  initial?: UserItem;
  branches: Branch[];
  roles: Role[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [username, setUsername] = useState(initial?.username ?? '');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState(initial?.branchId ?? '');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(initial?.roles.map((r) => r.id) ?? []);

  const toggleRole = (id: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return api(`/users/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: fullName || undefined,
            phone: phone || undefined,
            branchId: branchId || undefined,
          }),
        });
      }
      return api('/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          fullName,
          phone: phone || undefined,
          password,
          branchId: branchId || undefined,
          roleIds: selectedRoleIds.length ? selectedRoleIds : undefined,
        }),
      });
    },
    onSuccess: () => {
      toast(isEdit ? 'تم تعديل المستخدم' : 'تم إنشاء المستخدم');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  const canSubmit = isEdit
    ? !!fullName
    : (!!username && !!fullName && !!password);

  return (
    <Dialog open onClose={onClose} title={isEdit ? 'تعديل المستخدم' : 'مستخدم جديد'}>
      <div className="space-y-4">
        {!isEdit && (
          <Field label="اسم المستخدم" error={!username && mutation.isError ? 'إلزامي' : undefined}>
            <Input
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              dir="ltr"
            />
          </Field>
        )}

        <Field label="الاسم الكامل">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <Field label="الهاتف">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
        </Field>

        {!isEdit && (
          <Field label="كلمة المرور" error={!password && mutation.isError ? 'إلزامي' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
            />
          </Field>
        )}

        <Field label="الفرع">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">بدون فرع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>

        <div>
          <label className="mb-2 block text-xs text-concrete-500">الأدوار</label>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedRoleIds.includes(r.id)
                    ? 'border-pine-600 bg-pine-600 text-white'
                    : 'border-concrete-200 text-concrete-600 hover:border-pine-400 dark:border-white/20 dark:text-concrete-300',
                )}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {isEdit ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ─── Role Management Dialog ───────────────────────────────────────── */
function UserRoleDialog({
  user,
  allRoles,
  onClose,
}: {
  user: UserItem;
  allRoles: Role[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const currentRoleIds = new Set(user.roles.map((r) => r.id));

  const grant = useMutation({
    mutationFn: (roleId: string) =>
      api(`/users/${user.id}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roleIds: [roleId] }),
      }),
    onSuccess: () => {
      toast('تم منح الدور');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  const revoke = useMutation({
    mutationFn: (roleId: string) =>
      api(`/users/${user.id}/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('تم سحب الدور');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  return (
    <Dialog open onClose={onClose} title={`أدوار — ${user.fullName}`}>
      <div className="space-y-3">
        {allRoles.map((r) => {
          const has = currentRoleIds.has(r.id);
          return (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-concrete-100 p-3 dark:border-white/10">
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                {r.isSystem && <p className="text-xs text-concrete-400">دور نظامي</p>}
              </div>
              {has ? (
                <Button
                  variant="danger"
                  className="text-xs"
                  loading={revoke.isPending}
                  onClick={() => revoke.mutate(r.id)}
                >
                  سحب الدور
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="text-xs"
                  loading={grant.isPending}
                  onClick={() => grant.mutate(r.id)}
                >
                  منح الدور
                </Button>
              )}
            </div>
          );
        })}
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ─── Reset Password Dialog ────────────────────────────────────────── */
function ResetPasswordDialog({ user, onClose }: { user: UserItem; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api(`/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      }),
    onSuccess: () => {
      toast('تم إعادة تعيين كلمة المرور');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'حدث خطأ', 'err'),
  });

  return (
    <Dialog open onClose={onClose} title={`إعادة تعيين كلمة المرور — ${user.fullName}`}>
      <div className="space-y-4">
        <p className="text-sm text-concrete-600 dark:text-concrete-300">
          سيتم إبطال جميع الجلسات النشطة لهذا المستخدم.
        </p>
        <Field label="كلمة المرور الجديدة">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            dir="ltr"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="danger"
            disabled={newPassword.length < 8}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            إعادة التعيين
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
