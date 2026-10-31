-- Reject incorrectly formatted Indian sender phone numbers for SocialBerries.
-- Empty values remain permitted while a provider slot is not configured.
ALTER TABLE public.gr_wa_connections
  ADD CONSTRAINT gr_wa_socialberries_sender_phone_format
  CHECK (lower(provider) <> 'socialberries'
    OR sender_phone = ''
    OR sender_phone ~ '^\+91[6-9][0-9]{9}$');
