-- Preserve safe, diagnostic provider rejection information for outbound WhatsApp attempts.
-- Raw provider response bodies, phone numbers, URLs and credentials must never be stored here.
alter table public.gr_wa_messages
 add column if not exists provider_error_code text,
 add column if not exists provider_error_message text;
comment on column public.gr_wa_messages.provider_error_code is 'Safe HTTP/provider status code only. No credentials.';
comment on column public.gr_wa_messages.provider_error_message is 'Sanitized short provider failure reason. No full response, recipient data or authentication headers.';
