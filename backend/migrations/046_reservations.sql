CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SEQUENCE reservations_ocpp_reservation_id_seq AS integer;

CREATE TABLE reservations (
  id BIGSERIAL PRIMARY KEY,
  ocpp_reservation_id INTEGER NOT NULL UNIQUE DEFAULT nextval('reservations_ocpp_reservation_id_seq'),
  driver_id BIGINT NOT NULL REFERENCES users(id),
  connector_id BIGINT NOT NULL REFERENCES connectors(id),
  id_tag_id BIGINT NOT NULL REFERENCES id_tags(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED', 'FULFILLED')),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > starts_at),
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reservations_connector_time_no_overlap
    EXCLUDE USING gist (
      connector_id WITH =,
      tstzrange(starts_at, expires_at, '[)') WITH &&
    ) WHERE (status IN ('PENDING', 'ACCEPTED'))
);

ALTER SEQUENCE reservations_ocpp_reservation_id_seq OWNED BY reservations.ocpp_reservation_id;

CREATE UNIQUE INDEX reservations_one_active_per_driver
  ON reservations (driver_id)
  WHERE status IN ('PENDING', 'ACCEPTED');

CREATE INDEX reservations_driver_status_expiry_idx
  ON reservations (driver_id, status, expires_at);

CREATE INDEX reservations_connector_status_expiry_idx
  ON reservations (connector_id, status, expires_at);