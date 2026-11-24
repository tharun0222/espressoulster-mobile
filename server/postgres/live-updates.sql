CREATE OR REPLACE FUNCTION espc_live_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  topic text := TG_ARGV[0];
  owner_id text;
BEGIN
  IF topic = 'intake' THEN
    IF NEW.id NOT IN ('order-intake', 'home-design') THEN RETURN NEW; END IF;
  ELSIF topic = 'chat' THEN
    SELECT user_id INTO owner_id FROM orders WHERE id = NEW.order_id;
  ELSE
    owner_id := NEW.user_id;
  END IF;
  PERFORM pg_notify('espc_live_updates', json_build_object('topic', topic, 'userId', owner_id)::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS espc_live_orders ON orders;
CREATE TRIGGER espc_live_orders AFTER INSERT OR UPDATE OF status, payment_status, contact ON orders
FOR EACH ROW EXECUTE FUNCTION espc_live_update('orders');
DROP TRIGGER IF EXISTS espc_live_chat ON order_chat_messages;
CREATE TRIGGER espc_live_chat AFTER INSERT ON order_chat_messages
FOR EACH ROW EXECUTE FUNCTION espc_live_update('chat');
DROP TRIGGER IF EXISTS espc_live_bookings ON table_bookings;
CREATE TRIGGER espc_live_bookings AFTER INSERT OR UPDATE OF status, table_ids ON table_bookings
FOR EACH ROW EXECUTE FUNCTION espc_live_update('bookings');
DROP TRIGGER IF EXISTS espc_live_intake ON settings;
CREATE TRIGGER espc_live_intake AFTER INSERT OR UPDATE OF data ON settings
FOR EACH ROW EXECUTE FUNCTION espc_live_update('intake');
