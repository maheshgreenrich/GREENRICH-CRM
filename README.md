# GreenRich Sales & CRM — Royal Blue Edition

A responsive, GitHub Pages–compatible, **local-first prototype** for GreenRich. Outfit font, royal blue theme.

## Modules
- Dashboard: revenue, unique orders, units, GST collected, sales trend, channel split, top products, CRM summary.
- Products: product name, SKU, brand, category, predefined price, GST rate, tax inclusive/exclusive mode, status.
- Channels: create new Amazon/Flipkart/Website/retail/distributor channels with no code changes.
- Sales: order ID, date, channel, linked product and optional customer; auto-fill product price/GST and override them per sale; real-time calculation of pre-tax amount, tax and final total.
- CRM customers: name, phone, email, company, type, full address, city, state, PIN, country, GSTIN, owner, source, notes.
- CRM leads: stages, sources, expected deal value, owner, next follow-up, notes and linked customer.
- Follow-ups: due dates, contact, lead/customer links, status, owner and notes.
- Import/export: sales Excel/CSV, downloadable sales template, exports for all modules, full JSON backup/restore.

## Tax calculation
When unit price includes GST: base = qty × unit_price / (1 + rate/100), GST = total - base.
When unit price excludes GST: base = qty × unit_price, GST = base × rate/100. Total = base + GST.
Amounts round to 2 decimals per sales line. This is reporting math, not a substitute for tax invoicing or an accountant's advice.

## Start locally
Open `index.html` in a browser with an internet connection (fonts / Chart.js / SheetJS libraries are loaded from CDNs). Data stays in this browser's localStorage.

## Publish on GitHub Pages
1. Create a repository such as `greenrich-sales-crm` on GitHub.
2. Upload `index.html`, `styles.css`, `app.js`, `README.md` to repository root.
3. Settings → Pages → Deploy from branch → `main` → `/ (root)` → Save.
4. Visit `https://YOUR-USERNAME.github.io/greenrich-sales-crm/`.

**SECURITY:** GitHub Pages is public hosting. The *application code* is public. Do **not** commit customer files, business backups, passwords or API secrets. This prototype stores confidential customer data only in the user's browser localStorage, which is neither encrypted nor backed up automatically. It is not shared across users/devices. Use on a trusted device for evaluation only. For a real multi-employee production system, add authenticated server/database storage (e.g. Supabase with RLS), encrypted transport, authorization roles, audit logs, backups, retention/deletion policies and legally appropriate privacy practices. Do not call this a secure production CRM until that work is complete.

## Import existing sales
1. Create Product Master entries (SKU/product names) and Sales Channel entries *before* importing.
2. Download the Sales template under Import / Export.
3. Required: Date (YYYY-MM-DD), Order ID, Channel (matching channel name), Product (matching product name or SKU), Quantity and Unit Price. Tax % and Tax Inclusive are optional and default to product settings. Customer name can be included, matching an existing customer to link automatically.
4. One line per product within an order. Duplicate detection uses channel + order ID + product.
5. XLSX support needs the SheetJS CDN; if unavailable, use CSV.

## Limitations and next phase
- Local-first prototype, not cloud team collaboration.
- Sales are manual entry/import, no automatic Amazon/Flipkart/WooCommerce syncing.
- Order statuses are recorded; dashboard currently includes all statuses, including returns/cancelled orders, in gross order totals. Filter/export before interpreting as net realized revenue. Add returns/refunds, shipping, marketplace fees, payment settlement and tax invoice workflows before using numbers as audited financial reports.
- Browser storage can be cleared by the browser/user. Export backups regularly.
- No activity timeline, attachments, permission roles, server backups, deduplicated customer merge, or automated follow-up notification yet.
