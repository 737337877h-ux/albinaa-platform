'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PhoneCall, Clock, AlertTriangle, CheckCircle, ChevronLeft, ListTodo } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtMoney } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, CardHeader, Badge, Money } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { toast } from '@/components/ui/toast';
import Link from 'next/link';

interface TaskItem {
  customerId: string;
  customerName: string;
  reason: string;
  priority: number;
  balances: { currency: string; balance: number }[];
}

interface TodayTasks {
  isCollector: boolean;
  items: TaskItem[];
  summary: { tasksToday: number };
}

interface AllTasksResponse {
  items: (TaskItem & { id: string; status: string; dueDate?: string })[];
  total: number;
  page: number;
  totalPages: number;
}

type Tab = 'today' | 'overdue' | 'no-followup' | 'high-balance';

const TABS: { key: Tab; label: string; icon: typeof PhoneCall }[] = [
  { key: 'today', label: 'تواصل اليوم', icon: PhoneCall },
  { key: 'overdue', label: 'متابعات متأخرة', icon: AlertTriangle },
  { key: 'no-followup', label: 'دون متابعة', icon: Clock },
  { key: 'high-balance', label: 'رصيد مرتفع', icon: ListTodo },
];

function priorityBadge(p: number) {
  if (p <= 1) return <Badge tone="hazard">عاجل جدًا</Badge>;
  if (p <= 2) return <Badge tone="debt">عاجل</Badge>;
  if (p <= 3) return <Badge tone="pine">متوسط</Badge>;
  return <Badge tone="neutral">عادي</Badge>;
}

export default function TasksPage() {
  const can = useCan();
  const canManage = can('tasks.manage');
  const qc = useQueryClient();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('today');

  const todayTasks = useQuery({
    queryKey: ['tasks-today'],
    queryFn: () => api<TodayTasks>('/tasks/today'),
    enabled: canManage,
  });

  const allTasks = useQuery({
    queryKey: ['tasks', tab],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (tab === 'overdue') params.set('status', 'overdue');
      if (tab === 'no-followup') params.set('status', 'no_followup');
      if (tab === 'high-balance') params.set('status', 'high_balance');
      return api<AllTasksResponse>(`/tasks?${params.toString()}`);
    },
    enabled: canManage && tab !== 'today',
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => api(`/tasks/${taskId}/complete`, { method: 'PATCH' }),
    onSuccess: () => {
      toast('تم إنهاء المهمة');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-today'] });
    },
    onError: (e: any) => toast(e.message || 'فشل إنهاء المهمة', 'err'),
  });

  if (!canManage) {
    return (
      <div className="space-y-5">
        <PageHeader title="عمل اليوم" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض المهام اليومية" /></Card>
      </div>
    );
  }

  const isCollector = todayTasks.data?.isCollector === false;
  const currentItems = tab === 'today'
    ? (todayTasks.data?.items ?? [])
    : (allTasks.data?.items ?? []);

  return (
    <div className="space-y-5">
      <PageHeader title="عمل اليوم" />

      {isCollector && (
        <Card className="border border-hazard-500/30 bg-hazard-50 p-4 text-sm text-hazard-700 dark:bg-hazard-700/20 dark:text-hazard-100">
          عمل اليوم متاح لحسابات المحصلين — حسابك إداري بلا عملاء مسندين مباشرة
        </Card>
      )}

      {/* التبويبات — حساب غير المحصل يرى تبويب اليوم فقط */}
      <div className="flex flex-wrap gap-2">
        {TABS.filter((t) => isCollector || t.key === 'today').map((t) => {
          const Icon = t.icon;
          const count = t.key === 'today' ? todayTasks.data?.summary.tasksToday : undefined;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-pine-700 text-white'
                  : 'bg-white text-concrete-600 hover:bg-concrete-100 dark:bg-iron-800 dark:text-concrete-300 dark:hover:bg-white/10'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {count !== undefined && (
                <Badge tone={tab === t.key ? 'pine' : 'neutral'}>{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* ملخص اليوم */}
      {tab === 'today' && todayTasks.data && (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-concrete-500">مهام اليوم</p>
              <p className="tnum font-display text-2xl font-bold">{todayTasks.data.summary.tasksToday}</p>
            </div>
          </div>
        </Card>
      )}

      {/* قائمة المهام */}
      <Card>
        <DataState
          isLoading={tab === 'today' ? todayTasks.isLoading : allTasks.isLoading}
          isError={tab === 'today' ? todayTasks.isError : allTasks.isError}
          error={tab === 'today' ? todayTasks.error : allTasks.error}
          onRetry={() => tab === 'today' ? todayTasks.refetch() : allTasks.refetch()}
          isFetching={tab === 'today' ? todayTasks.isFetching : allTasks.isFetching}
          isEmpty={!currentItems.length}
          emptyTitle="لا مهام"
          emptyHint={tab === 'today' ? 'لا مهام مسندة إليك اليوم' : 'لا مهام في هذا التصنيف'}
          skeletonClassName="h-48"
        >
          <ul className="divide-y divide-concrete-100 dark:divide-white/10">
            {currentItems.map((t, i) => (
              <li key={`${t.customerId}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      className="font-medium text-pine-700 hover:underline dark:text-pine-100"
                      href={`/customers/${t.customerId}`}
                    >
                      {t.customerName}
                    </Link>
                    {priorityBadge(t.priority)}
                  </div>
                  <p className="mt-0.5 text-xs text-concrete-500">{t.reason}</p>
                  {t.balances.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {t.balances.map((b) => (
                        <span key={b.currency} className="tnum text-xs font-medium text-debt-600 dark:text-debt-400" dir="ltr">
                          {fmtMoney(b.balance)} {b.currency}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {(t as any).id && tab !== 'today' && (
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1"
                      onClick={() => completeMutation.mutate((t as any).id)}
                      loading={completeMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                  )}
                  <Link
                    href={`/customers/${t.customerId}`}
                    className="rounded p-1.5 text-concrete-400 hover:bg-concrete-100 hover:text-pine-700 dark:hover:bg-white/10 dark:hover:text-pine-100"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </DataState>
      </Card>
    </div>
  );
}
