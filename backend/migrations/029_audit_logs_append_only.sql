ALTER TABLE audit_logs
  ADD COLUMN result TEXT;

CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);
CREATE INDEX audit_logs_entity_entity_id_idx ON audit_logs (entity, entity_id);
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);

CREATE OR REPLACE FUNCTION reject_audit_logs_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION reject_audit_logs_mutation();

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE audit_logs FROM PUBLIC;
