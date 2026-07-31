-- NGACCUL Platform - One-Time Initial PDG Account Seed
-- Provisions the PDG's identity (phone) and a one-time setup code.
-- pin_hash is intentionally NULL — the PDG sets their own PIN on first login
-- using this setup_code. The setup_code is cleared automatically after use.

INSERT INTO profiles (
  id,
  branch_id,
  role,
  full_name,
  phone,
  subdivision,
  locality,
  is_active,
  force_password_change,
  joined_at,
  unique_display_id,
  pin_hash,
  setup_code
) VALUES (
  gen_random_uuid(),
  'ngde',
  'pdg',
  'Mr. MBAH',
  '693935815',
  'Ngaoundéré',
  'HQ Main Office',
  true,
  false,
  now(),
  'NGC-PDG-00001',
  NULL,
  'ngaccul2026'  -- give this code to Mr. MBAH privately (call/SMS/in person), not over email or chat
);
