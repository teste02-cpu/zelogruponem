ALTER TABLE public.incidents
  ADD COLUMN submission_key uuid UNIQUE;

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('new_incident', 'overdue', 'completed')),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp')),
  recipient_email text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_outbox_ready_idx
  ON public.notification_outbox (next_attempt_at, created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notification_outbox TO service_role;
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_incident_email_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alert_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    alert_event := 'new_incident';
  ELSIF NEW.status = 'concluido' AND OLD.status <> 'concluido' THEN
    alert_event := 'completed';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_outbox (incident_id, event_type, recipient_email, idempotency_key)
  SELECT NEW.id, alert_event, lower(trim(p.email)),
         alert_event || ':' || NEW.id::text || ':' ||
           CASE WHEN alert_event = 'completed' THEN COALESCE(NEW.resolved_at::text, '') ELSE '' END ||
           ':' || lower(trim(p.email))
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'admin'
  WHERE p.email IS NOT NULL AND trim(p.email) <> ''
  ON CONFLICT (idempotency_key) DO NOTHING;

  IF alert_event = 'completed' AND NEW.reporter_email IS NOT NULL AND trim(NEW.reporter_email) <> '' THEN
    INSERT INTO public.notification_outbox (incident_id, event_type, recipient_email, idempotency_key)
    VALUES (
      NEW.id,
      'completed',
      lower(trim(NEW.reporter_email)),
      'completed:' || NEW.id::text || ':' || COALESCE(NEW.resolved_at::text, '') ||
        ':' || lower(trim(NEW.reporter_email))
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER incidents_enqueue_email_alerts
  AFTER INSERT OR UPDATE OF status ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_incident_email_alerts();

CREATE OR REPLACE FUNCTION public.claim_notification_outbox(_limit integer DEFAULT 25)
RETURNS SETOF public.notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notification_outbox AS item
  SET locked_until = now() + interval '5 minutes'
  WHERE item.id IN (
    SELECT ready.id
    FROM public.notification_outbox AS ready
    WHERE ready.sent_at IS NULL
      AND ready.next_attempt_at <= now()
      AND (ready.locked_until IS NULL OR ready.locked_until <= now())
    ORDER BY ready.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100)
  )
  RETURNING item.*;
$$;

REVOKE ALL ON FUNCTION public.enqueue_incident_email_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(integer) TO service_role;
