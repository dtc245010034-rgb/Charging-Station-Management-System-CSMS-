-- S-18: lưu transactionData gửi cùng StopTransaction
ALTER TABLE charging_sessions
  ADD COLUMN IF NOT EXISTS transaction_data JSONB;
