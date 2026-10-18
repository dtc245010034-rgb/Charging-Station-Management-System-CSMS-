CREATE TABLE partner_share_rates (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  share_bp INTEGER NOT NULL CHECK (share_bp BETWEEN 0 AND 10000),
  include_idle BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  CONSTRAINT partner_share_rates_owner_effective_uniq UNIQUE (owner_id, effective_from)
);

CREATE INDEX partner_share_rates_owner_effective_idx ON partner_share_rates (owner_id, effective_from DESC);

CREATE OR REPLACE FUNCTION reject_partner_share_rates_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'partner_share_rates is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER partner_share_rates_no_update_delete
BEFORE UPDATE OR DELETE ON partner_share_rates
FOR EACH ROW
EXECUTE FUNCTION reject_partner_share_rates_mutation();

CREATE TRIGGER partner_share_rates_no_truncate
BEFORE TRUNCATE ON partner_share_rates
FOR EACH STATEMENT
EXECUTE FUNCTION reject_partner_share_rates_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON partner_share_rates FROM PUBLIC;
