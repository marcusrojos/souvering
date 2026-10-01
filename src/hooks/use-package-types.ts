import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PackageType {
  id: string;
  code: string;
  label: string;
  prefixes: string[];
  is_system: boolean;
}

const DEFAULTS: PackageType[] = [
  { id: 'carton', code: 'carton', label: 'Carton', prefixes: [], is_system: true },
  { id: 'sachet', code: 'sachet', label: 'Sachet', prefixes: [], is_system: true },
  { id: 'bac', code: 'bac', label: 'Bac', prefixes: [], is_system: true },
];

export function usePackageTypes() {
  const q = useQuery({
    queryKey: ['package_types'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('package_types')
        .select('id, code, label, prefixes, is_system')
        .order('is_system', { ascending: false })
        .order('label');
      if (error) throw error;
      return (data || []) as PackageType[];
    },
  });
  return { ...q, types: q.data && q.data.length ? q.data : DEFAULTS };
}

/** Returns the type code whose longest prefix matches the barcode (case-insensitive), or null. */
export function detectPackageType(barcode: string, types: PackageType[]): string | null {
  const code = barcode.trim().toUpperCase();
  if (!code) return null;
  let best: { code: string; len: number } | null = null;
  for (const t of types) {
    for (const p of t.prefixes || []) {
      const pre = p.trim().toUpperCase();
      if (pre && code.startsWith(pre) && (!best || pre.length > best.len)) best = { code: t.code, len: pre.length };
    }
  }
  return best?.code ?? null;
}
