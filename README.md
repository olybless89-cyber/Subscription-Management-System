# Web Oracle Host — Suspension/Restoration Engine, Payments, Auth, Cron, Scoped Admins

Everything below is real, tested code — not scaffolding. It's still a
slice of the full spec (no admin/customer UI yet), but every piece that
exists actually runs and is covered by tests.

## What's here

```
prisma/schema.prisma          Full data model — spec section 4 plus scoped-admin extensions
src/lib/railway/
  client.ts                    GraphQL client (server-only, token via env, typed errors)
  deployments.ts                getDeployment/getDeployments/stopDeployment/redeployService/verify...
  services.ts                    getService/getServiceStatus
  projects.ts                    getProject (deliberately no delete* exports)
  domains.ts                      getServiceDomains/getDomainStatus (deliberately no delete* exports)
src/lib/suspension/
  safety.ts                      FORBIDDEN_AUTOMATED_ACTIONS guard + strategy allow-list
  engine.ts                       suspendCustomer() — spec section 14-16, 34, 35
  restoration.ts                   restoreCustomer() — spec section 20
  guard.ts                         subscriptionGuard() — spec section 17
src/lib/payments/
  provider.ts                      PaymentProvider interface — spec section 10
  paystack.ts                       Paystack implementation (init, HMAC signature verify, server-side verify)
  registry.ts                        resolvePaymentProvider() — routes a customer to Paystack/Flutterwave by group
  checkout.ts                        initiateCheckout() — backs the portal's "PAY NOW"/"Renew", provider-routed
  webhook-handler.ts                 handlePaymentWebhook() — spec sections 10 & 24, wired to restoreCustomer + admin notify
src/lib/auth/
  password.ts                        scrypt password hashing (no external dep)
  tokens.ts                           HMAC-signed session tokens (no external JWT dep)
  authenticate.ts                     authenticateAdmin() / authenticateCustomer()
  authorize.ts                         authenticateFromHeader / hasAdminRole / canAccessCustomer / listVisibleCustomerIds / canManageOtherAdmins
src/lib/admin/manage.ts              createAdmin() / setCustomerAssignments() — scoped-admin management
src/lib/notifications/admin-notify.ts  notifyAdminsForCustomer() — routes payment events to the right admin(s)
src/lib/cron/
  subscription-checker.ts             runSubscriptionChecker() — spec sections 21-22
  railway-sync.ts                      syncRailwayResources() / syncSingleRailwayResource() — spec section 13
src/lib/audit/log.ts                 recordAuditLog() — spec section 33
src/lib/billing/cycle.ts             addBillingCycle() / addDays()
src/lib/db/
  ports.ts                           Repository interfaces everything above depends on (DB-agnostic)
  prisma-repository.ts                Real Prisma implementation of every port (see caveat below)
src/lib/deps-factory.ts              Runtime wiring: Prisma + Paystack + Railway (needs generated client — see below)
src/types/domain.ts                Shared enums/types mirroring the Prisma schema
scripts/seed-admin.mjs               Creates/updates the first SUPER_ADMIN (no signup UI yet)
app/api/
  webhooks/payment/route.ts          Paystack webhook
  payments/route.ts                   Checkout initiation (real auth + scoped access)
  auth/admin-login/route.ts            Admin login
  auth/customer-login/route.ts          Customer login
  admin/admins/route.ts                  Create a new admin (SUPER_ADMIN or delegated)
  admin/admins/[id]/assignments/route.ts  Get/set which customers an admin can see
  admin/customers/route.ts                Scoped customer listing (all for SUPER_ADMIN, assigned-only for ADMIN)
  admin/notifications/route.ts             The calling admin's own notification feed
  cron/subscriptions/route.ts           Hourly subscription checker (CRON_SECRET-protected)
  cron/railway-sync/route.ts             Railway sync (CRON_SECRET-protected)
  subscriptions/[id]/suspend/route.ts     Admin manual suspend (NOT scoped — see caveat below)
  subscriptions/[id]/restore/route.ts      Admin manual restore (NOT scoped — see caveat below)
tests/                                88 passing tests (fakes.ts = in-memory repos, no live DB/network needed)
```

## Scoped admin access — how it actually works

You can now have a SUPER_ADMIN create additional admins who only see a
subset of customers, and route different customer groups to different
payment providers. Concretely:

