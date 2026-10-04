-- Store OCPP message keys against the stable charge point primary key.
ALTER TABLE ocpp_messages ADD COLUMN charge_point_id BIGINT;
ALTER TABLE ocpp_messages ALTER COLUMN message_id TYPE TEXT;

UPDATE ocpp_messages messages
SET charge_point_id = charge_points.id
FROM charge_points
WHERE charge_points.code = messages.charge_point_code;

DELETE FROM ocpp_messages WHERE charge_point_id IS NULL;

ALTER TABLE ocpp_messages ALTER COLUMN charge_point_id SET NOT NULL;
ALTER TABLE ocpp_messages DROP CONSTRAINT ocpp_messages_pkey;
ALTER TABLE ocpp_messages DROP COLUMN charge_point_code;
ALTER TABLE ocpp_messages
  ADD CONSTRAINT ocpp_messages_pkey PRIMARY KEY (charge_point_id, message_id);
