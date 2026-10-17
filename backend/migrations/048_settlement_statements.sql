CREATE TABLE settlement_statements (
  id BIGSERIAL PRIMARY KEY,
  month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  version INTEGER NOT NULL CHECK (version > 0),
  supersedes_id BIGINT REFERENCES settlement_statements(id) ON DELETE RESTRICT,
  period_closed_at TIMESTAMPTZ NOT NULL,
  reconciliation_issue_count INTEGER NOT NULL DEFAULT 0 CHECK (reconciliation_issue_count >= 0),
  revenue_dong BIGINT NOT NULL CHECK (revenue_dong >= 0),
  share_dong BIGINT NOT NULL CHECK (share_dong >= 0),
  platform_dong BIGINT NOT NULL CHECK (platform_dong >= 0),
  generated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (month, version)
);

CREATE TABLE settlement_lines (
  id BIGSERIAL PRIMARY KEY,
  statement_id BIGINT NOT NULL REFERENCES settlement_statements(id) ON DELETE RESTRICT,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rate_id BIGINT NOT NULL REFERENCES partner_share_rates(id) ON DELETE RESTRICT,
  share_bp INTEGER NOT NULL CHECK (share_bp BETWEEN 0 AND 10000),
  include_idle BOOLEAN NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL CHECK (to_date >= from_date),
  sessions INTEGER NOT NULL CHECK (sessions >= 0),
  energy_dong BIGINT NOT NULL CHECK (energy_dong >= 0),
  idle_dong BIGINT NOT NULL CHECK (idle_dong >= 0),
  base_dong BIGINT NOT NULL CHECK (base_dong >= 0),
  share_dong BIGINT NOT NULL CHECK (share_dong >= 0)
);

CREATE INDEX settlement_statements_month_generated_idx
  ON settlement_statements (month, generated_at DESC);

CREATE INDEX settlement_lines_statement_owner_idx
  ON settlement_lines (statement_id, owner_id);

CREATE FUNCTION reject_settlement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'settlement data is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER settlement_statements_no_update_delete
  BEFORE UPDATE OR DELETE ON settlement_statements
  FOR EACH ROW EXECUTE FUNCTION reject_settlement_mutation();

CREATE TRIGGER settlement_statements_no_truncate
  BEFORE TRUNCATE ON settlement_statements
  FOR EACH STATEMENT EXECUTE FUNCTION reject_settlement_mutation();

CREATE TRIGGER settlement_lines_no_update_delete
  BEFORE UPDATE OR DELETE ON settlement_lines
  FOR EACH ROW EXECUTE FUNCTION reject_settlement_mutation();

CREATE TRIGGER settlement_lines_no_truncate
  BEFORE TRUNCATE ON settlement_lines
  FOR EACH STATEMENT EXECUTE FUNCTION reject_settlement_mutation();
