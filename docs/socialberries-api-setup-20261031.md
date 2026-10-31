# SocialBerries → GreenRich ONE: Confirmed API and Secure Setup

Grounded in the SocialBerries screenshots and OpenAPI docs supplied 2026-10-31. No credentials stored here.

## Confirmed HTTP Basic API endpoints

| Action | Method and path | Implementation |
| --- | --- | --- |
| Create lead | POST /api/v1/leads/ | documented only |
| List leads | GET /api/v1/leads/ | documented only |
| Connection test | GET /api/v1/users/?page=1 | read-only gateway |
| Get user detail | GET /api/v1/users/{user_id}/ | documented only |
| Send approved template | POST /api/v1/whatsapp/messages/?phone_number=919XXXXXXXXX | disabled pending opt-in |
| Get messages | GET /api/v1/whatsapp/messages/?phone_number=919XXXXXXXXX&page=1&limit=15 | read-only admin lookup |
| Send text | POST /api/v1/whatsapp/messages/?phone_number=919XXXXXXXXX, application/json body: message_text, type=text | documented, disabled |
| Send media | POST /api/v1/whatsapp/messages/?phone_number=919XXXXXXXXX, multipart/form-data body: type, message_text, attachment | documented, disabled |
| Create bulk campaign | POST /api/v1/whatsapp/messages/bulk/ | documented; send disabled |
| List bulk batches | GET /api/v1/whatsapp/messages/bulk_batches/?page=1&limit=10&status= | read-only gateway |
| Batch details | GET /api/v1/whatsapp/messages/bulk_batches/{batch_id}/ | documented only |

Screenshots document Authorization: Basic base64(username:password) and an API credential creation screen. **They do not confirm whether the Developer API key substitutes for the Basic password**. Request this confirmation. They also do not provide the actual HTTPS API base URL, Get Templates listing endpoint, webhook signature verification format, or opt-out semantics.

## Exact connection steps

1. SocialBerries → Developers → Add New Key → name GreenRich ONE CRM. Choose a time-limited expiry (for example, one year with rotation). Ask SocialBerries whether Allowed IPs can be blank because Supabase Edge Functions do not promise a fixed outbound IP.
2. Ask SocialBerries support for HTTPS API base URL, Basic username/password or how its API key maps to Basic Auth; approved-template listing endpoint and authenticated webhook event samples. Never send real secrets in chat or paste them into the CRM.
3. GreenRich ONE → Settings → WhatsApp Integration → Tool 1 → provider identifier must be socialberries. Save provider name and WhatsApp sender.
4. In Supabase Dashboard → Edge Functions → Secrets set values described below. Values stay on the server, not in browser/local storage/GitHub.
5. Return to Settings → WhatsApp Integration and press Test Connection (read-only). It calls GET /api/v1/users/?page=1, reporting only success/failure and the user count. **It never sends messages.**
6. Read Campaign Status retrieves up to ten SocialBerries batch summaries, with read-only permissions.
7. View Message History allows an Admin to enter a specific Indian WhatsApp number and read up to 15 records/page from GET /api/v1/whatsapp/messages/?phone_number=...&page=1&limit=15. No messages are saved to GreenRich CRM, and no messages are sent. Because the supplied Get Messages 200 response schema is empty, an unexpected response shape will display a warning rather than guessing fields.
8. To use existing templates before SocialBerries supplies Get Templates API, press Import Existing Template JSON (reference only), and paste one complete template preview containing id, name, language, category, components (including BODY text). This is stored as NOT VERIFIED; it cannot send by itself.

## Secret names

For GreenRich Grow India, WhatsApp Tool 1:
- SB_GROW_INDIA_SLOT1_BASE_URL — official HTTPS API host (not the docs dashboard)
- SB_GROW_INDIA_SLOT1_BASIC_USERNAME — HTTP Basic username confirmed by provider
- SB_GROW_INDIA_SLOT1_BASIC_PASSWORD — HTTP Basic password confirmed by provider
- SB_GROW_INDIA_SLOT1_API_VERSION — optional, defaults to v1

For GreenRich Enviro Solutions, Tool 1:
- SB_ENVIRO_SOLUTIONS_SLOT1_BASE_URL
- SB_ENVIRO_SOLUTIONS_SLOT1_BASIC_USERNAME
- SB_ENVIRO_SOLUTIONS_SLOT1_BASIC_PASSWORD
- SB_ENVIRO_SOLUTIONS_SLOT1_API_VERSION (optional)

Use SLOT2 for another SocialBerries connection on Tool 2; a different second provider requires its own adapter.

## Boundaries and security

The deployed Supabase Edge Function greenrich-socialberries uses verify_jwt=true, checks signed-in Admin and company permission, reads server-side Basic credentials and allows only the two read-only operations (test and batches).

Missing from supplied API material: official Get Templates endpoint, authenticated inbound webhook schema and signing method, marketing opt-out event, pricing/rate limits, and official public API host. These are required before enabling direct welcome sends, bulk campaigns, webhook leads and recurring service reminders.

The bulk endpoint supports multipart file upload, which is relevant to GreenRich-selected contacts, but a consent-safe CSV format and opt-out behavior must be verified first. API credentials must never be put in the browser or public repository. Mere OTP login is not marketing consent.

## New Text, Media and Get Messages OpenAPI material (2026-10-31)

- Text: POST /api/v1/whatsapp/messages/ with query phone_number or SocialBerries client/lead and JSON {message_text, type:'text'}.
- Media: same endpoint with multipart/form-data {type, message_text, attachment}. type can be image, video, document, audio; attachment is a binary file.
- Get Messages: GET with one of phone_number/client/lead and required page and limit. No complete response schema was supplied. Display only whitelisted message metadata from a recognized list; never assume undocumented JSON fields are present.
- WhatsApp message policies/24-hour service windows, opt-in and template approval must be respected. A successful HTTP 200 does not establish message delivery: track provider message status separately.
- GreenRich ONE message-history gateway remains Admin/company scoped and read-only; a future send flow requires server-side role/consent checks, per-recipient idempotency, opt-out, safe retry and a documented session eligibility check.
