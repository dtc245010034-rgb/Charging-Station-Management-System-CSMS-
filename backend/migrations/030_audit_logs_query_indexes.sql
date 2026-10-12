DROP INDEX audit_logs_created_at_idx;
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC, id DESC);

DROP INDEX audit_logs_entity_entity_id_idx;
CREATE INDEX audit_logs_entity_entity_id_idx
  ON audit_logs (entity, entity_id, created_at DESC, id DESC);

DROP INDEX audit_logs_user_id_idx;
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id, created_at DESC, id DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX charge_points_code_trgm_idx
  ON charge_points USING gin (code gin_trgm_ops);
CREATE INDEX users_name_trgm_idx
  ON users USING gin (name gin_trgm_ops);
CREATE INDEX users_email_trgm_idx
  ON users USING gin (email gin_trgm_ops);
