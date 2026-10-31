# GreenRich ONE · Dual WhatsApp Marketing Integration

## Released CRM workspace
The Marketing page is a separate GreenRich ONE sidebar module with a WhatsApp icon. Existing Admin, Marketing, Director and Office Admin role permissions control visibility and actions. Company access is limited to assigned GreenRich companies.

Each company can configure two independent provider display slots:
- Slot 1 defaults to SocialBerries (https://whatsapp.socialberries.in/home).
- Slot 2 is available for the other WhatsApp provider.
These are **metadata entries, not authenticated connections** until the external APIs are integrated.

### Available and working today
- Modern Marketing overview and consent-status chart
- Configurable two-provider slots per company (Admin)
- CRM marketing contacts with opt-in/opt-out and documented consent evidence
- Company and provider filters, search and consent filters
- Controlled import from permitted CRM leads/customers; imported records have **unknown** consent
- Campaign drafts with company, provider, message template, source/tag/search audience filters and opt-in audience preview
- CRM message template drafts; cannot claim external WhatsApp approval
- Automation workflow drafts (new lead, follow-up, orders and manual); never silently activate sends
- Read-only inbox and analytics based on verified message records only (empty until webhooks are connected)
- CSV export for role-authorized contacts/reports

### Provider setup still required
**Do not paste real API keys into the public CRM, GitHub repository, URL query strings or chat.** Store them in Supabase Edge Function Secrets. For **each** provider request:
1. Base API URL and auth headers / authentication method
2. Phone-number / channel identifier and connection validation endpoint
3. Send approved-template and free-form/reply endpoint definitions
4. Approved-template listing and parameter mapping
5. Bulk campaign / schedule API availability and rate limits
6. Webhook URL registration steps and signature verification algorithm / signing secret
7. Incoming message, delivery/read/failure status payload samples
8. Idempotency keys, opt-out handling, billing/limits and multiple-number support

The two providers may have different request schemas. Create separate adapters with their own secrets and one normalized CRM message model.

### Safety gates required before enabling delivery
- Confirm account, sender, and provider API access from an authenticated server-side probe.
- Reject incoming webhooks without valid provider-specific signatures or bearer verification.
- Enforce employee marketing permission and company scope on every API request.
- Enforce customer marketing opt-in and opt-out; never infer consent from CRM presence or Meta Ads leads.
- Use provider-approved templates for outbound business-initiated WhatsApp campaigns.
- Deduplicate recipients and retries; persist idempotency keys and provider response IDs.
- Observe WhatsApp messaging windows, rate limits, error handling and provider terms.
- Enable scheduled sends only after durable queue, retry policy, and unsubscribe processing are tested.
- Never infer messages were sent or read without matching provider events.

### Supabase database
Migration: `supabase/migrations/20261031090000_dual_whatsapp_marketing.sql`.
Tables: `gr_wa_connections`, `gr_wa_contacts`, `gr_wa_templates`, `gr_wa_campaigns`, `gr_wa_automations`, `gr_wa_messages`.
All tables use RLS and assigned-company checks. Messages are read-only from the browser. Provider connections cannot be marked verified/enabled by browser clients.

### Non-features pending provider documentation
Sending WhatsApp messages; receiving live WhatsApp conversations; importing provider campaigns/templates; provider delivery/read status; shared inbox replies; automations firing and scheduling messages.

### Deployment path
GitHub Pages serves the Marketing UI; Supabase holds company-scoped data. Supabase Edge Functions can securely host separately reviewed provider adapters and signed webhook receivers. The second provider name/API credentials and SocialBerries endpoint specification are required to finish actual WhatsApp connectivity.
