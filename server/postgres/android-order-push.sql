BEGIN;

CREATE TABLE IF NOT EXISTS android_push_devices (
  installation uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('customer', 'staff')),
  binding uuid NOT NULL,
  token text NOT NULL CHECK (length(token) BETWEEN 20 AND 2048),
  session_hash text NOT NULL REFERENCES pin_sessions(token_hash) ON DELETE CASCADE,
  PRIMARY KEY (installation, scope),
  UNIQUE (token, scope)
);
CREATE INDEX IF NOT EXISTS android_push_devices_session ON android_push_devices(session_hash);

CREATE TABLE IF NOT EXISTS android_push_deliveries (
  event_id text NOT NULL REFERENCES order_events(id) ON DELETE CASCADE,
  installation uuid NOT NULL,
  scope text NOT NULL,
  binding uuid NOT NULL,
  next_attempt timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, installation, scope),
  FOREIGN KEY (installation, scope) REFERENCES android_push_devices(installation, scope) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS android_push_deliveries_due ON android_push_deliveries(next_attempt);
CREATE INDEX IF NOT EXISTS android_push_deliveries_device ON android_push_deliveries(installation, scope);

CREATE OR REPLACE FUNCTION enqueue_android_order_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','preparing','ready','completed','cancelled','out_for_delivery') THEN
    RETURN NEW;
  END IF;
  INSERT INTO android_push_deliveries(event_id, installation, scope, binding, expires_at)
  SELECT NEW.id, d.installation, d.scope, d.binding,
    now() + CASE WHEN d.scope = 'staff' THEN interval '10 minutes' ELSE interval '1 hour' END
  FROM android_push_devices d
  JOIN pin_sessions s ON s.token_hash = d.session_hash
  JOIN orders o ON o.id = NEW.order_id
  WHERE s.expires_at > extract(epoch from now())
    AND ((d.scope = 'customer' AND s.user_id = o.user_id) OR (d.scope = 'staff' AND NEW.status = 'pending'))
    AND o.idempotency_key NOT LIKE 'sandbox-subscription-%'
    AND o.idempotency_key NOT LIKE 'sandbox-coffee-%'
    AND o.idempotency_key NOT LIKE 'sandbox-item-code-%'
    AND o.idempotency_key NOT LIKE 'subscription-purchase-%'
    AND o.idempotency_key NOT LIKE 'subscription-item-code-%';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS espc_android_order_push ON order_events;
CREATE TRIGGER espc_android_order_push AFTER INSERT ON order_events
FOR EACH ROW EXECUTE FUNCTION enqueue_android_order_push();

COMMIT;
