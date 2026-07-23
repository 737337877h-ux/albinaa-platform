'use client';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Upload,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/app-shell';
import { Button, Card } from '@/components/ui/primitives';
import { DataState, PermissionNotice } from '@/components/ui/data-state';
import { Table, THead, TRow, TD } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { ReportCards } from './components/report-cards';
import { JobDetail } from './components/job-detail';

/* ─── Types ─────────────────────────────────────────────────────────── */
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
  errorsCount: number;
}

interface ImportsResponse {
  items: ImportJob[];
  total: number;
}

interface PreviewAccount {
  customerCode: string;
  customerName: string;
  currency: string;
  computedBalance: number;
  declaredBalance: number | null;
  transactions: number;
}

interface UploadResponse {
  jobId: string;
  status: string;
  previouslyImported: { jobId: string; importedAt: string } | null;
  preview: {
    accountsInFile: number;
    customersInFile: number;
    transactionsInFile: number;
    fragmentedAccountsMerged: number;
    importableAccounts: number;
    importableTransactions: number;
    parserErrors: number;
    ruleErrors: number;
    sampleAccounts: PreviewAccount[];
  };
}

interface ExecuteResponse {
  jobId: string;
  status: string;
  report: {
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
  };
}

const STATUS_AR: Record<string, string> = {
  uploaded: 'تم الرفع',
  validating: 'جارٍ التحقق',
  ready: 'جاهز',
  processing: 'جارٍ التنفيذ',
  completed: 'مكتمل',
  failed: 'فشل',
  dry_run: 'معاينة',
  running: 'جارٍ التنفيذ',
};

const STATUS_TONE: Record<string, 'pine' | 'hazard' | 'neutral' | 'debt'> = {
  uploaded: 'neutral',
  validating: 'pine',
  ready: 'pine',
  processing: 'pine',
  completed: 'pine',
  failed: 'debt',
  dry_run: 'neutral',
  running: 'pine',
};

