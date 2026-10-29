# GreenRich ONE — Attendance V3

## Verified live deployment — 29 October 2026

The GreenRich production Supabase project `uawgwkplkvahhmhvroul` now has the V3 attendance schema and all backend migrations applied directly through the connected Supabase management interface. The `attendance-api` Edge Function is **ACTIVE, version 6**, with JWT verification enabled.

The scheduled job `greenrich-v3-daily-absence` is installed at **19:30 UTC / 01:00 IST**, but its required `grm_settings.enabled_from` launch date is **NULL** until the built-in Admin explicitly activates daily absences from the Attendance V3 → Holidays & Shifts screen. A test confirmed the guarded job inserts **0** rows while disabled. Do not change this guard without a rollout plan.

Database checks completed: all eight V3 tables have RLS enabled, privileged write RPCs are denied to anonymous and employee DB roles, Office Admin create/edit/soft-delete and audit tests passed in rolled-back transactions, approval of leave generated ON_LEAVE records in a rolled-back transaction, employee row isolation passed, duplicate check-in and check-out were rejected, and all temporary test rows were rolled back. The five original `gr_attendance` records remain unchanged. There are no V3 live attendance records yet.

**Still required before production sign-off:** live browser testing with actual Employee, Office Admin and built-in Admin sessions, integration verification of REST endpoints and CSV/XLS/PDF downloads, monitoring of the first Cron run after activation, resolution/review of existing Supabase security-advisor warnings, and employee rollout communications. Do not call browser end-to-end testing completed based on database-only tests.

**Do not run `supabase db push` indiscriminately:** migrations were applied through the management interface and have remote-generated history versions, which may differ from repository file timestamps. Reconcile migration history before any future CLI-based push.


## Stack and integration

- **Frontend:** GreenRich ONE static HTML/CSS/JavaScript on GitHub Pages.
- **Authentication:** existing Supabase Auth (email/password).
- **Employee records:** existing `public.gr_profiles` and `public.gr_roles`.
- **API:** Supabase Edge Function `attendance-api` (Deno/TypeScript), organized into controllers, services and repositories.
- **Database:** new PostgreSQL `grm_*` tables with RLS and service-role-only transactional RPCs.
- **Office timezone:** Asia/Kolkata (UTC timestamps in Postgres). The UI date/time inputs assume IST. **If you change the timezone**, update the frontend conversion function and Cron schedule together.

The V3 schema is **isolated** from the old `gr_attendance` and browser-local demo, so deploying it does not migrate, replace or delete previous attendance. Do not run the older Office Admin attendance SQL and the V3 SQL interchangeably.

### Role mapping

- `Admin` → **SUPER_ADMIN** (all attendance and user management via existing Admin workflow).
- `Office Admin` → **OFFICE_ADMIN** (all attendance, correction/leave reviews, shifts, departments, holidays, exports).
- Every other active GreenRich role → **EMPLOYEE** for V3 attendance.

**Updated role delegation:** Besides the built-in `Admin` and `Office Admin` roles, a custom role can receive company-wide Attendance control through the Roles & Permissions matrix. The `All` scope is checked individually for `View`, `Create`, `Edit`, `Delete`, `Approve`, and `Export` in the Edge API and protected PostgreSQL functions. `Own` and `Team` do not grant company-wide admin rights. An approver handling attendance corrections should also receive Create/Edit All, because approving a correction writes the employee's attendance. Employees without All-scope grants can still use the personal attendance features. The backend checks the active Auth identity and live database permissions on every request.

## Single-page attendance experience

**Main portal:** `secure.html`, with the Attendance module rendered inside its existing sidebar and content area. No navigation to a separate HTML page is required.

- **My Attendance (all active users):** server-time Check In / Check Out, clock timestamps, personal monthly color-coded calendar, status summary, detailed check-in/out data sheet, and correction/leave request boxes below the calendar.
- **Employee Attendance (authorised roles):** active employee list from `/admin/staff`, individual quick Present / Absent / Half Day buttons, checkbox Select All bulk attendance with required audit reason, daily/weekly/monthly date filters, individual employee filtering, chart, pending leave and correction approval inbox, and CSV/Excel/PDF reports using `/admin/reports/range`.
- **Safety:** bulk marking skips existing genuine SELF check-in/out entries and doesn't include the signed-in manager's own account in Select All. Managers mark their own clock from My Attendance.
- **Approval notifications:** requests are visible in the authorised approvers' in-app approval inbox; the pending count refreshes while the Attendance module is open. External WhatsApp/email alerts are not configured.
- **Automatic absences:** the scheduled job is installed but stays inactive until Admin sets the go-live date. Missing working-day records remain unmarked until processing is enabled.
- **Test status:** source JavaScript, static DOM selectors and feature regressions checked; rollback-only SQL role grants and safe bulk checks passed. Real signed-in multi-browser acceptance and PDF/Excel output still require manual testing.

