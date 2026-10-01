CREATE TABLE public.package_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  prefixes text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_types TO authenticated;
GRANT ALL ON public.package_types TO service_role;
ALTER TABLE public.package_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt read" ON public.package_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "pt insert" ON public.package_types FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "pt update" ON public.package_types FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "pt delete" ON public.package_types FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()) AND is_system = false);
CREATE TRIGGER update_package_types_updated_at BEFORE UPDATE ON public.package_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.package_types (code, label, is_system) VALUES ('carton','Carton',true),('sachet','Sachet',true),('bac','Bac',true);