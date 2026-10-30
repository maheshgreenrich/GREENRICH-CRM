# GreenRich ONE — Meta Lead Ads → Google Sheets → Leads Pipeline

**Source:** the Google Sheet "meta leads", ID `1oyrt_jUpmOCoHDJYecdvipyHGL0BKeeG00jVOqs3GdI`, exact tab `Sheet1`. The current sheet has a blank first row and one test lead in row 2, with A=Name, B=Phone, C=Email, D=Product. Existing rows are deliberately NOT imported.

## What was built
- In GreenRich ONE, **Leads & CRM → Meta Leads Sync** (visible to Admin only).
- Admin selects the GreenRich company and an active Sales employee, then generates a one-time 256-bit integration token. The source config stays disabled until Admin configures it.
- Five-minute Google Apps Script polling bridge in `integrations/meta-google-sheets/Code.gs` reads **new rows only** and posts them through a single, token-protected Supabase RPC.
- Database migration `supabase/migrations/20261030184500_meta_sheet_lead_sync.sql` creates source configuration, an idempotency ledger, and scoped ingestion functions.
- New CRM records automatically enter **New** stage, `source=Meta Ads`, are assigned to the configured salesperson, and appear on their Leads board. An immutable lead-stage history event documents import.

## One-time setup (you must do it while signed into the owner/editor Google account)
1. Open GreenRich ONE → **Leads & CRM** → **Meta Leads Sync**.
2. Choose the correct company; select the employee responsible for Meta Ads enquiries.
3. Click **Generate connection token / Save assignment**. This rotates the previous token, if any. Copy the three displayed values:
   - `GREENRICH_SUPABASE_URL`
   - `GREENRICH_PUBLISHABLE_KEY` (only `sb_publishable_` — **never** `sb_secret_` or `service_role`)
   - `GREENRICH_IMPORT_TOKEN` (64 hex characters; secret, shown once)
4. In the actual Google Sheet, choose **Extensions → Apps Script**, and paste the complete contents of `integrations/meta-google-sheets/Code.gs` as the bound script. Save.
5. In Apps Script Project Settings → **Script Properties**, create those three keys with the copied values. Do not paste the secret token into source code or any sheet cell.
6. Select and run **`greenrichInstallTrigger`** once. Allow the requested Google permissions. It stores the current last row as the starting cursor (currently test row 2) and creates a **5-minute** time-based trigger.
7. Run `greenrichTestConnection`; read the execution log for an acknowledgement (zero imported).
8. Append a brand-new TEST lead to the bottom of the sheet, with name, Indian phone, email and product in A–D. Run `greenrichSyncNow` manually once to verify the first import, then confirm it appears in the assigned employee's **New** lead stage. Thereafter the trigger runs every five minutes.
9. Keep existing Meta→Sheet automation working. If Meta adds standard headers, the script switches to header-based mapping automatically.

### Data mapping
- Without headers (current): A Name, B Phone, C Email, D Product.
- With Meta headers: full_name, phone_number, email, campaign_name, form_name, created_time, lead ID etc.
- Phone normalized to `+91XXXXXXXXXX` for 10-digit Indian numbers.
- Existing customer/lead rows are never overwritten by the integration.
- Duplicate prevention: same Meta lead ID (if provided), otherwise same source tab + original Google row number.
- If any incoming row fails validation, that batch is **not** advanced; review Apps Script execution logs and correct the sheet.
- Product interest and campaign are stored in the lead notes; product ID is not guessed.

### Security and operational boundaries
- The Supabase publishable key is public; the 256-bit token must remain in private Script Properties.
- `gr_meta_sheet_configure` and `gr_meta_sheet_status` require signed-in Admin and company membership.
- Incoming `gr_meta_sheet_ingest` is callable as `anon` ONLY with an exact sheet ID/tab AND a matching hashed token. A token authorizes one company and one assigned employee; no caller-supplied company or assignee is trusted. Maximum 40 records per request.
- Token hashes, not plaintext, are stored in the database. Rotating token invalidates the old one. Do not paste token into ChatGPT, GitHub issues, public scripts or customer data.
- Google Sheets changes written through API do **not** reliably trigger `onEdit`. Use the time-driven trigger.
- If the Google Script is not installed, no background synchronization is active, even if the CRM admin config is saved.
- If the source Google Sheet layout or tab name changes, review the integration; never silently guess a new source.
- Google Apps Script has usage quotas; monitor failed trigger executions and exceptions. The integration retries the same batch with idempotency if a response was lost.
- Avoid importing old data or clearing the cursor without an Admin-approved backfill plan.

## Troubleshooting
- **No leads imported**: check Meta is actually appending new rows to this exact `Sheet1`; run `greenrichTestConnection` and `greenrichSyncNow` in Apps Script; inspect Executions logs.
- **403 invalid token**: regenerate the token via CRM Admin, then update the Script Property. It is only displayed once.
- **Different company or employee**: choose the company and sales employee in the CRM wizard, regenerate the token, replace the property.
- **Script editing request in Google**: only a Google account with edit access can create/authorize the bound script. ChatGPT's connected Drive data-access permission does not authorize installing time-driven Apps Script triggers.

## Current activation state
Repository and database integration can be installed centrally. **The Apps Script is not installed or scheduled by ChatGPT**, because Google Drive APIs do not grant Apps Script execution/deployment privileges. An editor of the Sheet must complete the one-time steps above. No sample lead is auto-imported until then.
