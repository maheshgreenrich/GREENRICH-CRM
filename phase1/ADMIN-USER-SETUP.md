# GreenRich ONE — Secure Admin Employee Management

## Current status
The code for the Admin > Users screen is committed to `greenrich-one.js`. It runs in the separate **secure.html** portal, NOT in the old browser-local demo at index.html. The admin Edge Function exists in `supabase/functions/greenrich-admin-users/index.ts`. Account creation is NOT active until you deploy the function to your Supabase project.

## One-time deployment
1. Use a GreenRich-owned Supabase account with permission to deploy Edge Functions.
2. Deploy `supabase/functions/greenrich-admin-users/index.ts` as an Edge Function named **greenrich-admin-users**. The easiest path is Supabase Dashboard > Edge Functions > Create/Deploy function, then copy the source file and deploy; alternatively use the Supabase CLI from this repository.
3. Keep **Verify JWT** enabled for this function. The code also calls Supabase Auth to validate the caller and checks the active Admin role from gr_profiles.
4. Supabase normally provides project `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as function environment variables. Verify they are available to the function. NEVER copy any secret key into a public GitHub file or client-side code.
5. Configure Supabase Authentication > URL Configuration: Site URL `https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html` and allow redirect URL `https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html`.
6. Create and link the first Admin Auth user in `gr_profiles` if not completed.
7. Sign in at `/secure.html`, open **Users** and click **Create Employee & Send Invitation**.

## Workflow
- Admin enters full name, unique username, work email and role; clicks Send Invitation.
- Edge Function validates Admin's Auth session and Admin gr_profiles role, then creates Auth invitation and gr_profiles record. Employee follows email link to set a password.
- Admin can edit employee name, username and role, request password reset email, deactivate or reactivate account.
- Account actions write to gr_audit_log where possible.
- Never set passwords from browser code or store passwords in GitHub.
- The old local demo user accounts DO NOT automatically synchronize with Supabase.

## Limitations still open
- Tested end-to-end deployment and role security is pending.
- Disable/enable should be validated against active sessions and JWT expiry; for immediate revocation require additional session controls/RLS checks.
- Soft-delete (archiving) and undo are represented by deactivation, not physical removal.
- Username-only secure sign-in has not been implemented; secure login uses email and password.
- Attendance secure portal still requires connecting to the v2 attendance RPC and report queries.
- Role permission configuration still requires full permission policy review before production.
