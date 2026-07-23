'use client';
import { cn } from '@/lib/utils';

/**
 * شعار "البناء الراقي".
 * يُعرض دائمًا BrickMark لتجنب Hydration Mismatch.
 * عند توفر الشعار الرسمي (logo.svg)، استبدل المحتوى بـ <img> ثابت بدون fallback.
 */
export function BrickMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-7 w-7', className)} aria-hidden suppressHydrationWarning>
      <rect x="2" y="14" width="9" height="6" rx="1" fill="#E8A33D" />
      <rect x="13" y="14" width="9" height="6" rx="1" fill="#177470" />
      <rect x="7" y="6" width="10" height="6" rx="1" fill="#0F5C5A" />
    </svg>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return <BrickMark className={className} />;
}
