ALTER TABLE public.incidents
  ADD COLUMN assigned_to_name text,
  ADD CONSTRAINT incidents_assignee_name_check
    CHECK (assigned_to_name IS NULL OR char_length(btrim(assigned_to_name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT incidents_assignee_exclusive_check
    CHECK (assigned_to IS NULL OR assigned_to_name IS NULL);
