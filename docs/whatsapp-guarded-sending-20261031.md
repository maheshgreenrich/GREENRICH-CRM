# Guarded SocialBerries Marketing in GreenRich ONE

This release adds a separate Edge Function named greenrich-whatsapp-send. It never starts sending on deployment.

1. Configure SocialBerries Basic Auth HTTPS URL, username and password using the matching SB_GROW_INDIA_SLOT1 or SB_ENVIRO_SOLUTIONS_SLOT1 Supabase Secrets.
2. In GreenRich ONE confirm the full approved MARKETING template JSON and manually document approval evidence. This is admin-attested, not provider-API verified.
3. Record each recipient's genuine WhatsApp marketing opt-in with source and evidence.
4. Explicitly set SB_ENABLE_MARKETING_SEND=true in Supabase Secrets only after authenticating the connection and verifying a test recipient. Default is OFF.
5. The adapter re-checks saved CRM recipients and consent on every send, then submits at most three recipients in one explicitly confirmed request using the documented individual template API.
6. Repeated requests cannot resubmit the same campaign/phone; uncertain results are never auto-retried. Provider acceptance is not proof of message delivery.
7. The native bulk CSV schema is unconfirmed, so this version uses individual documented POST requests rather than inventing a CSV layout.
8. Private campaign image links are signed server-side for 24 hours and require an IMAGE header in the approved template.

Never put Basic Auth credentials in browser code, GitHub, or ChatGPT.