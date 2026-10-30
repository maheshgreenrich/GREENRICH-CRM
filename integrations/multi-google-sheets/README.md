# GreenRich ONE: Multiple Google Sheets Lead Integrations (October 2026)

## Access
Sign into GreenRich ONE as **Admin** → **Settings → Google Sheet Leads**. A shortcut is also available in **Leads & CRM → Sheet Integrations / Duplicates**, and at `meta-sync.html`.

This is a new multi-source manager. The original single-sheet Meta connection remains in place and its import credential remains valid. Existing customers and lead records are never deleted.

## Add each Sheet
1. **+ Add Google Sheet** → enter its full Google Sheet URL and exact tab name.
2. Select **GreenRich company**, advertising **source** (Meta Ads / Google Ads / TradeIndia / IndiaMART / Website / Other), brand, default product interest, optional exact product SKU and a specific salesperson. Never infer the company from the Sheet name.
3. Map **Name** and **Phone** columns, and optionally Email, City, Requirement, Household Size, Current Composting, Purchase Timeline, Remarks, Platform Lead ID, Campaign, Form and Submitted Date. Example actual *Home Composter Leads* report: **B** requirement, **C** household size, **D** existing composting, **E** buying timeline, **F** email, **G** full name, **H** phone, **I** city, **J** remarks. These are the source report's column letters; verify the tab before saving.
4. Select **New rows only** (recommended) or **Import existing history** for a reviewed backlog.
5. Save. New source appears in Connected Sheets, with status, last sync, processed cursor, error, and per-Sheet import history.

## Critical: update the one existing Google Apps Script
The Apps Script you installed earlier only reads ONE fixed Google Sheet. It **cannot** sync any new Sheet until you replace that code with [integrations/multi-google-sheets/Code.gs](./Code.gs) in the SAME Apps Script project.

Keep these 3 existing private Script Properties:
- `GREENRICH_SUPABASE_URL`
- `GREENRICH_PUBLISHABLE_KEY`
- `GREENRICH_IMPORT_TOKEN`

The token remains private in Google Apps Script Properties and is never saved in the public frontend. In Apps Script **Code.gs**, replace old code with the new central code, **Save**, run `greenrichTestConnection` (should list active configured sources), run `greenrichInstallTrigger` once to reinstall the five-minute time-driven trigger, then run `greenrichSyncNow` for an immediate test.

**Do not deploy as a Web App.** The new script runs inside the existing Apps Script project using the Google account's authorized access to each connected Sheet. This account must have access to every registered spreadsheet. If access is missing, the manager shows a source-specific error instead of silently dropping leads.

## Duplicate handling
- Source row identity `(connection_id,row_number)` is idempotent: the same row is not added twice when the script retries.
- A **different row** with an existing phone/email is **imported as a new lead** and flagged:
  - Duplicate Leads: matches company-scoped existing enquiries.
  - Duplicate Contacts: matches the existing customer master.
  - Both: both kinds of match.
- Admin can open either duplicate category and choose *Keep separate*, *Reviewed* or *Not duplicate*, with a review note. **No record is merged or deleted automatically.**
- Every source row retains original values and mapped answers so custom questions and free text are not lost.
- Repeated report headings, missing name and rows without usable phone/email are preserved in the **Skipped Rows** audit for manual review.

## Data safety and limitations
- Do not auto-import historical rows until the correct company, mapping, and assignment are reviewed.
- This implementation processes appended rows. It does **not** retroactively update previously imported enquiries if an old spreadsheet row is edited.
- Source credentials are based on the existing company's Admin-managed integration token. Other Admin accounts need their own configured token; rotation requires updating the Google Script Property.
- The current scheduler polls every five minutes; it is near-real-time, not instantaneous. Google Apps Script and Supabase usage quotas apply.
- New connections are settings-only until the Google Apps Script owner replaces the script and authorizes the trigger. GitHub/Supabase cannot remotely install that trigger.
- For high-volume or immediate webhook delivery, migrate to a central Google Sheets API/Meta webhook service with monitored queues.

## Confirm production readiness
1. Add a new Sheet with only test leads, verify **new-only** cursor and 5-minute sync.
2. Confirm source and company, employee assignment, product interest and raw answer mapping.
3. Submit two *different rows* using the same phone; both leads must appear, second flagged duplicate.
4. Rerun the same batch; no third copy.
5. Verify **Duplicate Leads** and **Duplicate Contacts** management and original form answers.
6. Confirm the scheduler reports errors for a Sheet the Google account cannot access.
7. Only then enable real paid-ad Sheets and controlled historical backfill.

**Tamil:** ஒவ்வொரு Google Sheet-க்கும் Company, Source, Product, Salesperson, Column Mapping set பண்ணலாம். ஒரே mobile number மீண்டும் வந்தாலும் புதிய enquiry தனியாக save ஆகும்; Duplicate Leads / Duplicate Contacts tab-ல் warning வரும். ஒரே Sheet row retry ஆனால் மீண்டும் import ஆகாது. Google Apps Script-ல் புதிய Central Code.gs paste செய்து trigger once reinstall செய்ய வேண்டும்.
