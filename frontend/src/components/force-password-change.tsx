'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/api';
import { friendlyApiError } from '@/lib/errors';
import { BrandLogo } from '@/components/brand';
import { Button, ErrorNote, Field, Input } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

const schema = z.object({
  currentPassword: z.string().min(6, 'كلمة المرور الحالية مطلوبة'),
  newPassword: z.string().min(8, 'كلمة المرور الجديدة 8 أحرف على الأقل'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
}).refine((d) => d.newPassword !== d.currentPassword, {
  message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
  path: ['newPassword'],
});
type Form = z.infer<typeof schema>;

/**
 * شاشة تغيير كلمة المرور الإلزامي — تظهر عند mustChangePassword=true.
 * لا يمكن تجاوزها إلا بكتابة كلمة مرور جديدة صالحة.
 */
export function ForcePasswordChange() {
  const qc = useQueryClient();
  const [done, setDone] = useState(false);

  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const change = useMutation({
    mutationFn: (data: Form) =>
      api<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      }),
    onSuccess: () => {
      qc.setQueryData(['me'], (old: any) => old ? { ...old, mustChangePassword: false } : old);
      toast('تم تغيير كلمة المرور بنجاح');
      setDone(true);
    },
  });

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-center shadow-card dark:bg-iron-800 dark:ring-1 dark:ring-white/10">
          <BrandLogo className="mx-auto h-10 w-10" />
          <h2 className="font-display text-lg font-bold">تم تغيير كلمة المرور بنجاح</h2>
          <p className="text-sm text-concrete-500">يمكنك الآن استخدام كلمة المرور الجديدة لتسجيل الدخول.</p>
          <p className="text-xs text-concrete-400">ستُطلب منك إعادة تسجيل الدخول بـ كلمة المرور الجديدة.</p>
          <Button onClick={() => { window.location.href = '/login'; }} className="w-full">
            العودة لتسجيل الدخول
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <BrandLogo className="mx-auto h-12 w-12" />
          <h1 className="mt-3 font-display text-xl font-bold">تغيير كلمة المرور الإلزامي</h1>
          <p className="mt-1 text-sm text-concrete-500">
            أنت تستخدم كلمة المرور الافتراضية. يُرجى تغييرها للمتابعة.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((d) => change.mutate(d))}
          noValidate
          className="space-y-4 rounded-2xl bg-white p-6 shadow-card dark:bg-iron-800 dark:ring-1 dark:ring-white/10"
        >
          {change.isError && <ErrorNote message={friendlyApiError(change.error)} />}

          <Field label="كلمة المرور الحالية" error={errors.currentPassword?.message}>
            <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
          </Field>

          <Field label="كلمة المرور الجديدة" error={errors.newPassword?.message} hint="8 أحرف على الأقل">
            <Input type="password" autoComplete="new-password" {...register('newPassword')} />
          </Field>

          <Field label="تأكيد كلمة المرور الجديدة" error={errors.confirmPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>

          <Button type="submit" loading={isSubmitting || change.isPending} className="w-full">
            تغيير كلمة المرور
          </Button>
        </form>
      </div>
    </main>
  );
}
