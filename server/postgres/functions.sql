CREATE FUNCTION cafe_epoch() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT floor(extract(epoch FROM statement_timestamp()))::bigint
$$;
CREATE FUNCTION cafe_epoch(value text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN value = 'now' THEN cafe_epoch()
         ELSE floor(extract(epoch FROM value::timestamptz))::bigint END
$$;
CREATE FUNCTION cafe_datetime() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
$$;
CREATE FUNCTION cafe_datetime(value text, adjustment text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(((CASE WHEN value='now' THEN statement_timestamp() ELSE value::timestamptz END)
         + adjustment::interval) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
$$;
CREATE FUNCTION cafe_julianday(value text) RETURNS double precision LANGUAGE sql STABLE AS $$
  SELECT extract(epoch FROM CASE WHEN value='now' THEN statement_timestamp() ELSE value::timestamptz END)::double precision / 86400 + 2440587.5
$$;
CREATE FUNCTION cafe_iso(value text, adjustment text DEFAULT '0 seconds') RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char((value::timestamptz + adjustment::interval) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
CREATE FUNCTION cafe_order_suffix(value bigint) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lpad(value::text, greatest(3, length(value::text)), '0')
$$;
CREATE FUNCTION cafe_json_path(value text) RETURNS text[] LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT string_to_array(substr(value,3), '.')
$$;
CREATE FUNCTION cafe_json_text(document text, field text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT document::jsonb #>> cafe_json_path(field)
$$;
CREATE FUNCTION cafe_json_number(document text, field text) RETURNS bigint LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE jsonb_typeof(document::jsonb #> cafe_json_path(field))
      WHEN 'boolean' THEN CASE WHEN (document::jsonb #>> cafe_json_path(field))::boolean THEN 1 ELSE 0 END
      WHEN 'number' THEN (document::jsonb #>> cafe_json_path(field))::bigint
      ELSE NULL END
$$;
CREATE FUNCTION cafe_json_each(document text, field text DEFAULT NULL) RETURNS TABLE(value text) LANGUAGE sql IMMUTABLE AS $$
  SELECT element #>> '{}' FROM jsonb_array_elements(
      CASE WHEN field IS NULL THEN document::jsonb ELSE document::jsonb #> cafe_json_path(field) END
  ) AS element
$$;
CREATE FUNCTION cafe_json_valid(document text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  PERFORM document::jsonb;
  RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END;
$$;
CREATE FUNCTION cafe_json_type(document text, field text DEFAULT NULL) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(CASE WHEN field IS NULL THEN document::jsonb ELSE document::jsonb #> cafe_json_path(field) END)
$$;
CREATE FUNCTION cafe_json_set(document jsonb, field text, value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(document, cafe_json_path(field), coalesce(value,'null'::jsonb), true)
$$;
