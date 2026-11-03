ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS reporter_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS reporter_edit_seen boolean NOT NULL DEFAULT true;

CREATE TABLE public.incident_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_edits_incident_idx ON public.incident_edits (incident_id, created_at DESC);

GRANT SELECT ON public.incident_edits TO authenticated;
GRANT ALL ON public.incident_edits TO service_role;

ALTER TABLE public.incident_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read incident edits" ON public.incident_edits
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));