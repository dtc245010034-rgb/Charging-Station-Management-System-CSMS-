DROP INDEX users_email_trgm_idx;
DROP INDEX users_name_trgm_idx;
DROP INDEX charge_points_code_trgm_idx;

DROP INDEX audit_logs_user_id_idx;
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);

DROP INDEX audit_logs_entity_entity_id_idx;
CREATE INDEX audit_logs_entity_entity_id_idx ON audit_logs (entity, entity_id);

DROP INDEX audit_logs_created_at_idx;
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);
