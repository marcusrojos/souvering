import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { usePackageTypes, PackageType } from '@/hooks/use-package-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Package, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function slugify(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function TypeRow({ t, onChanged }: { t: PackageType; onChanged: () => void }) {
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (prefixes: string[]) => {
    setBusy(true);
    const { error } = await (supabase as any).from('package_types').update({ prefixes }).eq('id', t.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const add = () => {
    const p = prefix.trim().toUpperCase();
    if (!p) return;
    if (t.prefixes.map(x => x.toUpperCase()).includes(p)) return toast.error('Préfixe déjà présent');
    setPrefix('');
    save([...t.prefixes, p]);
  };

  const remove = async () => {
    if (!confirm(`Supprimer le type « ${t.label} » ?`)) return;
    const { error } = await (supabase as any).from('package_types').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    toast.success('Type supprimé');
    onChanged();
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{t.label}</span>
          {t.is_system && <Badge variant="secondary">Type de base</Badge>}
        </div>
        {!t.is_system && (
          <Button variant="ghost" size="icon" onClick={remove} aria-label="Supprimer"><Trash2 className="w-4 h-4 text-destructive" /></Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {t.prefixes.length === 0 && <span className="text-sm text-muted-foreground">Aucun préfixe</span>}
        {t.prefixes.map(p => (
          <Badge key={p} variant="outline" className="gap-1 font-mono">
            {p}
            <button onClick={() => save(t.prefixes.filter(x => x !== p))} aria-label={`Retirer ${p}`}><X className="w-3 h-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Nouveau préfixe (ex : CTN-)"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button variant="outline" onClick={add} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}</Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { role, loading } = useAuth() as any;
  const qc = useQueryClient();
  const { types, isLoading } = usePackageTypes();
  const [label, setLabel] = useState('');
  const [prefixes, setPrefixes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!loading && role && role !== 'super_admin') return <Navigate to="/admin" replace />;

  const refresh = () => qc.invalidateQueries({ queryKey: ['package_types'] });

  const create = async () => {
    const l = label.trim();
    const code = slugify(l);
    if (!l || !code) return toast.error('Nom du type requis');
    if (types.some(t => t.code === code)) return toast.error('Ce type existe déjà');
    const list = Array.from(new Set(prefixes.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)));
    setSaving(true);
    const { error } = await (supabase as any).from('package_types').insert({ code, label: l, prefixes: list });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Type de colis ajouté');
    setLabel(''); setPrefixes('');
    refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Paramètres</h1>
          <p className="text-muted-foreground">Configuration globale de l'application</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Colis</CardTitle>
            <CardDescription>Types de colis et préfixes de code-barres. Un code-barres commençant par un préfixe reçoit automatiquement le type correspondant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
              <div className="space-y-1"><Label>Nom du type</Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex : Glacière" /></div>
              <div className="space-y-1"><Label>Préfixes (séparés par des virgules)</Label><Input value={prefixes} onChange={e => setPrefixes(e.target.value)} placeholder="ex : GLA-, FR-" /></div>
              <Button onClick={create} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Ajouter</Button>
            </div>
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : (
              <div className="space-y-3">{types.map(t => <TypeRow key={t.id} t={t} onChanged={refresh} />)}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
