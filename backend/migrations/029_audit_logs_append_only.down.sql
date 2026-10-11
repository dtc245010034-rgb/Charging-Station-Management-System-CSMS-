DROP TRIGGER audit_logs_no_truncate ON audit_logs;
DROP TRIGGER audit_logs_append_only ON audit_logs;
DROP FUNCTION reject_audit_logs_mutation();

DROP INDEX audit_logs_created_at_idx;
DROP INDEX audit_logs_entity_entity_id_idx;
DROP INDEX audit_logs_user_id_idx;

ALTER TABLE audit_logs
  DROP COLUMN result;