### Attendance UI refinement — 29 October 2026

- **One-page navigation:** `secure.html` remains the only main app. Check In and Check Out appear at the top-right, immediately after the signed-in username; the old header My Attendance shortcut is gone.
- **Personal sections unchanged:** daily attendance times, monthly calendar, personal time sheet, correction and leave request sections remain available.
- **Employee Attendance filter:** the second dropdown uses the existing `gr_roles` user-role assignment instead of a separately maintained department. Backend `roleId` filtering also applies to CSV, Excel and PDF exports.
- **Edit attendance:** the record's Edit button opens a modal. Status is chosen from a dropdown, check-in and check-out use date-time picker controls, and saving refreshes the record list and chart immediately. While open, the Admin tab also refreshes approximately every 30 seconds.
- **Round chart:** only attendance statuses with recorded nonzero counts appear, each with its assigned color.
- **Quick roll-call:** each employee row has Present (green), Absent (red), Half Day (yellow), Weekend (dark gray), Holiday (blue), Paid Leave (pink) buttons. Bulk Select All is retained. Actual employee SELF check-ins remain protected from bulk overwrite.
- **No Holidays & Shifts tab** in this Attendance interface. Existing shift configurations and automatic absence scheduler have not been deleted; the latter remains go-live guarded.
- **Notes optional:** Admin create/edit/delete/bulk and review notes, plus employee leave and correction request notes, are optional. Admin audit logs still track who made each change, timestamp, operation, and old/new data. Built-in Admin launch-setting security still separately requires justification.
- **Backend:** Supabase `attendance-api` Edge Function version **6** deployed with JWT verification and the migration `20261029130000_attendance_optional_notes_paid_leave.sql` applied. Optional-note and paid-leave behaviors were checked with rollback-only PostgreSQL tests; no test entries were retained.
- **UI testing:** regression checks passed in source, but live GitHub Pages login and direct browser exercise remain unverified.

## One-time deployment (developer/administrator)

**Protect production:** First back up the Supabase project and run these changes in a staging project. Verify the SQL tests and the V3 UI before switching live attendance.

1. Use a linked Supabase CLI project. Existing GreenRich SQL was manually applied in the dashboard, so inspect `supabase migration list` and reconcile migration history before `supabase db push`; do **not** blindly repair or reset a production database.
2. Apply these migrations **in this order**, once each:
   - `supabase/migrations/20261029090000_attendance_v3.sql`
   - `supabase/migrations/20261029090100_attendance_v3_ops.sql`
   - `supabase/migrations/20261029090200_attendance_v3_assign.sql`
3. Deploy the complete folder (not just index.ts) using:
   ```bash
   supabase login
   supabase link --project-ref uawgwkplkvahhmhvroul
   supabase db push
   supabase functions deploy attendance-api
   ```
   Alternatively use a Supabase project **Dashboard → SQL Editor** to run the three migration files in order. This is a **one-time** installation, not per-employee SQL. Deploy the entire function folder using the CLI; the dashboard editor would require copying all imported files.
4. Supabase normally supplies `SUPABASE_URL` and the service-role key or named secret keys to Edge Functions. Check that the private server environment contains the expected credentials. **Never** put a service-role/secret key into GitHub Pages, messages or committed frontend code.
5. Keep **Verify JWT enabled** for user-facing `attendance-api`. The function additionally verifies the user JWT via Supabase Auth and checks that their profile is active. Requests must include a real Auth JWT as `Authorization: Bearer ...` and the public project key as `apikey`.
6. Open `https://maheshgreenrich.github.io/GREENRICH-CRM/attendance-v3.html`. Sign in first at `secure.html`.
7. For scheduled ABSENT records, enable Supabase Cron under **Integrations → Cron**; review/run `supabase/scheduling/attendance_absences.sql` after checking that the project's Cron scheduler uses UTC. It runs at **19:30 UTC = 01:00 IST** and marks the previously completed office day. Holidays, weekends, approved leave and employees not yet joined are excluded. Monitor Cron job history.

### Office Admin user setup

1. Sign in as the original `Admin` account.
2. Create an employee Auth account and `gr_profiles` record, assigning role **Office Admin**. Create additional employee logins for other staff.
3. On Attendance V3, Office Admin can view all employees, set departments/shifts, mark/correct/delete any date **with a mandatory reason**, bulk mark, review corrections and leave, manage holidays/shifts, and download monthly CSV, Excel (.xls XML Spreadsheet 2003) or PDF.
4. Employees can check in and out exactly once per office day using **server time**, read only their history, request corrections for past dates, and submit/track leave.

