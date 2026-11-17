# WhatsApp Operations Hub — GreenRich ONE

## User-facing modules
- **Audience & Campaign**: filters by company, lead/customer, source, CRM tags, salesperson, product, lead stage, date and search. Select individual contacts or all currently filtered contacts, capped at 500 per campaign. The server independently validates sender/company membership, real consent, template components and sending readiness.
- **Campaign History**: CRM drafts/attempts plus read-only SocialBerries bulk-batch statistics. Only provider-supplied `sent`, `delivered`, `read`, `failed` are shown as confirmed. CTA button click counts are **not available** from the supplied API, never estimated.
- **WhatsApp Inbox**: locally saved message events and admin on-demand SocialBerries conversation-history lookup by known number. Historical provider messages are not silently or automatically imported until the provider's webhook/appropriate sync API is connected.
- **Lead Assignment**: maps WhatsApp enquiries, website enquiries and verified website WhatsApp-OTP logins to a company salesperson, source and CRM tag. Rules can be draft/active/paused. OTP login does **not** imply WhatsApp marketing opt-in.
- **After-Sales**: existing customer/order filters and manual follow-up drafts retained.
- **Product Guidance**: per-product +N-days-after-delivery draft instructions and optional video URL/template, with due-date previews computed only from actual `gr_dispatch_orders.delivered_at`. These are NOT scheduled sends.
- **Settings**: active provider cannot be reset casually, optional second-number configuration, manual approved-template sync, lead routing visible; advanced diagnostics behind a disclosure. SocialBerries API credentials remain server-only.

## Trusted inbound gateway — deployed but deliberately disabled until configured
Function: `greenrich-wa-inbound` (Supabase project `uawgwkplkvahhmhvroul`), `POST /functions/v1/greenrich-wa-inbound`.
A real trusted website backend or a verified SocialBerries webhook relay must call it. **Never call from frontend JavaScript.**

Configure Supabase Edge Function secret `GREENRICH_INBOUND_WEBHOOK_SECRET` to a cryptographically random value of at least 32 characters; never paste it into CRM/GitHub/chat. Without it, requests are rejected with 503. The signing integration must be configured on the *server* that proves the event.

Headers:
- `Content-Type: application/json`
- `X-GR-Timestamp: <UNIX epoch seconds>`
- `X-GR-Signature: sha256=<lowercase hex HMAC-SHA256(secret, timestamp + "." + raw_json_body)>`

Clock difference must be within 5 minutes. Duplicate `event_id` is deduplicated server-side.

Sample canonical JSON for **verified** OTP login from the website backend (after its own OTP verification):
```json
{"event_id":"otp:event-unique-00001","company_id":"grow-india","event_type":"website_whatsapp_otp","mobile":"919876543210","name":"Customer Name"}
```

New WhatsApp enquiries require `event_type: "whatsapp_enquiry"`, the correct company `connection_id` UUID, the message text and a unique provider message `event_id`. **Do not send a raw SocialBerries webhook to this custom endpoint until Workaxis supplies its actual payload and signature specification or an authorized signing relay is configured.** The relay must verify Workaxis's source before translating/signing.

Database RPC `gr_wa_accept_trusted_event` is executable only by `service_role`. It records a deduplicated event, links an existing lead/customer by normalized mobile, or creates a new CRM Lead assigned according to an active routing rule. A new lead's source/tag/owner come from the rule. No promotional opt-in is inferred from contact or OTP events.

## Dependencies still required for full production operation
1. Connect website backend's successful WhatsApp OTP verification callback to the signed gateway (not its browser).
2. Workaxis provider's verified inbound-message webhook contract and authenticated status/read event contract, or an authorized relay that converts their payloads.
3. Provider history import/backfill endpoint if the user wants full old chats copied into CRM, rather than on-demand lookup.
4. Approved product/service template IDs and media URLs for each follow-up step, verified consent, and an authorized scheduler with duplicate-prevention. Draft schedules must not send without those requirements.
5. A provider source for real website-button click analytics if supported; message read counts and website-click counts are different.
6. The second WhatsApp sender's provider credentials and sender verification once acquired.

No migration or UI page update automatically sends WhatsApp messages. Do not set sending enabled solely because a template exists or an OTP occurred.
