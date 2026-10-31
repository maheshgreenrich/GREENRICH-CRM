# GreenRich ONE — Marketing Workspace v2 (31 October 2026)

## Four-tab layout

### Audience & Campaign
Company, date range, contact type, source, tags, salesperson, product, and lead stage filters. CRM contact selections must be tied to a single company before a campaign draft can be created. Contacts that cannot be linked to exactly one company by order/consent records are excluded from company-specific sends.

Provider + existing template + optional private JPG/PNG/WebP image (max 5 MB), then Save campaign draft. Uploaded images are stored privately in Supabase Storage. The provider's `file` parameter in its bulk-message endpoint appears to describe an **audience CSV**, not an attachment. Do not submit uploaded images as campaign media until its approved template has a supported media header and provider documentation confirms how to populate it.

Send WhatsApp Marketing button remains disabled pending confirmed API Basic Auth, complete approved template preview/components, provider-specific image handling, opt-in/opt-out checks and bulk CSV request schema. Check sending readiness shows missing conditions. **No actual messages are transmitted by this release.**

Campaign reports list CRM drafts, and Admin can request actual SocialBerries bulk-batch stats with total/pending/sent/delivered/read/failed. READ is provider read status, not guaranteed attention. Response/no-response cannot be measured from the provided batch API and remains unavailable until inbound event ingestion is signed and tested.

### Incoming Leads
Search a CRM customer/lead by phone/name, see company association and request read-only message history. Customer 360 has the same lookup for a single-company customer. Incoming assignment rules under Settings support salesperson/common queue, but automated new WhatsApp enquiry creation requires verified SocialBerries webhook events + signature/payload documentation. The documented Get Messages endpoint requires a **known phone number**; it does not list new senders or define a signed event callback. OTP-only traffic must not become marketing leads.

### Lead Welcome
Existing optional template selectors remain in manual creation, Excel/CSV import, and Google Sheet settings. Empty selection means no message. Sync/refresh shows CRM references only; full live SocialBerries Get Templates endpoint is still missing and is not invented. Welcome auto-delivery remains disabled until sending verification.

### Repeat Service
Date, company, contact type, source, tags, product, sales-order ID and delivery status filters use `gr_dispatch_orders`. Staff may select matching customers to save separate after-sales repeat-rule drafts. Repeat frequency can be an exact integer of days, weeks or calendar months, stored in `interval_value`/`interval_unit`; `interval_days` stays a bounded legacy field and does **not** define how calendar months are processed. Categories: delivery, reminder, offer, related-product promotion, service. **No cron/sending loop activated**.

## Security
Supabase company-scoped RLS remains authoritative. New bucket is private, company Admin upload-only, 5 MB, image MIME restricted. Company assignment is derived from existing consent/order relationships, not from the global CRM dropdown. Existing CRM records are not mutated or imported into SocialBerries by this UI. No basic-auth secrets in code or browser storage.

## Provider requirements to finish
1. Confirm `https://api.antcrm.co` Basic Auth client-key/secret mapping with **Test Connection**.
2. Supply provider Get Templates endpoint and approved template JSON/components, including media-header fields.
3. Supply signed incoming webhook documentation, inbound message/status payload examples, and reply/opt-out fields.
4. Supply bulk upload CSV format, messaging rate limits, idempotency rules and recipient consent requirements.
5. Validate everything with a small opt-in internal test audience before enabling actual sends.