Employee accounts and role administration are managed through GreenRich ONE's existing Admin workflow; V3 does not provision Auth users. Its `Office Admin` role does not automatically gain the ability to create/disable other users or edit the role matrix.

## API endpoints (base: `/functions/v1/attendance-api`)

| Method | Route | Role |
|---|---|---|
| POST | `/attendance/check-in` | Employee |
| POST | `/attendance/check-out` | Employee |
| GET | `/attendance/me?from=&to=&page=&pageSize=` | Employee |
| GET | `/attendance/me/summary?month=` | Employee |
| POST | `/attendance/corrections` | Employee |
| GET | `/attendance/corrections/me?page=` | Employee |
| POST | `/leaves` | Employee |
| GET | `/leaves/me?page=` | Employee |
| GET | `/admin/staff` | Office Admin |
| PUT | `/admin/staff/:id/assignment` | Office Admin |
| GET | `/admin/attendance?userId=&department=&from=&to=&status=&page=&pageSize=` | Office Admin |
| POST | `/admin/attendance` | Office Admin |
| POST | `/admin/attendance/bulk` | Office Admin |
| PUT | `/admin/attendance/:id` | Office Admin |
| DELETE | `/admin/attendance/:id` | Office Admin |
| GET | `/admin/corrections?status=&page=` | Office Admin |
| PATCH | `/admin/corrections/:id/review` | Office Admin |
| GET | `/admin/leaves?status=&page=` | Office Admin |
| PATCH | `/admin/leaves/:id/review` | Office Admin |
| GET | `/admin/reports/monthly?month=YYYY-MM&format=csv|xls|pdf` | Office Admin |
| GET/POST | `/admin/holidays`, `/admin/shifts`, `/admin/departments` | Office Admin |
| PUT/DELETE | `/admin/holidays/:id`, `/admin/shifts/:id`, `/admin/departments/:id` | Office Admin |

JSON success shape: `{"data":...}`; errors: `{"error":{"message":"...","status":400}}`. Pagination: `page` starts at 1; `pageSize` 1–100; lists return `items,page,pageSize,total,pages`.

### Examples

```json
POST /attendance/corrections
{"date":"2026-10-28","requestedCheckIn":"2026-10-28T09:30:00+05:30","requestedCheckOut":"2026-10-28T18:00:00+05:30","reason":"Forgot to check out"}
```

```json
POST /admin/attendance/bulk
{"userIds":["UUID-1","UUID-2"],"date":"2026-10-28","status":"PRESENT","reason":"Manual back-office correction"}
```

Bulk marking is **atomic** (all employees or none), limited to 200 per operation. All Admin record writes are soft-deleted/audited with mandatory reasons. Direct database writes from the browser are not granted.

## Business rules

- Server time from PostgreSQL; no user-supplied dates allowed for clock-in/out.
- One unique attendance record per user/date, with row locking during checkout; overnight shifts can check out the next day.
- Late determined by shift start plus grace; half-day determined by completed hours.
- Employee past-date changes require an approved correction, never direct edits.
- Office Admin can mark, update or soft-delete with a reason and audit entries.
- Cron absence job excludes holidays, weekends and approved leave, with idempotent retries.
- Data is stored in `timestamptz` (UTC), displayed in IST.
- Work department and shift assignment is audited.
- RLS denies employee reads of other employees and denies **all direct authenticated writes** to V3 attendance tables.

## Testing and release checklist

The GitHub Actions workflow `Attendance V3 checks` runs `deno check`, API route tests and an isolated PostgreSQL integration suite. Additional manual checks required before production:

- Employee A cannot access employee B's attendance, use admin endpoints or execute privileged RPCs directly.
- Office Admin sees all employees and can mark, edit and soft-delete another employee's record.
- Same employee cannot check in twice or check out before checking in.
- Late/grace, half-day thresholds and overnight checkouts follow assigned shift.
- Corrections/leave approvals update appropriate records and never approve twice.
- Holidays/weekends/leave are excluded from daily absences.
- Bulk actions commit atomically, repeated Cron runs do not duplicate records.
- Exports contain the correct office-local dates; test CSV/Excel formula injection and PDF special characters.
- Audit rows contain actor, action, reason and record changes.
- Test desktop and mobile browsers.

**Status:** Database migrations, Edge API v6 and guarded Cron are deployed. End-to-end browser, export, and full role-security acceptance tests remain pending before production sign-off.