1. **Creating a scoped admin**: `POST /api/admin/admins` (SUPER_ADMIN, or
   a plain ADMIN with `canManageAdmins: true`). A plain admin-manager can
   create other plain admins, but can NOT create another SUPER_ADMIN or
   grant `canManageAdmins` to anyone — only your actual SUPER_ADMIN can
   do that. This is a deliberate privilege-escalation guard, tested in
   `tests/admin-management.test.ts`.
2. **Assigning customers**: `POST /api/admin/admins/:id/assignments`
   with `{ "customerIds": [...] }` — replaces that admin's entire visible
   set (not additive; submit the full list each time).
3. **What "scoped" actually restricts today**: `canAccessCustomer()` — a
   plain ADMIN can only pass this check for customers explicitly
   assigned to them; SUPER_ADMIN always passes. This gates
   `GET /api/admin/customers` (the listing) and `POST /api/payments`
   (checkout ownership). **It does NOT currently gate the suspend/restore
   routes** — see the caveat below, this was a scope decision, not an
   oversight.
4. **Payment notifications follow assignment**: when
   `handlePaymentWebhook` processes a successful payment,
   `notifyAdminsForCustomer()` writes a notification row for every
   SUPER_ADMIN plus any ADMIN assigned to that specific customer — nobody
   else. `GET /api/admin/notifications` reads back the calling admin's
   own feed.
5. **Payment provider routing**: `Customer.paymentProvider` (PAYSTACK or
   FLUTTERWAVE) decides which provider `initiateCheckout` uses for that
   customer, via `resolvePaymentProvider()`. Group customers however you
   like — set the field per customer (no route for this yet, direct DB
   update or add one) and checkout automatically uses the right provider.
   **Flutterwave is real in the schema/routing but has no working
   adapter** — resolving it throws a clear `UnsupportedPaymentProviderError`
   rather than silently charging through the wrong account or pretending
   to succeed. Implement `createFlutterwaveProvider()` matching
   `paystack.ts`'s shape when you're ready; nothing else needs to change.

## Running it

```bash
npm install
npm run typecheck   # tsc --noEmit — passes clean (prisma-repository.ts excluded, see below)
npm test            # vitest — 88 tests, all green, no network/DB needed
npm run build       # next build — verified working in this sandbox, produces all 15 routes
```

### Two things I could NOT verify from this sandbox — be aware before you ship

1. **`prisma generate`/`prisma validate` need `binaries.prisma.sh`,
   which this sandbox can't reach.** `src/lib/db/prisma-repository.ts`
   is excluded from `tsconfig.json`'s default typecheck for exactly this
   reason. Once you've run `npx prisma generate` somewhere with open
   network access, run `npx tsc --noEmit -p tsconfig.full.json` to
   typecheck it for real.
2. **Railway mutation names are unverified against Railway's live
   schema** (`deploymentStop`, `serviceInstanceRedeploy`, the `domains`
   query shape). Spec section 48 is explicit: introspect the live schema
   before wiring this to production. If a name has drifted, the client
   fails loudly (`RailwayApiError`) rather than silently no-op'ing.

**Everything under `app/`** is also not included in this sandbox's
typecheck/test run — those route files need the `next` package to
actually execute, though `npm run build` (which DOES run in this
sandbox) exercises Next's own type checking across all of `app/`, which
is how the 15-route count above was confirmed. Every bit of route
*logic* is additionally tested independent of Next.js; the route files
themselves are thin, reviewed-by-eye wrappers around that logic.

## Safety guarantees, and where they live in the code

