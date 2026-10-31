ALTER TABLE public.incidents
  ADD COLUMN ai_priority public.incident_priority,
  ADD COLUMN ai_priority_reason text,
  ADD COLUMN priority_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN priority_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN priority_set_at timestamptz,
  ADD COLUMN manager_priority_note text;

UPDATE public.incidents SET ai_priority = priority, ai_priority_reason = priority_reason WHERE ai_priority IS NULL;

COMMENT ON COLUMN public.incidents.priority IS 'Final priority defined by the manager (initially the AI suggestion until confirmed).';