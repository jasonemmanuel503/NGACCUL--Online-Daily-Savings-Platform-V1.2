-- Migration: add archive/reconciliation-batch tracking columns to transactions
-- Fixes: "Could not find the 'archive_batch_id' column of 'transactions' in the schema cache"
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS archive_batch_id TEXT DEFAULT NULL;

-- Optional but recommended: speed up reconciliation/audit lookups by batch
CREATE INDEX IF NOT EXISTS idx_transactions_archive_batch_id ON transactions (archive_batch_id) WHERE archive_batch_id IS NOT NULL;
