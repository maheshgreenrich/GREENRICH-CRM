# GreenRich ONE — unified CRM page

## Main login and navigation
The sole primary URL for the two former CRM surfaces is:
`https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html`.

The standalone `legacy.html` has been deleted. Its full Sales & CRM user interface is embedded as a `<template id="grCrmTemplate">` inside `secure.html`, with the existing `greenrich-crm-inline.js` module and scoped `greenrich-crm-inline.css`. Both run inside GreenRich ONE's existing sidebar, header and `#content` container—**not an iframe or new browser page**.

- CRM Overview, Sales & Orders, Customers, Leads, Follow-ups, Products, Sales Channels and Import / Export are included.
- Existing secure modules—Supabase sign-in, users, custom roles, attendance, settings and other ERP placeholders—remain in the same HTML page.
- Legacy CRM top-level menu options are offered only for modules the logged-in user can view; the existing Supabase Attendance authorization is unchanged.
- Legacy import/export, JSON backup/restore, Excel/CSV import and charts are retained; Chart.js and XLSX are loaded on first CRM visit so they do not block sign-in/Attendance.

## Data integrity and security limitation
**The legacy CRM stores its customer, sales, leads, products, tasks and channels in the browser's `localStorage` under the same unchanged key, `greenrich-crm-v2`.** The path changed but the site origin did not, so data previously entered from `legacy.html` in the same browser/profile should remain present in the embedded CRM. The migration did not delete, overwrite, export or upload this data.

**Combining the interface does not migrate these CRM records into Supabase.** They remain local to each browser and are *not* shared between users/devices. UI tab filtering is not a server-side access boundary for local CRM data. Do not put confidential production CRM/customer data into local storage. To make Sales/Customers/Leads genuinely multi-user and role-protected, move their CRUD operations to authenticated Supabase tables with RLS and carefully import existing records after review.

The local demo `index.html` is still a separate non-production demo. Its former `legacy.html` iframe was replaced with a link to the unified secure login rather than leaving a broken embedded page. Other historical standalone attendance/roles HTML files have not been deleted in this change.

## Verification
- The `legacy.html` file deletion is committed.
- Static integration checks verify that all 8 CRM sections, editor, import, backup, local-storage key and sidebar routing are included, and that no remaining active page references the removed legacy HTML.
- All existing Attendance regressions remain in CI.
- Actual signed-in, cross-browser end-to-end CRM interaction and the GitHub Pages deployment completion still require live testing. Current browser-local CRM data does not have real-time Supabase sync.
