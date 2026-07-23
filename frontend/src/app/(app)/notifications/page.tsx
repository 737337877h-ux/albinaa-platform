'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Badge, Pagination } from '@/components/ui/primitives';
import { DataState } from '@/components/ui/data-state';
import { toast } from '@/components/ui/toast';

interface NotificationItem {
  id: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
  payload: {
    customerId?: string;
    promiseId?: string;
    collectionId?: string;
    customerName?: string;
    amount?: number;
    currency?: string;
  };
}

interface NotificationsResponse {
  unread: number;
  items: NotificationItem[];
  total: number;
  page: number;
  totalPages: number;
}

function notifIcon(kind: string) {
  switch (kind) {
    case 'promise_due':
    case 'promise_overdue':
      return <Clock className="h-4 w-4 text-hazard-500" />;
    case 'collection_created':
      return <CheckCircle className="h-4 w-4 text-credit-600" />;
    case 'customer_transferred':
      return <Bell className="h-4 w-4 text-pine-700" />;
    default:
      return <Bell className="h-4 w-4 text-concrete-400" />;
  }
}

function notifText(n: NotificationItem): string {
  const p = n.payload;
  switch (n.kind) {
    case 'promise_due':
      return `تذكير: وعد سداد من ${p.customerName ?? 'عميل'} بمبلغ ${fmtMoney(p.amount ?? 0)} ${p.currency ?? ''}`;
    case 'promise_overdue':
      return `وعد متأخر من ${p.customerName ?? 'عميل'}`;
    case 'collection_created':
      return `تحصيل جديد: ${fmtMoney(p.amount ?? 0)} ${p.currency ?? ''} من ${p.customerName ?? ''}`;
    case 'customer_transferred':
      return `نُقل إليك العميل ${p.customerName ?? ''}`;
    default:
      return n.kind;
  }
}

function notifLink(n: NotificationItem): string | null {
  const p = n.payload;
  if (p.customerId) return `/customers/${p.customerId}`;
  if (p.promiseId) return `/promises`;
  if (p.collectionId) return `/collections`;
  return null;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const queryKey = useMemo(() => ['notifications', page, unreadOnly], [page, unreadOnly]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (unreadOnly) p.set('unreadOnly', 'true');
      return api<NotificationsResponse>(`/notifications?${p.toString()}`);
    },
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      toast('تم تعليم الكل كمقروء');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e: any) => toast(e.message || 'فشل التعديل', 'err'),
  });

  const handleClick = (n: NotificationItem) => {
    if (!n.readAt) readMutation.mutate(n.id);
    const link = notifLink(n);
    if (link) router.push(link);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="الإشعارات"
        action={
          data && data.unread > 0 ? (
            <Button variant="secondary" onClick={() => readAllMutation.mutate()} loading={readAllMutation.isPending}>
              <Check className="h-4 w-4" />
              تعليم الكل كمقروء
            </Button>
          ) : undefined
        }
      />

      {/* فلتر */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setUnreadOnly(false); setPage(1); }}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            !unreadOnly ? 'bg-pine-700 text-white' : 'text-concrete-500 hover:bg-concrete-100 dark:hover:bg-white/10'
          }`}
        >
          الكل {data ? `(${data.total})` : ''}
        </button>
        <button
          onClick={() => { setUnreadOnly(true); setPage(1); }}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            unreadOnly ? 'bg-pine-700 text-white' : 'text-concrete-500 hover:bg-concrete-100 dark:hover:bg-white/10'
          }`}
        >
          غير مقروء {data ? `(${data.unread})` : ''}
        </button>
      </div>

      {/* القائمة */}
      <Card>
        <DataState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={() => refetch()}
          isFetching={isFetching}
          isEmpty={!data?.items?.length}
          emptyTitle="لا إشعارات"
          emptyHint={unreadOnly ? 'لا إشعارات غير مقروءة' : 'ستظهر الإشعارات الجديدة هنا'}
          skeletonClassName="h-64"
        >
          <ul className="divide-y divide-concrete-100 dark:divide-white/10">
            {(data?.items ?? []).map((n) => (
              <li
                key={n.id}
                className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-pine-50/40 dark:hover:bg-white/5 ${
                  !n.readAt ? 'bg-pine-50/20 dark:bg-pine-900/10' : ''
                }`}
                onClick={() => handleClick(n)}
              >
                <div className="mt-0.5 shrink-0">
                  {notifIcon(n.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${!n.readAt ? 'font-medium' : 'text-concrete-600 dark:text-concrete-400'}`}>
                    {notifText(n)}
                  </p>
                  <p className="mt-0.5 text-xs text-concrete-400">{fmtDateTime(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-pine-700" />
                )}
              </li>
            ))}
          </ul>
        </DataState>
      </Card>

      {data && data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
      )}
    </div>
  );
}
