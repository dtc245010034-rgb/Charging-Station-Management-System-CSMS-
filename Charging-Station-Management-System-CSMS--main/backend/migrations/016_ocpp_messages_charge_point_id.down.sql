ALTER TABLE ocpp_messages ADD COLUMN charge_point_code VARCHAR(50);

UPDATE ocpp_messages messages
SET charge_point_code = charge_points.code
FROM charge_points
WHERE charge_points.id = messages.charge_point_id;

DELETE FROM ocpp_messages WHERE charge_point_code IS NULL;
ALTER TABLE ocpp_messages ALTER COLUMN charge_point_code SET NOT NULL;
ALTER TABLE ocpp_messages DROP CONSTRAINT ocpp_messages_pkey;
ALTER TABLE ocpp_messages DROP COLUMN charge_point_id;
ALTER TABLE ocpp_messages ALTER COLUMN message_id TYPE VARCHAR(64);
ALTER TABLE ocpp_messages
  ADD CONSTRAINT ocpp_messages_pkey PRIMARY KEY (charge_point_code, message_id);
