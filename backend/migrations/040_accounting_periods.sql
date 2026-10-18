CREATE TABLE accounting_periods (
  id BIGSERIAL PRIMARY KEY,
  month DATE NOT NULL UNIQUE CHECK (EXTRACT(DAY FROM month) = 1),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  reopened_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT
);

CREATE INDEX accounting_periods_status_month_idx
  ON accounting_periods (status, month);

CREATE OR REPLACE FUNCTION is_period_closed(target_date DATE)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM accounting_periods
    WHERE month = date_trunc('month', target_date)::date
      AND status = 'CLOSED'
  );
$$;
