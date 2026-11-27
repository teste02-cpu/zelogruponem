CREATE TABLE public.incident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_notes_incident_idx ON public.incident_notes (incident_id, created_at, id);

GRANT SELECT, INSERT ON public.incident_notes TO authenticated;
GRANT ALL ON public.incident_notes TO service_role;
ALTER TABLE public.incident_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read incident notes" ON public.incident_notes
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins add incident notes" ON public.incident_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND author_id = auth.uid());

INSERT INTO public.incident_notes (incident_id, author_id, note, created_at)
SELECT id, NULL, btrim(resolution_note), COALESCE(resolved_at, updated_at, created_at)
FROM public.incidents
WHERE NULLIF(btrim(resolution_note), '') IS NOT NULL;

CREATE FUNCTION public.add_incident_note(_incident_id uuid, _note text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  clean_note text := NULLIF(btrim(_note), '');
  new_note_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem registrar notas.' USING ERRCODE = '42501';
  END IF;
  IF clean_note IS NULL OR char_length(clean_note) > 1000 THEN
    RAISE EXCEPTION 'A nota deve ter entre 1 e 1000 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.incident_notes (incident_id, author_id, note)
  VALUES (_incident_id, auth.uid(), clean_note)
  RETURNING id INTO new_note_id;

  UPDATE public.incidents SET resolution_note = clean_note WHERE id = _incident_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN new_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_incident_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_incident_note(uuid, text) TO authenticated;
