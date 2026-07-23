'use client';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button } from '@/components/ui/primitives';
import { DataState } from '@/components/ui/data-state';
import { ReportCards } from './report-cards';

interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  importedAt: string | null;
  createdAt: string;
  rowsTotal: number;
  txnsInFile: number;
  customersNew: number | null;
  customersUpdated: number | null;
  txnsInserted: number | null;
  txnsSkippedDuplicate: number | null;
  errorsCount: number;
}

interface JobReport {
  customersNew: number;
  customersUpdated: number;
  txnsInserted: number;
  txnsSkippedDuplicate: number;
  fragmentedAccountsMerged: number;
  parseErrors: number;
  ruleErrors: number;
  duplicateNamePairsFlagged: number;
  totalBalanceBefore: Record<string, number> | null;
  totalBalanceAfter: Record<string, number> | null;
}

interface JobErrors {
  parserErrors: { rowNumber: number; message: string }[];
  ruleErrors: { rowNumber: number | null; message: string; context?: string }[];
  accountWarnings: { account: string; warnings: string[] }[];
}

const STATUS_AR: Record<string, string> = {
  dry_run: 'معاينة',
  running: 'جارٍ التنفيذ',
  completed: 'مكتمل',
  failed: 'فشل',
};

const STATUS_TONE: Record<string, 'pine' | 'hazard' | 'neutral' | 'debt'> = {
  dry_run: 'neutral',
  running: 'pine',
  completed: 'pine',
  failed: 'debt',
};

interface Props {
  jobId: string | null;
  onClose: () => void;
}

export function JobDetail({ jobId, onClose }: Props) {
  const job = useQuery({
    queryKey: ['import', jobId],
    queryFn: () => api<ImportJob>(`/imports/${jobId}`),
    enabled: !!jobId,
  });

  const report = useQuery({
    queryKey: ['import-report', jobId],
    queryFn: () => api<{ report: JobReport }>(`/imports/${jobId}/report`),
    enabled: !!jobId && job.data?.status === 'completed',
  });

  const errors = useQuery({
    queryKey: ['import-errors', jobId],
    queryFn: () => api<JobErrors>(`/imports/${jobId}/errors`),
    enabled: !!jobId && (job.data?.errorsCount ?? 0) > 0,
  });

  if (!jobId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl dark:bg-iron-900">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-concrete-200 bg-white px-5 py-4 dark:border-white/10 dark:bg-iron-900">
          <div>
            <h2 className="font-display text-lg font-bold">تفاصيل الاستيراد</h2>
            {job.data && (
              <p className="text-xs text-concrete-500">{job.data.fileName}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-concrete-400 hover:bg-concrete-100 dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <DataState
            isLoading={job.isLoading}
            isError={job.isError}
            error={job.error}
            onRetry={() => job.refetch()}
            isFetching={job.isFetching}
            isEmpty={false}
            emptyTitle=""
            skeletonClassName="h-48"
          >
            {job.data && (
              <div className="space-y-4">
                {/* Status + Meta */}
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={STATUS_TONE[job.data.status] ?? 'neutral'}>
                    {STATUS_AR[job.data.status] ?? job.data.status}
                  </Badge>
                  <span className="text-xs text-concrete-500">
                    {job.data.importedAt ? fmtDateTime(job.data.importedAt) : fmtDateTime(job.data.createdAt)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <MetaItem label="الملف" value={job.data.fileName} />
                  <MetaItem label="إجمالي الصفوف" value={job.data.rowsTotal} />
                  <MetaItem label="حركات في الملف" value={job.data.txnsInFile} />
                  <MetaItem label="أخطاء" value={job.data.errorsCount} tone={job.data.errorsCount > 0 ? 'debt' : 'neutral'} />
                </div>

                {/* Report (completed only) */}
                {report.data && (
                  <ReportCards report={report.data.report} />
                )}

                {/* Errors */}
                {errors.data && (errors.data.parserErrors.length > 0 || errors.data.ruleErrors.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">الأخطاء</p>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-concrete-200 p-3 dark:border-white/10">
                      {errors.data.parserErrors.map((e, i) => (
                        <p key={`p-${i}`} className="text-xs text-debt-600 dark:text-debt-400">
                          {e.rowNumber ? `صف ${e.rowNumber}: ` : ''}{e.message}
                        </p>
                      ))}
                      {errors.data.ruleErrors.map((e, i) => (
                        <p key={`r-${i}`} className="text-xs text-hazard-600 dark:text-hazard-400">
                          {e.rowNumber ? `صف ${e.rowNumber}: ` : ''}{e.message}
                          {e.context ? ` — ${e.context}` : ''}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Account warnings */}
                {errors.data?.accountWarnings && errors.data.accountWarnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">تحذيرات الحسابات</p>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-concrete-200 p-3 dark:border-white/10">
                      {errors.data.accountWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-concrete-500">
                          <span className="font-mono">{w.account}</span>: {w.warnings.join(' | ')}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DataState>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: string }) {
  const color = tone === 'debt' ? 'text-debt-600 dark:text-debt-400' : 'text-iron-800 dark:text-white';
  return (
    <div>
      <p className="text-xs text-concrete-500">{label}</p>
      <p className={`tnum mt-0.5 text-sm font-medium ${color}`}>{value}</p>
    </div>
  );
}
