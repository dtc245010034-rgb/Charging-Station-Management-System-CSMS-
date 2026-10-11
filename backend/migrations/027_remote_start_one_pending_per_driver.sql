UPDATE remote_start_requests
SET status = 'TIMED_OUT', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE status = 'PENDING' AND deadline <= CURRENT_TIMESTAMP;

WITH ranked_pending AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY driver_id ORDER BY created_at DESC, id DESC) AS position
  FROM remote_start_requests
  WHERE status = 'PENDING'
)
UPDATE remote_start_requests AS requests
SET status = 'ERROR', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
FROM ranked_pending
WHERE requests.id = ranked_pending.id AND ranked_pending.position > 1;

CREATE UNIQUE INDEX remote_start_one_pending_per_driver
  ON remote_start_requests (driver_id)
  WHERE status = 'PENDING';
