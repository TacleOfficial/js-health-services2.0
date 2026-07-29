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
