CREATE TABLE settlement_statements (
  id BIGSERIAL PRIMARY KEY,
  month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id BIGINT REFERENCES settlement_statements(id),
  period_closed_at TIMESTAMPTZ NOT NULL,
  reconciliation_issue_count INTEGER NOT NULL DEFAULT 0,
  revenue_dong BIGINT NOT NULL,
  share_dong BIGINT NOT NULL,
  platform_dong BIGINT NOT NULL,
  generated_by BIGINT REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT settlement_statements_month_version_uniq UNIQUE (month, version)
);

CREATE INDEX settlement_statements_month_idx ON settlement_statements (month, version DESC);

CREATE TABLE settlement_lines (
  id BIGSERIAL PRIMARY KEY,
  statement_id BIGINT NOT NULL REFERENCES settlement_statements(id) ON DELETE CASCADE,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  rate_id BIGINT NOT NULL REFERENCES partner_share_rates(id),
  share_bp INTEGER NOT NULL,
  include_idle BOOLEAN NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  sessions INTEGER NOT NULL,
  energy_dong BIGINT NOT NULL,
  idle_dong BIGINT NOT NULL,
  base_dong BIGINT NOT NULL,
  share_dong BIGINT NOT NULL
);

CREATE INDEX settlement_lines_statement_owner_idx ON settlement_lines (statement_id, owner_id);

CREATE OR REPLACE FUNCTION reject_settlement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'settlement tables are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER settlement_statements_no_update_delete
BEFORE UPDATE OR DELETE ON settlement_statements
FOR EACH ROW
EXECUTE FUNCTION reject_settlement_mutation();

CREATE TRIGGER settlement_statements_no_truncate
BEFORE TRUNCATE ON settlement_statements
FOR EACH STATEMENT
EXECUTE FUNCTION reject_settlement_mutation();

CREATE TRIGGER settlement_lines_no_update_delete
BEFORE UPDATE OR DELETE ON settlement_lines
FOR EACH ROW
EXECUTE FUNCTION reject_settlement_mutation();

CREATE TRIGGER settlement_lines_no_truncate
BEFORE TRUNCATE ON settlement_lines
FOR EACH STATEMENT
EXECUTE FUNCTION reject_settlement_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON settlement_statements FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON settlement_lines FROM PUBLIC;