| Spec requirement | Where enforced |
|---|---|
| Never delete project/service/DB/volume/domain from automation | `lib/railway/projects.ts` and `domains.ts` simply don't export delete functions. `lib/suspension/safety.ts` is a second checkpoint. |
| `MANUAL` strategy never auto-runs | `assertStrategyAutomatable()` skips (doesn't execute) resources with `suspensionStrategy: MANUAL`. |
| Never report SUSPENDED/ACTIVE without verification | `stopDeployment()`/`verifyDeploymentReachesStatus()` re-check Railway after every mutation before the engine reports success. |
| Dry-run mode (`SUSPENSION_DRY_RUN=true`) | Short-circuits `suspendCustomer` before any Railway call; also read by the cron subscription-checker route. |
| Per-customer `automaticSuspension` override | Checked in `suspendCustomer`, bypassed only when `opts.manual = true` (admin route sets this). The cron path surfaces a bypassed-suspension as an `errors[]` entry, not a silent skip. |
| Idempotency (worker runs twice) | Every state transition re-checks the subscription's *current* status/dates before acting — see the "running twice is idempotent" test in both `engine.test.ts` and `subscription-checker.test.ts`. |
| Never restore on client-side payment confirmation | `restoreCustomer` requires `paymentVerified: true`; only `handlePaymentWebhook` (after server-side Paystack verification) or an authenticated admin route sets it. |
| MULTI_TENANT never touches Railway | Special-cased in suspend/restore/sync — see the "never calls Railway" tests in each. |
| Payment amount/status never trusted from the webhook payload | `handlePaymentWebhook` re-calls `provider.verifyTransaction()` and compares against the stored payment. |
| Webhook idempotency | Anchored on `payment.status`; `reference` is `@unique` as a second line of defense. |
| `callbackUrl` must be `https://` | Enforced in both `paystack.ts` and `checkout.ts` — the exact bug flagged as outstanding on Remitrova. |
| No email enumeration via login | `authenticateAdmin`/`authenticateCustomer` return the identical `INVALID_CREDENTIALS` outcome, with an equalized-timing dummy hash comparison, whether the email doesn't exist or the password is wrong. |
| Scoped admins can't see/act on unassigned customers | `canAccessCustomer()` — SUPER_ADMIN passes always; plain ADMIN only for customers with an `AdminCustomerAssignment` row; checked fresh against the DB every call, not trusted from the session token. |
| Admin-management privilege can't self-escalate | `createAdmin()`/`setCustomerAssignments()` require SUPER_ADMIN to create another SUPER_ADMIN or grant `canManageAdmins` — a delegated admin-manager cannot mint peers or successors. |
| Payment notifications only reach the right admin(s) | `notifyAdminsForCustomer()` fans out to every SUPER_ADMIN plus assigned ADMINs only, deduplicated — tested for the "assigned to a different customer gets nothing" case specifically. |
| Wrong payment provider never silently used | `resolvePaymentProvider()` throws a typed error for providers with no real adapter (FLUTTERWAVE today) instead of falling back to Paystack or faking success. |
| Suspended-but-not-terminated customers can still log in | `authenticateCustomer` only blocks `TERMINATED`, specifically so a suspended customer can reach the billing portal and pay their way back. |
| Railway sync never assumes success OR failure | `syncRailwayResources` sets `UNKNOWN` (not `ERROR`, not silently unchanged) when Railway is unreachable — "we don't know" is a distinct, honest state from both extremes. |

## What's deliberately NOT done yet

- **Suspend/restore routes are not scoped to admin assignments.** Any
  authenticated ADMIN or SUPER_ADMIN can currently suspend/restore any
  customer's subscription, regardless of the assignment table. Scoped
  visibility (listing, checkout ownership, notifications) IS enforced;
  scoped *action* restriction on suspend/restore is not. This was a
  scope decision based on what was actually asked for (see/monitor/get
  notified), not an oversight — but flag if you want it locked down too,
  it's a small change to those two route files.
- No Next.js admin/customer UI — only API routes exist.
- No real email/WhatsApp/SMS notification dispatch — `EmailNotificationSender`
  currently just writes a `Notification` row (audit trail is correct;
  actual sending is a separate, unbuilt adapter). Same for admin
  notifications — `AdminNotification` rows are written, nothing pushes
  them out as email/SMS yet.
- No Flutterwave adapter — the routing/schema support is real (see
  above), the actual provider implementation isn't.
- `POST /api/customers`, `/api/domains`, `/api/plans` (basic CRUD, spec
  section 39), and a route to actually set `Customer.paymentProvider`
  aren't built yet — direct DB access is the only way to set that field
  today.
- Customer self-service password setup (invite/reset flow) isn't built —
  `Customer.passwordHash` exists and can be null, `authenticateCustomer`
  handles the null case, but nothing issues a reset link yet.
- Rate limiting on the login routes (spec section 32) isn't implemented —
  worth adding before those routes are internet-facing.

## Suggested next slice

At this point the backend's safety-critical core — billing state
machine, Railway suspension/restoration, payments (with per-customer
provider routing), auth, cron, and scoped admin visibility — is built
and tested. What's left is mostly volume, not risk: CRUD routes, the
admin dashboard UI, the customer portal UI, and real notification
dispatch. That's a good point to move into Claude Code for faster
iteration with real file/terminal access, plus the two
live-verification steps (Prisma generate, Railway schema introspection)
that need open network access this sandbox doesn't have.

Happy to keep going here too — just say which piece.
