'use client';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button, Card } from '@/components/ui/primitives';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-hazard-100 dark:bg-hazard-700/20">
          <Lock className="h-8 w-8 text-hazard-600 dark:text-hazard-400" />
        </div>
        <h1 className="font-display text-lg font-bold text-concrete-800 dark:text-concrete-100">
          ليس لديك صلاحية
        </h1>
        <p className="mt-2 text-sm text-concrete-500">
          ليس لديك صلاحية للوصول إلى هذا القسم
        </p>
        <Link href="/dashboard" className="mt-6 inline-block">
          <Button>العودة للوحة التحكم</Button>
        </Link>
      </Card>
    </div>
  );
}
