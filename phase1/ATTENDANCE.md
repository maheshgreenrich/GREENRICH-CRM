# GreenRich ONE Attendance Module — October 2026

## Configured defaults
- Working days Monday–Saturday (Sunday weekly off).
- No predefined public holidays; Admin adds holidays manually.
- Half Day = 0.5; cutoff 23:59 Asia/Kolkata.
- Optional geolocation is OFF per mark unless an employee actively consents. Settings enable/disable capture.
- Date display DD-MMM-YYYY; persisted keys ISO YYYY-MM-DD.

## Current deployment: local TEST mode
The live GitHub Pages application still runs localStorage accounts and local attendance. The attendance UI, Settings and local report/export actions are functional **only in that browser**, not cross-browser. Do not enter real staff personal information until secure login and database migration are completed. The previously saved local accounts, sales and attendance records are not overwritten; new attendance settings and audit data have separate storage keys.

## Screens
1. Top-right today's own attendance widget (existing application widget; new marking rules are used).
2. Attendance Marking: Admin row-per-employee marking and bulk marking; employees see their own record.
3. Attendance Reports: Daily/Weekly/Monthly/Custom date filters, person, role and status; summary, person bars, daily trend, status split, matrix heatmap and details.
4. Settings: Attendance settings for cutoff, half-day, working weekdays, holiday dates, lock-through date and optional consent-based location.
5. Permission Matrix: existing demo permission matrix and extra permissions `Attendance|View All`, `Attendance|Mark Others` when configured. These are NOT secure database rules in the demo.

## Production database setup
1. Provision a company-owned Supabase project.
2. Run [phase1/schema.sql](schema.sql), then [phase1/attendance-v2.sql](attendance-v2.sql).
3. Create first Auth Admin and profile using the schema's bootstrap instructions. Never commit the secret/service-role key.
4. Integrate the browser with Supabase Auth. Replace all local attendance reads/writes with database selects and RPC `gr_mark_attendance`. Use `gr_log_attendance_export` for every export.
5. Complete and test server side team hierarchy, permission matrix, source/field-level visibility, manager scopes and month locking before production.
6. Import existing browser data ONLY after user ID mapping and duplication review. Keep original browser records as backup until verified.

## Data model
`gr_attendance`: user_id, attendance_date unique, status, marked_by, marked_at, remark, source, location, locked, deleted_at.
`gr_attendance_audit`: old and new status, correction reason, actor, timestamp.
`gr_attendance_settings`: configurable cut-off, half day, weekdays, optional statuses, location and month lock.
`gr_attendance_holidays`: Admin-defined non-working holidays.
`gr_attendance_export_audit`: exports by Auth user and filter metadata.

## Report calculation
Working days = filtered Monday–Saturday dates excluding manually defined holidays.
Attendance % = 100 × (Present + half_day_value × Half Day) / eligible working days across the selected employees. Unmarked eligible days count as 0 in this rate; totals reflect recorded statuses only. Filtering by status affects counts and charts. Monthly lock bars modifications up through the specified date.

## Test checklist (manual after GitHub Pages deployment)
- [ ] Log in, mark own attendance today; status changes in header and table.
- [ ] Try marking own attendance again; rejected.
- [ ] Set cutoff to a time already passed in IST; next self-mark blocked; restore 23:59.
- [ ] Try future date; rejected.
- [ ] Admin marks a past date, then changes it with a reason. Audit row appears.
- [ ] Admin bulk marks unmarked employees; existing records remain unchanged.
- [ ] Weekly/monthly/custom range changes summary and calendar.
- [ ] Select one employee and one status; charts and detail rows update.
- [ ] Export XLSX, compare Summary, Daily Matrix, Person-wise Detail and Admin Audit Log with screen filters.
- [ ] Switch to employee; should not see other users without granted scope.
- [ ] Change half-day value and weekdays in Settings; summary percentages change.
- [ ] Browser restart retains demo attendance, user and existing sales data.
- [ ] Different browser DOES NOT share demo accounts; verify database backend separately.
- [ ] Production: test denied REST writes, second self-mark, future date, team scope, and export audit using actual Supabase JWTs.

## Sample data
`attendance-sample-generator.js` produces a synthetic CSV for 10 fictional users over two months. It DOES NOT change GreenRich live data.

## Not yet complete
- End-to-end secure Supabase frontend Auth and server-side attendance access from the deployed app
- Team manager and state/district scope end-to-end; user selection for multiple people
- Holiday/week-off/leave status entry UI; audit of all administrative settings and deletions
- Chart sheets inside Excel workbook; current workbook contains data sheets
- Production test-run results with actual employee accounts

## Administrator guide
Use Settings > Attendance Settings to modify company rules. In Attendance Marking, choose a date, then mark individual employees. Existing statuses require correction reason. Use bulk actions for new entries. Use Attendance Reports for filter-aware reports and XLSX export.

## Employee guide
Log in from the same browser that holds your demo user account, choose attendance in the top-right widget or Attendance Marking, and mark Present, Absent or Half Day once per day before cutoff. Corrections require Admin. Geolocation is never mandatory in this demo.
