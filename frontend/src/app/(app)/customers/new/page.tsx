'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Input, Select, Field, Textarea } from '@/components/ui/primitives';
import { PermissionNotice } from '@/components/ui/data-state';
import { toast } from '@/components/ui/toast';

interface Branch {
  id: string;
  name: string;
}

interface BranchesResponse {
  items: Branch[];
}

const CUSTOMER_TYPES = [
  { value: 'retail', label: 'تجزئة' },
  { value: 'wholesale', label: 'جملة' },
  { value: 'contractor', label: 'مقاول' },
  { value: 'government', label: 'جهة حكومية' },
  { value: 'other', label: 'أخرى' },
];

export default function NewCustomerPage() {
  const can = useCan();
  const router = useRouter();

  const [externalCustomerCode, setCode] = useState('');
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [phoneSecondary, setPhoneSecondary] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [branchId, setBranchId] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<BranchesResponse>('/branches'),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        externalCustomerCode: externalCustomerCode.trim(),
        name: name.trim(),
      };
      if (tradeName.trim()) body.tradeName = tradeName.trim();
      if (phonePrimary.trim()) body.phonePrimary = phonePrimary.trim();
      if (phoneSecondary.trim()) body.phoneSecondary = phoneSecondary.trim();
      if (whatsapp.trim()) body.whatsapp = whatsapp.trim();
      if (region.trim()) body.region = region.trim();
      if (address.trim()) body.address = address.trim();
      if (branchId) body.branchId = branchId;
      if (customerType) body.customerType = customerType;
      if (notes.trim()) body.notes = notes.trim();
      return api('/customers', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: (data: any) => {
      toast('تم إنشاء العميل بنجاح');
      router.push(`/customers/${data.id}`);
    },
    onError: (e: any) => {
      const errBody = e?.body as any;
      if (e instanceof ApiError && Array.isArray(errBody?.message)) {
        const fieldErrors: Record<string, string> = {};
        for (const msg of errBody.message) {
          if (typeof msg === 'string') {
            const match = msg.match(/^externalCustomerCode\s/);
            if (match) fieldErrors.externalCustomerCode = msg.replace(/^externalCustomerCode\s+/, '');
            else if (msg.startsWith('name ')) fieldErrors.name = msg.replace(/^name\s+/, '');
            else toast(msg, 'err');
          }
        }
        setErrors(fieldErrors);
      } else {
        toast(e?.message || 'فشل إنشاء العميل', 'err');
      }
    },
  });

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!externalCustomerCode.trim()) errs.externalCustomerCode = 'كود العميل مطلوب';
    else if (externalCustomerCode.trim().length > 50) errs.externalCustomerCode = 'الحد الأقصى 50 حرفًا';
    if (!name.trim()) errs.name = 'اسم العميل مطلوب';
    else if (name.trim().length < 2) errs.name = 'الحد الأدنى حرفان';
    else if (name.trim().length > 300) errs.name = 'الحد الأقصى 300 حرف';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) createMutation.mutate();
  };

  if (!can('customers.write')) {
    return (
      <div className="space-y-5">
        <PageHeader title="عميل جديد" />
        <Card><PermissionNotice message="لا تملك صلاحية إنشاء عملاء" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="عميل جديد"
        action={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        }
      />

      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-concrete-700 dark:text-concrete-200">المعلومات الأساسية</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="كود العميل *" error={errors.externalCustomerCode}>
                <Input
                  placeholder="الكود الخارجي (معرّف فريد)"
                  value={externalCustomerCode}
                  onChange={(e) => { setCode(e.target.value); setErrors((p) => ({ ...p, externalCustomerCode: '' })); }}
                  maxLength={50}
                />
              </Field>
              <Field label="اسم العميل *" error={errors.name}>
                <Input
                  placeholder="الاسم الكامل للعميل"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
                  maxLength={300}
                />
              </Field>
              <Field label="الاسم التجارية" hint="اختياري">
                <Input
                  placeholder="الاسم التجاري إن وُجد"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  maxLength={300}
                />
              </Field>
              <Field label="نوع العميل" hint="اختياري">
                <Select value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
                  <option value="">اختر النوع…</option>
                  {CUSTOMER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-concrete-700 dark:text-concrete-200">بيانات الاتصال</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="الهاتف الرئيسي" hint="اختياري">
                <Input
                  type="tel"
                  placeholder="رقم الهاتف"
                  value={phonePrimary}
                  onChange={(e) => setPhonePrimary(e.target.value)}
                  maxLength={30}
                  dir="ltr"
                  className="text-left"
                />
              </Field>
              <Field label="الهاتف الثانوي" hint="اختياري">
                <Input
                  type="tel"
                  placeholder="رقم هاتف إضافي"
                  value={phoneSecondary}
                  onChange={(e) => setPhoneSecondary(e.target.value)}
                  maxLength={30}
                  dir="ltr"
                  className="text-left"
                />
              </Field>
              <Field label="واتساب" hint="اختياري">
                <Input
                  type="tel"
                  placeholder="رقم واتساب"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  maxLength={30}
                  dir="ltr"
                  className="text-left"
                />
              </Field>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-concrete-700 dark:text-concrete-200">العنوان والفرع</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="المنطقة" hint="اختياري">
                <Input
                  placeholder="المنطقة أو المحافظة"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  maxLength={200}
                />
              </Field>
              <Field label="العنوان التفصيلي" hint="اختياري">
                <Input
                  placeholder="العنوان التفصيلي"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={500}
                />
              </Field>
              <Field label="الفرع" hint="اختياري">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">بدون فرع</option>
                  {(branches.data?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-concrete-700 dark:text-concrete-200">ملاحظات</h3>
            <Field label="ملاحظات إضافية" hint="اختياري">
              <Textarea
                rows={3}
                placeholder="أي ملاحظات أو معلومات إضافية عن العميل…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between border-t border-concrete-100 pt-4 dark:border-white/10">
            <p className="text-xs text-concrete-500">الحقول المؤشر عليها بـ * مطلوبة</p>
            <div className="flex gap-2">
              <Button variant="secondary" type="button" onClick={() => router.back()}>إلغاء</Button>
              <Button type="submit" loading={createMutation.isPending}>إنشاء العميل</Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
