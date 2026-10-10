DROP TABLE IF EXISTS remote_start_requests;
DROP INDEX IF EXISTS id_tags_one_virtual_per_user;
ALTER TABLE id_tags DROP COLUMN IF EXISTS is_virtual;
