# Velle Research Commerce

A private-staging research-commerce system built with Next.js, Supabase,
Stripe Tax, Shippo, Brevo, and an Expo administrator application. The existing
fictional catalog remains unpublished draft content. Live commerce is disabled
by default.

## Local development

Use Node.js 22.15 or newer:

```powershell
nvm use 22.15.0
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```powershell
npm run lint
npm run typecheck
npm test
```

The staging checkout is at `/checkout`, the protected-admin preview is at
`/admin`, and the service readiness endpoint is at `/api/health`.

## Local Supabase

Install the Supabase CLI, then:

```powershell
supabase start
supabase db reset
```

Copy `.env.example` to `.env.local` and fill only local project values. All
feature flags remain `false` until their integration has been verified.

The migration in `supabase/migrations/0001_commerce_foundation.sql` establishes:

- independent order, payment, fulfillment, and reservation states;
- integer-cent totals with unique payment adjustments forced to zero;
- RLS-protected customer and administrator records;
- private payment-evidence storage;
- atomic, AAL2-protected payment approval and inventory commitment;
- durable notification outbox records.

## Manager SMS alerts

Payment-review SMS alerts use Brevo transactional SMS and remain independent
from administrator push notifications. After applying the latest migrations,
configure these server/Edge Function values:

```text
BREVO_API_KEY=
BREVO_SMS_SENDER=Velle # optional; alphanumeric, 11 characters maximum
APP_BASE_URL=https://your-canonical-app.example
ADMIN_SMS_ENABLED=false
ADMIN_PUSH_WEBHOOK_SECRET=
BREVO_WEBHOOK_SECRET=
```

Deploy `process-notifications`, invoke it on a recurring schedule for retries,
and configure a secured Brevo transactional SMS webhook pointing to
`/api/webhooks/brevo` with the `x-velle-webhook-secret` header. Keep
`ADMIN_SMS_ENABLED=false` until a super-admin has verified and enabled the
intended reviewer numbers from **Admin → Settings**. Both staging and production
payment submissions are eligible once the flag is enabled.

## Shared Hark iPhone alerts

Hark is an optional, independent one-shot iPhone notification channel. Create a
service at [hark.ryan.ceo](https://hark.ryan.ceo), register the shared operations
iPhones, and store the secret webhook URL only in the server and Edge Function
environment:

```text
HARK_WEBHOOK_URL=https://hark.ryan.ceo/hooks/whk_your_token
ADMIN_HARK_ENABLED=false
APP_BASE_URL=https://your-canonical-app.example
ADMIN_PUSH_WEBHOOK_SECRET=
```

Apply the latest migrations and deploy `process-notifications`. A super-admin
can then select SMS, Hark, both, or neither for each supported event under
**Admin → Settings → Notification routing**. Selections affect new events only
and apply to both staging and production records in that deployment. Each
event's Actions menu can edit its Hark title and body using the placeholders
shown in the dialog, upload a JPG, PNG, or WebP avatar (or enter another public
HTTPS image URL), or send a clearly marked provider test.

Keep `ADMIN_HARK_ENABLED=false` until a test Hark service has accepted a
controlled notification. Rotate a leaked webhook in the Hark dashboard and
replace the deployment secret immediately; the Admin UI never displays it.
Hark accepts `200`/`202` requests, including `delivered: 0` when no phone is
registered. Rate-limited and provider failures are retried independently from
SMS and Expo push. Interactive approvals, device routing, and Live Activities
are intentionally not part of this integration.

## Administrator iPhone app

The Expo Router project lives in `admin-mobile` and is linked to its staging EAS
project. Install and validate dependencies before building:

```powershell
Set-Location admin-mobile
npm install
npx expo-doctor
npm run typecheck
```

A paid Apple Developer account is required for device credentials and
TestFlight. Until one is available, use Expo Go for non-push development. The
current blocker, verified configuration, and exact continuation steps are in
[`docs/admin-mobile-ios-resume-plan.md`](docs/admin-mobile-ios-resume-plan.md).

## Vercel staging

Import the Git repository into Vercel and select the Next.js framework preset.
Vercel will use `npm run build` and publish the standard `.next` output.

- Pushes to the production branch create production deployments.
- Other branches and pull requests create Preview deployments.
- Configure secrets independently for Development, Preview, and Production.
- Keep Deployment Protection and `noindex` enabled for staging.
- Never copy production service-role, payment, or provider secrets into Preview.

## Safety boundary

Zelle and Cash App are manually reviewed. Screenshots and customer-entered
references never confirm funds. Only an AAL2-authenticated, authorized
administrator can approve a payment, and inventory/fulfillment unlock in the
same database transaction. Public launch remains blocked until the real catalog,
banking, tax, legal, shipping, privacy, and insurance requirements are approved.
