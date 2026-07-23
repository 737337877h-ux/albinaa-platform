'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';

interface Customer { id: string; name: string; externalCustomerCode: string; }
interface CustomersResponse { items: Customer[]; total: number; }

export function CustomerSearch({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['customer-search', query],
    queryFn: () => api<CustomersResponse>(`/customers?search=${encodeURIComponent(query)}&limit=10`),
    enabled: query.length >= 1,
  });

  useEffect(() => {
    if (!value) {
      setSelected(null);
      setQuery('');
    }
  }, [value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <input
          type="text"
          value={selected ? `${selected.name} (${selected.externalCustomerCode})` : query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); onChange(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'ابحث باسم العميل أو الكود…'}
          disabled={disabled}
          className="w-full rounded-lg border border-concrete-200 bg-white px-3 py-2 pr-9 text-sm placeholder:text-concrete-400 focus:border-pine-500 dark:border-white/10 dark:bg-iron-800 dark:text-concrete-100 dark:placeholder:text-concrete-500"
        />
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-concrete-400" />
      </div>
      {open && data?.items && data.items.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-concrete-200 bg-white shadow-lg dark:border-white/10 dark:bg-iron-800">
          {data.items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full px-3 py-2 text-right text-sm hover:bg-concrete-50 dark:hover:bg-white/5"
              onClick={() => { setSelected(c); onChange(c.id); setQuery(''); setOpen(false); }}
            >
              <span className="font-medium">{c.name}</span>
              <span className="mr-2 text-xs text-concrete-400">{c.externalCustomerCode}</span>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 1 && data?.items && data.items.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-concrete-200 bg-white p-3 text-center text-sm text-concrete-400 shadow-lg dark:border-white/10 dark:bg-iron-800">
          لا توجد نتائج
        </div>
      )}
    </div>
  );
}
