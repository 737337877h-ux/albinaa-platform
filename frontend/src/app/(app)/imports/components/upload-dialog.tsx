'use client';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, Card } from '@/components/ui/primitives';
import { ReportCards } from './report-cards';

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

type Step = 'idle' | 'uploading' | 'preview' | 'executing' | 'done' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UploadDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [report, setReport] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep('idle');
    setFile(null);
    setPreview(null);
    setReport(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
    qc.invalidateQueries({ queryKey: ['imports'] });
  };

  const uploadMutation = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return api<UploadResponse>('/imports/upload', { method: 'POST', body: fd });
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'فشل الرفع');
      setStep('error');
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
      setStep('done');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'فشل التنفيذ');
      setStep('error');
    },
  });

  const handleFile = useCallback((f: File) => {
    reset();
    setFile(f);
    setStep('uploading');
    uploadMutation.mutate(f);
  }, [uploadMutation]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xlsm'))) handleFile(f);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-iron-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-concrete-200 px-5 py-4 dark:border-white/10">
          <h2 className="font-display text-lg font-bold">استيراد كشف حساب</h2>
          <button onClick={handleClose} className="rounded-lg p-1 text-concrete-400 hover:bg-concrete-100 dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Step: Idle — Drop zone */}
          {step === 'idle' && (
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
                <p className="mt-1 text-xs text-concrete-500">الصيغة المدعومة: .xlsx</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onInputChange} />
            </div>
          )}

          {/* Step: Uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-pine-200 border-t-pine-600" />
              <p className="text-sm text-concrete-500">جارٍ تحليل الملف…</p>
              {file && <p className="text-xs text-concrete-400">{file.name}</p>}
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
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
                <MiniStat label="أخطاء" value={preview.preview.parserErrors + preview.preview.ruleErrors} tone={preview.preview.parserErrors + preview.preview.ruleErrors > 0 ? 'hazard' : 'neutral'} />
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
                            <td className="px-3 py-2"><span className="rounded bg-concrete-100 px-1.5 py-0.5 text-xs dark:bg-white/10">{a.currency}</span></td>
                            <td className="tnum px-3 py-2 text-left">{a.transactions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={reset}>ملف آخر</Button>
                <Button
                  variant="primary"
                  disabled={preview.preview.importableAccounts === 0}
                  onClick={() => {
                    setStep('executing');
                    executeMutation.mutate(preview.jobId);
                  }}
                >
                  {executeMutation.isPending ? 'جارٍ التنفيذ…' : 'تنفيذ الاستيراد'}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Executing */}
          {step === 'executing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-pine-200 border-t-pine-600" />
              <p className="text-sm text-concrete-500">جارٍ تنفيذ الاستيراد…</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && report && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700 dark:bg-pine-900/20 dark:text-pine-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>تم الاستيراد بنجاح</span>
              </div>
              <ReportCards report={report.report} />
              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={handleClose}>إغلاق</Button>
              </div>
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-debt-50 px-3 py-2 text-sm text-debt-700 dark:bg-debt-900/20 dark:text-debt-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={reset}>حاول مرة أخرى</Button>
                <Button variant="primary" onClick={handleClose}>إغلاق</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
