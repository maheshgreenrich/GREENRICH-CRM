# GreenRich ONE — Company Gmail quotation sending

## Status and architecture
This CRM module supports two **separate, company-owned** Gmail/Google Workspace senders:
- `grow-india` — GreenRich Grow India Private Limited.
- `enviro-solutions` — GreenRich Enviro Solutions Private Limited.

Supabase Edge Function: `greenrich-quotation-gmail`. Uses the Google **Gmail API** `users.messages.send` and OAuth 2.0 `gmail.send`, `openid email` scopes, offline access, PKCE, a single-use OAuth state, AES-GCM encrypted refresh tokens, server-side user and company checks.

**The Gmail accounts are NOT connected by deploying the feature.** An authorized Admin must first configure Google OAuth and have the owner of each company Gmail grant access.

## Google Cloud setup (done by an Admin)
1. Choose a company-managed Google Cloud project. Configure the OAuth consent screen (Google's external production verification may be required for Gmail's sensitive `gmail.send` scope; Workspace internal may have different constraints).
2. Enable **Gmail API**.
3. Create an OAuth client of type **Web application**.
4. Add this exact **Authorized redirect URI**:
   `https://uawgwkplkvahhmhvroul.supabase.co/functions/v1/greenrich-quotation-gmail`
5. Use only the permission scopes requested by the CRM: `openid email https://www.googleapis.com/auth/gmail.send`.

## Supabase Edge Function secrets
In the Supabase dashboard → Edge Functions → Secrets, set:
- `GR_GMAIL_CLIENT_ID`: Google Web OAuth client ID.
- `GR_GMAIL_CLIENT_SECRET`: Google Web OAuth client secret.
- `GR_GMAIL_TOKEN_KEY_B64`: 32 random bytes, encoded in base64, used to encrypt OAuth refresh tokens at rest. **Safeguard and back up this key securely**; replacing it invalidates existing tokens.

Do not put any of these in GitHub, `secure.html`, or `greenrich-public-config.js`.
The function uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server environment variables.

## Connect both senders
1. Sign in to GreenRich CRM as **Admin**.
2. Navigate to **Quotations & PDF** → **Gmail & Send History**.
3. Select company **GreenRich Grow India**; click **Connect / Reconnect Gmail** and authorize that company's official account on Google.
4. Repeat using company **GreenRich Enviro Solutions**, with its separate company-owned Gmail.
5. Verify that the correct sender email is displayed for each company. Staff never choose the wrong company's account.

Google OAuth configuration is incomplete until both senders show **Gmail connected**.

## Sending
1. Open or create and **save** a customer quotation.
2. Select **Email quotation** or the **Gmail & Send History** tab.
3. Confirm recipient, CC, subject and template message.
4. Click **Send quotation via Gmail** and confirm.
5. The saved quotation PDF is generated, archived to the private `gr-quotation-pdfs` bucket, and sent via Gmail. The send audit links quotation, customer, products, company, sender, recipient, PDF hash and storage path, and Gmail message/thread IDs.
6. Sent PDFs can be retrieved through time-limited backend-signed URLs from the email history.

## Security and reliability
- Do not expose refresh tokens, Google OAuth client secrets, or Supabase service role keys to the browser.
- Admin-only connect/disconnect. Sales/Orders create/edit roles can send; view roles can view company history.
- Server-side checks enforce company identity and customer quotation scope.
- Each send request has a UUID idempotency key and unique database constraint.
- If Gmail's response is uncertain, status becomes `needs_review`. **Check Google's Sent folder; do not resend blindly.**
- The Gmail API accepting a message is not proof of recipient delivery, reading, or open tracking.
- Sent PDF archive uses server-only private storage access. The archive is immutable by default.
- Quotation sending does not adjust inventory or dispatch.
- Database migration adds new tables/bucket without modifying existing customer, sales or quotations.

## QA checklist before real commercial use
- Admin OAuth for both companies and re-connect after revoked token.
- Test a real quotation email with PDF in each company's Sent folder and recipient inbox.
- Test assigned vs unassigned company access, email send permission, PDF signed URL.
- Verify customer and product quotation history, sender identity and dates.
- Test expired OAuth state, invalid/oversized PDFs, missing recipient, disconnected sender, failed mail, same request ID twice, and ambiguous network failures.
- Confirm email templates and PDF attachments render without truncated A4 pages.

No real emails are sent by installing this feature; authorization is a separate explicit Google action.
