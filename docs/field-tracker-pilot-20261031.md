# GreenRich ONE — Field Tracker Standalone Pilot (31 Oct 2026)

## Pilot URL
After deployment: https://maheshgreenrich.github.io/GREENRICH-CRM/field-tracker.html

**Not in the main GreenRich ONE sidebar.** Uses the same employee Supabase login, company memberships and CRM customer/lead data. No new credentials or app server required. Pilot check-in/out lives in separate `gr_field_sessions` records and **does not affect official attendance, payroll, or GreenRich ONE attendance**.

## Features
1. **My Shift:** Check In with current browser GPS coordinates, accurate server timestamp and phone-reported accuracy; Check Out with another fresh GPS reading. View both locations and field time history. Location records approximately every 55–60 seconds **only while the pilot page is visible and shift is active**. If a phone locks, the tab is suspended, GPS permission is withdrawn or connectivity fails, updates can stop. Show stale points with timestamps, never falsely claim continuous background tracking.
2. **My Visits:** Service, Sales, Site types; assign visits to employee; schedule due datetime; link optional CRM customer and lead; user records GPS arrival, uploads one or more proof photos (private Supabase bucket), description and GPS metadata, then completes with GPS, time and report. Completion requires at least one photo and at least 10 characters of notes.
3. **Lead heat:** Hot/Warm/Cold can be set on a completed Sales/Site visit linked to a company CRM lead; server-side RPC updates `gr_lead_pipeline.lead_heat` without changing lead pipeline stage.
4. **Repeat Service:** Select every N days/weeks/calendar months (1–365), optional end date. Completion creates the *next scheduled visit* server-side, with unique previous-visit link to prevent duplicates; there is no WhatsApp send or cron job.
5. **History:** Visit records with customer, assigned staff, GPS arrival/completion, report, photo evidence (five-minute signed image URLs), route history with GPS accuracy and server timestamps.
6. **Supervisor View:** Admin/Director may see company GPS/visits; Sales Head role if added; additionally Admin can explicitly grant pilot supervisor privileges to a company staff member. Supervision shows last known points on OpenStreetMap/Leaflet with stale update status, NOT guaranteed real-time. Location access is scoped by authenticated Supabase row-level security.
7. **Company boundaries:** Both Grow India and Enviro Solutions included. All records company-scoped; only the assigned staff member may GPS check in, arrive, take photos and complete their own visits.

## Pilot launch checklist
- In GreenRich ONE `secure.html`, sign in as an active employee. Open the separate pilot URL in the **same browser**. If not signed in, go back to secure login.
- Android phone: enable precise location and allow HTTPS browser geolocation. Check in while visible; confirm time/map link; walk a short, authorized trial route; check out.
- Create a *test service visit* assigned to yourself. GPS check in, arrive, take one authorized non-sensitive JPEG, enter a note, complete. Confirm GPS/photographs/history. Set repeat interval (e.g. 7 days) and confirm one next visit is created.
- For Sales/Site, link an appropriate CRM lead, complete with photo and notes, select Hot/Warm/Cold; verify the real lead's priority changed.
- Admin: approve a designated Sales Head in Supervisor Access, then sign in as that person in a different browser and verify team tracking; ordinary non-manager must not view other employees.
- Test mobile network loss, disabled GPS, permission denial, page hidden/phone locked. GPS should stop or show stale, and photo/checkout should not claim success without permission.
- Agree on employee location notice, retention/deletion policy, duty-hours scope and permitted access before real rollout. Use authorized employee agreement / company policy and applicable legal review.

## Known limitations
- This is a browser/PWA-style **foreground pilot**, not an Android background tracking app.
- No guarantee of minute-level positions when browser is in background, device locked or offline; no offline upload queue in v1.
- GPS readings are device-reported and can be inaccurate or spoofed. No fraud-proof site check-in.
- Repeating visit schedules are generated on completion, not by a daily cron.
- No payroll integration and no main CRM sidebar linkage until the pilot is accepted.
- Map tiles load from OpenStreetMap; read the usage policy before scaling to production. Photos stored privately in `gr-field-visit-proofs`, max 5MB JPEG/PNG/WebP.
- Historical GPS/photo retention deletion and mobile push notifications require an approved policy and further implementation before production.

## Technical scope
- `field-tracker.html`, `field-tracker.css`, `field-tracker.js`
- `gr_field_sessions`, `gr_field_points`, `gr_field_visits`, `gr_field_photos`, `gr_field_supervisors` and `gr_field_directory`.
- Server-side `gr_field_clock_in`, `gr_field_clock_out`, `gr_field_record_point`, `gr_field_create_visit`, `gr_field_arrive`, `gr_field_add_photo`, `gr_field_finish_visit`, `gr_field_assign_supervisor` with RLS.
- Tests: `tests/field-tracker-pilot.js`.
