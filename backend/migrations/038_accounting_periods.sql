CREATE TABLE accounting_periods (
  id BIGSERIAL PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  closed_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ,
  reopened_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accounting_periods_month ON accounting_periods(month);
CREATE INDEX idx_accounting_periods_status ON accounting_periods(status);

CREATE OR REPLACE FUNCTION is_period_closed(check_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE month = date_trunc('month', check_date)::date
      AND status = 'CLOSED'
  );
$$;
