-- Reports are anonymous: no account needed. Sentinel user_id for anonymous rows.
ALTER TABLE public.incidents
  ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  ADD COLUMN reporter_email text,
  ADD COLUMN tracking_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN reporter_ip_hash text;
CREATE UNIQUE INDEX incidents_tracking_token_idx ON public.incidents (tracking_token);
COMMENT ON COLUMN public.incidents.user_id IS 'Reporter account (legacy). Anonymous reports use the all-zero UUID.';
COMMENT ON COLUMN public.incidents.tracking_token IS 'Secret token stored on the reporter device to follow the ticket without login.';

-- Server-only abuse protection log (per hashed IP).
CREATE TABLE public.request_log (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.request_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.request_log_id_seq TO service_role;
ALTER TABLE public.request_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX request_log_lookup_idx ON public.request_log (ip_hash, kind, created_at DESC);