/* ─── Helpers ───────────────────────────────────────────────────────── */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function ImportsPage() {
  const can = useCan();
  const canImport = can('imports.run');
  const canRead = can('imports.read');
  const qc = useQueryClient();

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  /* ── Upload state ── */
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadStep, setUploadStep] = useState<'idle' | 'uploading' | 'preview' | 'executing' | 'done' | 'error'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [report, setReport] = useState<ExecuteResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const resetUpload = () => {
    setUploadStep('idle');
    setFile(null);
    setPreview(null);
    setReport(null);
    setUploadError(null);
  };

  /* ── Data query ── */
  const jobs = useQuery({
    queryKey: ['imports'],
    queryFn: () => api<ImportsResponse>('/imports'),
    enabled: canRead,
  });

  /* ── Mutations ── */
  const uploadMutation = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return api<UploadResponse>('/imports/upload', { method: 'POST', body: fd });
    },
    onSuccess: (data) => {
      setPreview(data);
      setUploadStep('preview');
    },
    onError: (err) => {
      setUploadError(err instanceof ApiError ? err.message : 'فشل رفع الملف');
      setUploadStep('error');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (jobId: string) =>
      api<ExecuteResponse>(`/imports/${jobId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      setReport(data);
      setUploadStep('done');
      toast('تم تنفيذ الاستيراد بنجاح');
      qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => {
      setUploadError(err instanceof ApiError ? err.message : 'فشل التنفيذ');
      setUploadStep('error');
    },
  });

  /* ── File handling ── */
  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xlsm')) {
      toast('الصيغة المدعومة فقط: .xlsx', 'err');
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast('حجم الملف يتجاوز 10 ميجابايت', 'err');
      return;
    }
    resetUpload();
    setFile(f);
    setUploadStep('uploading');
    uploadMutation.mutate(f);
  }, [uploadMutation]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  /* ── Permission guard ── */
  if (!canRead) {
    return (
      <div className="space-y-5">
        <PageHeader title="استيراد كشف الحساب" />
        <Card><PermissionNotice message="لا تملك صلاحية عرض عمليات الاستيراد" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="استيراد كشف الحساب" />

      {/* ── Upload Zone ── */}
      {canImport && uploadStep === 'idle' && (
        <Card className="p-0 overflow-hidden">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver
                ? 'border-pine-500 bg-pine-50 dark:bg-pine-900/20'
                : 'border-concrete-300 hover:border-pine-400 hover:bg-concrete-50 dark:border-white/20 dark:hover:bg-white/5'
            }`}
          >
            <Upload className="h-10 w-10 text-concrete-400" />
            <div>
              <p className="text-sm font-medium">اسحب ملف Excel هنا أو انقر للاختيار</p>
              <p className="mt-1 text-xs text-concrete-500">الصيغة المدعومة: .xlsx — حد أقصى: 10 ميجابايت</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onInputChange} />
          </div>
        </Card>
      )}

      {/* ── Uploading spinner ── */}
      {uploadStep === 'uploading' && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-pine-200 border-t-pine-600" />
            <p className="text-sm text-concrete-500">جارٍ تحليل الملف…</p>
            {file && <p className="text-xs text-concrete-400">{file.name}</p>}
          </div>
        </Card>
      )}

      {/* ── Preview ── */}
      {uploadStep === 'preview' && preview && (
        <Card className="space-y-4 p-5">
          {preview.previouslyImported && (
            <div className="flex items-center gap-2 rounded-lg bg-hazard-50 px-3 py-2 text-sm text-hazard-700 dark:bg-hazard-900/20 dark:text-hazard-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>الملف استورد سابقًا. إعادة الاستيراد آمنة ولن تكرر البيانات.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="حسابات في الملف" value={preview.preview.accountsInFile} />
            <MiniStat label="حركات" value={preview.preview.transactionsInFile} />
            <MiniStat label="قابل للاستيراد" value={preview.preview.importableAccounts} tone="pine" />
            <MiniStat
              label="أخطاء"
              value={preview.preview.parserErrors + preview.preview.ruleErrors}
              tone={preview.preview.parserErrors + preview.preview.ruleErrors > 0 ? 'hazard' : 'neutral'}
            />
          </div>

          {preview.preview.sampleAccounts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-concrete-500">عينة من الحسابات (أول 5)</p>
              <div className="overflow-x-auto rounded-lg border border-concrete-200 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-concrete-50 text-xs text-concrete-500 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-right">الكود</th>
                      <th className="px-3 py-2 text-right">الاسم</th>
                      <th className="px-3 py-2 text-right">العملة</th>
                      <th className="px-3 py-2 text-left">الحركات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-concrete-100 dark:divide-white/10">
                    {preview.preview.sampleAccounts.map((a) => (
                      <tr key={`${a.customerCode}-${a.currency}`}>
                        <td className="tnum px-3 py-2">{a.customerCode}</td>
                        <td className="px-3 py-2 text-xs">{a.customerName}</td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-concrete-100 px-1.5 py-0.5 text-xs dark:bg-white/10">{a.currency}</span>
                        </td>
                        <td className="tnum px-3 py-2 text-left">{a.transactions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={resetUpload}>ملف آخر</Button>
            <Button
              variant="primary"
              disabled={preview.preview.importableAccounts === 0}
              loading={executeMutation.isPending}
              onClick={() => {
                setUploadStep('executing');
                executeMutation.mutate(preview.jobId);
              }}
            >
              تنفيذ الاستيراد
            </Button>
          </div>
        </Card>
      )}

      {/* ── Executing spinner ── */}
      {uploadStep === 'executing' && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-pine-200 border-t-pine-600" />
            <p className="text-sm text-concrete-500">جارٍ تنفيذ الاستيراد…</p>
          </div>
        </Card>
      )}

      {/* ── Done ── */}
      {uploadStep === 'done' && report && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700 dark:bg-pine-900/20 dark:text-pine-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>تم الاستيراد بنجاح</span>
          </div>
          <ReportCards report={report.report} />
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={resetUpload}>إغلاق</Button>
          </div>
        </Card>
      )}

      {/* ── Upload error ── */}
      {uploadStep === 'error' && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 rounded-lg bg-debt-50 px-3 py-2 text-sm text-debt-700 dark:bg-debt-900/20 dark:text-debt-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={resetUpload}>حاول مرة أخرى</Button>
          </div>
        </Card>
      )}

      {/* ── History Table ── */}
      <DataState
        isLoading={jobs.isLoading}
        isError={jobs.isError}
        error={jobs.error}
        onRetry={() => jobs.refetch()}
        isFetching={jobs.isFetching}
        isEmpty={!jobs.data?.items?.length}
        emptyTitle="لا عمليات استيراد بعد"
        emptyHint={canImport ? 'ارفع ملف كشف حساب Excel لبدء الاستيراد' : 'لا تملك صلاحية الاستيراد'}
        skeletonClassName="h-48"
      >
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <THead cols={['الملف', 'الحالة', 'التاريخ', 'الحركات', 'العملاء', 'الأخطاء']} />
              <tbody>
                {(jobs.data?.items ?? []).map((job) => (
                  <TRow key={job.id}>
                    <TD>
                      <button
                        onClick={() => setSelectedJobId(job.id)}
                        className="text-right text-sm font-medium text-pine-700 hover:underline dark:text-pine-100"
                      >
                        {job.fileName}
                      </button>
                    </TD>
                    <TD>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        job.status === 'completed' ? 'bg-pine-100 text-pine-800 dark:bg-pine-900/30 dark:text-pine-300'
                          : job.status === 'failed' ? 'bg-debt-100 text-debt-800 dark:bg-debt-900/30 dark:text-debt-300'
                          : job.status === 'running' || job.status === 'processing' ? 'bg-hazard-100 text-hazard-800 dark:bg-hazard-900/30 dark:text-hazard-300'
                          : 'bg-concrete-100 text-concrete-700 dark:bg-white/10 dark:text-concrete-300'
                      }`}>
                        {STATUS_AR[job.status] ?? job.status}
                      </span>
                    </TD>
                    <TD className="tnum text-xs text-concrete-500">
                      {job.importedAt ? fmtDateTime(job.importedAt) : fmtDateTime(job.createdAt)}
                    </TD>
                    <TD className="tnum text-sm">{job.txnsInFile}</TD>
                    <TD className="tnum text-sm">{job.customersNew ?? '—'}</TD>
                    <TD className={`tnum text-sm ${job.errorsCount > 0 ? 'text-debt-600 dark:text-debt-400' : ''}`}>
                      {job.errorsCount}
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      </DataState>

      {/* ── Job Detail Slide-over ── */}
      <JobDetail jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
    </div>
  );
}

/* ─── Mini Stat ─────────────────────────────────────────────────────── */
function MiniStat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'pine' | 'hazard' }) {
  const color = tone === 'pine' ? 'text-pine-700 dark:text-pine-400'
    : tone === 'hazard' ? 'text-hazard-600 dark:text-hazard-400'
    : 'text-iron-800 dark:text-white';
  return (
    <div className="rounded-lg border border-concrete-200 p-3 dark:border-white/10">
      <p className="text-xs text-concrete-500">{label}</p>
      <p className={`tnum mt-1 font-display text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
