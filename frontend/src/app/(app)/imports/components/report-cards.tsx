'use client';
import { Card } from '@/components/ui/primitives';
import { fmtMoney } from '@/lib/format';

interface ReportData {
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

export function ReportCards({ report }: { report: ReportData }) {
  const stats = [
    { label: 'عملاء جدد', value: report.customersNew, tone: 'pine' as const },
    { label: 'عملاء محدّثين', value: report.customersUpdated, tone: 'neutral' as const },
    { label: 'حركات مُدرجة', value: report.txnsInserted, tone: 'pine' as const },
    { label: 'حركات مكررة (متخطاة)', value: report.txnsSkippedDuplicate, tone: 'neutral' as const },
    { label: 'حسابات مدمجة', value: report.fragmentedAccountsMerged, tone: 'neutral' as const },
    { label: 'أخطاء تحليل', value: report.parseErrors, tone: report.parseErrors > 0 ? 'hazard' as const : 'neutral' as const },
    { label: 'أخطاء قواعد', value: report.ruleErrors, tone: report.ruleErrors > 0 ? 'hazard' as const : 'neutral' as const },
    { label: 'أزواج أسماء مكررة', value: report.duplicateNamePairsFlagged, tone: report.duplicateNamePairsFlagged > 0 ? 'hazard' as const : 'neutral' as const },
  ];

  const currencies = Array.from(new Set([
    ...Object.keys(report.totalBalanceBefore ?? {}),
    ...Object.keys(report.totalBalanceAfter ?? {}),
  ]));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-concrete-500">{s.label}</p>
            <p className="tnum mt-1 font-display text-2xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      {currencies.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">الأرصدة قبل / بعد</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currencies.map((ccy) => {
              const before = report.totalBalanceBefore?.[ccy] ?? 0;
              const after = report.totalBalanceAfter?.[ccy] ?? 0;
              return (
                <div key={ccy} className="rounded-lg border border-concrete-200 p-3 dark:border-white/10">
                  <p className="text-xs text-concrete-500">{ccy}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="tnum text-sm text-concrete-400" dir="ltr">{fmtMoney(before)}</span>
                    <span className="text-concrete-300">←</span>
                    <span className="tnum text-sm font-bold" dir="ltr">{fmtMoney(after)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
