CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block text NOT NULL,
  room text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX locations_block_room_idx ON public.locations (lower(block), lower(coalesce(room, '')));

CREATE POLICY "Anyone reads active locations" ON public.locations FOR SELECT TO anon, authenticated
  USING (active OR public.is_staff(auth.uid()));
CREATE POLICY "Staff add locations" ON public.locations FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff edit locations" ON public.locations FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff remove locations" ON public.locations FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

INSERT INTO public.locations (block) VALUES
  ('Bloco A'), ('Bloco B'), ('Bloco C'), ('Bloco D'), ('Bloco E'), ('Biblioteca'), ('Área Externa');