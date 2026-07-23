'use client';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, UserCheck, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDate } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Card, CardHeader, Badge } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Organization {
  id: string;
  name: string;
  createdAt: string;
  _count: { branches: number; users: number; customers: number };
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const can = useCan();

  const org = useQuery({
    queryKey: ['organization'],
    queryFn: () => api<Organization>('/organizations/current'),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="الإعدادات" />

      <DataState
        isLoading={org.isLoading}
        isError={org.isError}
        error={org.error}
        onRetry={() => org.refetch()}
        isFetching={org.isFetching}
        isEmpty={false}
        emptyTitle=""
        skeletonClassName="h-48"
      >
        {org.data && (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* معلومات المنظمة */}
            <Card>
              <CardHeader title="المنظمة" />
              <div className="space-y-3 px-4 py-4">
                <Row label="الاسم">
                  <span className="font-medium">{org.data.name}</span>
                </Row>
                <Row label="تاريخ الإنشاء">
                  <span className="tnum text-concrete-500">{fmtDate(org.data.createdAt)}</span>
                </Row>
              </div>
            </Card>

            {/* الإحصائيات */}
            <Card>
              <CardHeader title="الإحصائيات" />
              <div className="grid grid-cols-3 gap-4 px-4 py-4">
                <StatCard
                  icon={<MapPin className="h-5 w-5 text-pine-600 dark:text-pine-100" />}
                  label="الفروع"
                  value={org.data._count.branches}
                />
                <StatCard
                  icon={<Users className="h-5 w-5 text-pine-600 dark:text-pine-100" />}
                  label="المستخدمين"
                  value={org.data._count.users}
                />
                <StatCard
                  icon={<UserCheck className="h-5 w-5 text-pine-600 dark:text-pine-100" />}
                  label="العملاء"
                  value={org.data._count.customers}
                />
              </div>
            </Card>
          </div>
        )}
      </DataState>

      {/* روابط سريعة */}
      {can('settings.manage') && (
        <Card>
          <CardHeader title="إدارة" />
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
            <QuickLink href="/users" label="إدارة المستخدمين" desc="إنشاء وتعديل وتفعيل المستخدمين" />
            <QuickLink href="/roles" label="الأدوار والصلاحيات" desc="إدارة الأدوار ومنح الصلاحيات" />
            <QuickLink href="/branches" label="الفروع" desc="إنشاء وتعديل الفروع" />
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-concrete-500">{label}</span>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-pine-50 dark:bg-pine-900/20">
        {icon}
      </div>
      <p className="tnum text-2xl font-bold">{value}</p>
      <p className="text-xs text-concrete-500">{label}</p>
    </div>
  );
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-concrete-100 p-3 transition-colors hover:border-pine-300 hover:bg-pine-50/50 dark:border-white/10 dark:hover:border-pine-700 dark:hover:bg-pine-900/10"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-concrete-500">{desc}</p>
    </a>
  );
}
