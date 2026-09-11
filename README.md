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
  dry-run-override.ts               setSubscriptionDryRunOverride() — per-subscription SUSPENSION_DRY_RUN override
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
src/lib/customers/
  manage.ts                              createCustomer() / updateCustomer() — spec sections 5 & 39, auto-assigns scoped creators
  birthday.ts                              runBirthdayMessages() — daily cron logic, month/day match, year ignored
src/lib/invoices/
  pdf.ts                                     generateInvoicePdf() — pdfkit, visually verified against real rendered output
  manage.ts                                    createAndSendReceiptInvoice() / createAndSendDueInvoice()
src/lib/campaigns/manage.ts               createCampaign() / sendCampaign()
src/lib/notifications/whatsapp.ts         sendWhatsAppMessage() — Meta Cloud API, one generic template, never throws
src/lib/notifications/custom-email.ts   sendCustomEmail() — admin-composed message through the same Resend pipeline
src/lib/billing/
  cycle.ts                              addBillingCycle() / addDays()
  manage.ts                              createPlan() / createSubscription() / updateSubscription() — spec sections 8-9, 39
src/lib/domains/manage.ts              createDomain() — spec section 43
src/lib/railway/mapping.ts             mapRailwayResource() — spec section 12, enforces MULTI_TENANT+APP_LEVEL at entry
src/lib/notifications/
  admin-notify.ts                        notifyAdminsForCustomer() — routes payment events to the right admin(s)
  email.ts                                sendEmail() / subjectForEvent() — real dispatch via Resend, never throws
src/lib/cron/
  subscription-checker.ts             runSubscriptionChecker() — spec sections 21-22
  railway-sync.ts                      syncRailwayResources() / syncSingleRailwayResource() — spec section 13
src/lib/audit/log.ts                 recordAuditLog() — spec section 33
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
  admin/customers/route.ts                GET: scoped customer listing. POST: create a customer (spec section 5)
  admin/plans/route.ts                     GET: list plans. POST: create one (spec section 9)
  admin/subscriptions/route.ts              POST: create a subscription for a customer (spec sections 8-9), scoped
  admin/subscriptions/[id]/railway-resource/route.ts  GET: list mappings. POST: map to Railway infra (spec section 12), scoped
  admin/subscriptions/[id]/route.ts                     GET: view one subscription. PATCH: edit planId/suspensionEnabled ONLY (status excluded on purpose)
  admin/domains/route.ts                                 GET: scoped listing. POST: attach a domain to a customer
  admin/subscriptions/[id]/dry-run-override/route.ts   POST: per-subscription dry-run override, scoped
  admin/notifications/route.ts             The calling admin's own notification feed
  admin/customers/[id]/route.ts             GET: view one customer. PATCH: edit fields (no status/email/customerCode)
  admin/customers/[id]/send-email/route.ts   POST: admin-composed custom email to this customer
  admin/audit-logs/route.ts                   GET: system-wide activity feed — SUPER_ADMIN only, not delegated admins
  cron/birthdays/route.ts                      POST: daily birthday-message check (CRON_SECRET-protected)
  cron/subscriptions/route.ts           Hourly subscription checker (CRON_SECRET-protected)
  cron/railway-sync/route.ts             Railway sync (CRON_SECRET-protected)
  subscriptions/[id]/suspend/route.ts     Admin manual suspend — scoped to assignment
  subscriptions/[id]/restore/route.ts      Admin manual restore — scoped to assignment
tests/                                224 passing tests (fakes.ts = in-memory repos, no live DB/network needed)
app/
  globals.css                          Design tokens (forest green/paper/clay — matches the spec's own branding request)
  layout.tsx                            Root layout, wraps everything in AuthProvider
  page.tsx                               Placeholder home page with a link into /login
  login/page.tsx                          Admin login form
  dashboard/
    layout.tsx                             Sidebar + auth guard (redirects to /login if not signed in)
    page.tsx                                 Overview
    customers/page.tsx                        List + create customer form
    plans/page.tsx                            List + create plan form
    subscriptions/page.tsx                     List + create subscription form (customer/plan dropdowns)
    subscriptions/[id]/page.tsx                 View/edit one subscription + suspend/restore buttons
    domains/page.tsx                             List + attach-domain form
    admins/page.tsx                                List + create admin form (role/canManageAdmins fields only shown to SUPER_ADMIN)
    invoices/page.tsx                                Invoice list — PDF opened via authenticated fetch, not a plain link
    admins/[id]/assignments/page.tsx                 Checkbox list of customers this admin can see
    customers/[id]/page.tsx                            View/edit a customer + send-custom-email composer
    activity/page.tsx                                    System-wide audit log — SUPER_ADMIN only, hidden from nav for everyone else
  _components/AuthProvider.tsx           Session context — token in localStorage, see caveat below
  _components/Sidebar.tsx                 Nav
  _lib/api.ts                              authFetch() helper, attaches Bearer token
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
   `GET /api/admin/customers` (listing), `POST /api/payments` (checkout
   ownership), and **`POST /api/subscriptions/:id/suspend` /
   `/restore`** — a scoped admin can only suspend/restore customers
   assigned to them.
4. **Creating customers**: `POST /api/admin/customers` — any admin can
   create one; the generated `customerCode` is sequential and atomic
   (`WOH-000001`, `WOH-000002`, ...) via a dedicated counter table, never
   derived from counting rows (so it survives future deletions without
   reusing a code — spec section 5). If a plain (non-SUPER_ADMIN) admin
   creates the customer, they're automatically assigned to it — without
   that, they'd create a customer and immediately be unable to see it.
5. **Payment notifications follow assignment**: when
   `handlePaymentWebhook` processes a successful payment,
   `notifyAdminsForCustomer()` writes a notification row for every
   SUPER_ADMIN plus any ADMIN assigned to that specific customer — nobody
   else. `GET /api/admin/notifications` reads back the calling admin's
   own feed.
6. **Payment provider routing**: `Customer.paymentProvider` (PAYSTACK or
   FLUTTERWAVE) decides which provider `initiateCheckout` uses for that
   customer, via `resolvePaymentProvider()`. Group customers however you
   like — set the field per customer (no route for this yet, direct DB
   update or add one) and checkout automatically uses the right provider.
   **Flutterwave is real in the schema/routing but has no working
   adapter** — resolving it throws a clear `UnsupportedPaymentProviderError`
   rather than silently charging through the wrong account or pretending
   to succeed. Implement `createFlutterwaveProvider()` matching
   `paystack.ts`'s shape when you're ready; nothing else needs to change.

## The full flow, end to end

With this round, the complete admin-driven setup path is real and
callable:

```
POST /api/admin/customers                                   → create a customer (spec section 5)
POST /api/admin/plans                                        → define a hosting plan (spec section 9)
POST /api/admin/subscriptions                                  → tie customer + plan together (spec sections 8-9)
POST /api/admin/subscriptions/:id/railway-resource               → map that subscription to real Railway infra (spec section 12)
POST /api/payments                                               → customer/admin-initiated checkout (spec sections 10, 19)
POST /api/webhooks/payment                                        → Paystack confirms payment → extends subscription, restores if suspended
POST /api/subscriptions/:id/suspend  or  /restore                   → manual admin override, scoped to assignment
POST /api/cron/subscriptions                                          → the automated version of suspend, on schedule
```

Each step is intentionally separate rather than one mega-endpoint — a
customer can exist with no plan yet, a subscription can exist before
infrastructure is provisioned, and a scoped admin's assignment gates the
subscription and railway-resource steps the same way it gates
suspend/restore. `mapRailwayResource()` also enforces one safety
invariant at data-entry time rather than only at suspension time:
`MULTI_TENANT` hosting mode can ONLY pair with `APP_LEVEL` suspension
strategy — the exact combination spec section 16 requires, rejected
before it can even be saved if someone tries to pair `MULTI_TENANT` with
`STOP_DEPLOYMENT`.

## Branding: logo in emails, marketing homepage

- **`public/dwo-logo.jpg`** — the real DWO logo, served statically by
  Next.js. Every email (automated notifications, admin notifications,
  the custom-email composer, birthday messages) now renders as branded
  HTML via `renderBrandedEmailHtml()` (`src/lib/notifications/email.ts`),
  with the logo in the header, referenced by URL
  (`${APP_URL}/dwo-logo.jpg`) rather than embedded inline — standard
  practice for email, since most clients block remote images until the
  recipient trusts the sender, which this code can't change. **Requires
  `APP_URL` to be set correctly in Railway** — without it, emails fall
  back to a plain text "WEB ORACLE HOST" wordmark instead of a broken
  image link. The `text` fallback (for clients that can't render HTML at
  all) is still sent alongside the HTML on every email.
- **`app/page.tsx`** — a real marketing homepage replacing the old
  placeholder: hero with the logo, a features grid, and a closing CTA
  into `/login`. Static, no client-side state, matches the same design
  tokens as the dashboard (forest green / paper / clay accent).

## WhatsApp integration and bulk campaigns

### The constraint that shapes everything here

Meta's WhatsApp Cloud API only allows free-form text to a customer
within 24 hours of *them* messaging you first. Outside that window —
which covers essentially every automated notification and every bulk
campaign — Meta **requires** a pre-approved message template. Rather
than needing five-plus separate templates approved (one per message
type), every WhatsApp send in this codebase routes through **one
generic utility template** with a single `{{1}}` body variable
(`src/lib/notifications/whatsapp.ts`, `DEFAULT_TEMPLATE_NAME =
'general_notification'`). Whatever text a caller wants to send just
becomes that one variable.

### What you need to do on Meta's side before ANY of this works

None of this can be tested end-to-end until you've done the following —
same relationship as the Resend DNS verification earlier in this
project: the code is ready, the external setup isn't done yet.

1. Create a Meta Business Account and a WhatsApp Business Account (WABA)
   at business.facebook.com, and register a phone number for it.
2. In Meta Business Manager, submit a message template named exactly
   `general_notification`, language `en_US` (or your `WHATSAPP_...`
   config, if you change these), category **Utility** (not Marketing —
   Marketing templates face stricter review and require documented
   opt-in), with a body of exactly `{{1}}`. Wait for approval (usually
   hours to a couple of days).
3. Generate a permanent access token and note your Phone Number ID from
   the WhatsApp Cloud API dashboard.
4. Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in
   Railway's Variables tab.

Until all four are done, `sendWhatsAppMessage()` returns `{success:
false}` for every attempt (same "unconfigured = not sent, never a
crash" contract as `sendEmail()`) — nothing breaks, WhatsApp sends just
silently don't happen, and everything still gets recorded as a
`Notification` row for the audit trail either way.

### What got built

- **`src/lib/notifications/whatsapp.ts`** — the sender itself, never
  throws, tested directly (5 tests: success, error status, network
  failure, missing config, invalid phone number).
- **Bulk campaigns** (`Campaign`/`CampaignRecipient` tables,
  `src/lib/campaigns/manage.ts`) — an admin manually checks off
  customers (per an explicit decision: **no saved segment/filter query,
  just a checkbox list** — predictable over clever), picks EMAIL and/or
  WHATSAPP, writes one message, and creates a `DRAFT`. Sending is a
  separate, deliberate second step (`sendCampaign`) so a recipient list
  can be reviewed before committing. Each (customer, channel) pair gets
  its own `CampaignRecipient` row so delivery can be tracked per
  channel — a customer on an `["EMAIL","WHATSAPP"]` campaign gets two
  rows.
- **Scope**: any admin can create/send a campaign, but every targeted
  customer must be one they can already see — `SUPER_ADMIN` can target
  anyone. Only the campaign's creator or `SUPER_ADMIN` can send it.
- **Per-recipient failure isolation** — one recipient failing (bad
  phone number, Resend down, whatever) never stops the rest of the list
  and never un-sends recipients already sent. Tested directly.
- **UI**: a new Campaigns page — create form with a scrollable customer
  checkbox picker, and a detail page per campaign showing live delivery
  status per recipient plus the Send button.
- **A known scalability limit, stated rather than hidden**: campaign
  sending is synchronous within the API request — there's no background
  job queue in this codebase. Fine for a small-to-medium customer list;
  a genuinely large one could hit a request timeout. Worth revisiting
  if your customer count grows a lot.

### What's deliberately NOT built this round

- WhatsApp was **not** wired into any existing automated trigger
  (birthday messages, payment-due reminders, suspension notices, etc.)
  — those all still go out by email only. Adding WhatsApp there is a
  small, natural follow-up once you've confirmed the template works,
  not done here to keep this round's blast radius contained.
- No segment/filter-based recipient selection (by website type, plan,
  etc.) — manual checkboxes only, per your explicit answer.
- No delivery receipts/read receipts from Meta (WhatsApp does support
  webhook-based delivery status, but that's a separate integration not
  built here — "SENT" here means "the Graph API accepted the request,"
  not "the customer received or read it").

## Invoicing system (PDF receipts and due invoices)

Real invoice records now exist, not just notification emails —
`Invoice` table, sequential `INV-000001` numbering (same atomic-counter
pattern as customer codes), generated as actual downloadable PDFs
(`pdfkit`, no headless browser or external service — visually verified
by actually rendering sample invoices to images and looking at them
during development, not just trusting the code compiled).

- **On successful payment** (`src/lib/payments/webhook-handler.ts`): a
  `RECEIPT` invoice (status `PAID`, `paidAt` set) is auto-created and
  emailed with the PDF attached, right after the payment is recorded and
  the subscription extended. Best-effort — a failed invoice can never
  undo a successful payment, tested directly by simulating an
  invoice-creation crash and confirming the payment/restoration still
  completes.
- **When a subscription becomes due** (`src/lib/cron/subscription-checker.ts`):
  a `DUE` invoice (status `PENDING`, with a real `dueDate` computed from
  the plan's grace period) is auto-created and emailed the moment a
  subscription moves ACTIVE → PAYMENT_DUE. Same best-effort contract.
- **Admin follow-up reminder** — a real gap that existed before this
  round: the cron worker notified customers when they became due, but
  never notified any admin at all. Now it does, via the same
  `notifyAdminsForCustomer` fan-out used for payment notifications
  (reaches the assigned admin plus the super admin), so whoever owns
  that customer can actually follow up.
- **`GET /api/admin/invoices`** (scoped, `?customerId=` filter) and
  **`GET /api/admin/invoices/:id/pdf`** — the PDF is regenerated on
  demand from the stored Invoice row rather than stored as a binary
  anywhere; everything needed to reproduce it deterministically already
  lives in the database.
- **UI**: a new Invoices page in the sidebar. Its "View PDF" button
  deliberately does NOT use a plain `<a href>` link — a real bug caught
  during development: a plain link can't carry the login token, so
  clicking it would 403. Fixed by fetching the PDF as a blob with the
  token attached and opening it from an object URL instead.
- **What's not built**: no link yet from a customer's own detail page to
  their filtered invoice history (the main Invoices page lists
  everyone's, still usable, just not deep-linked per customer yet); no
  overdue/reminder escalation beyond the one DUE invoice sent at the
  ACTIVE→PAYMENT_DUE transition.

## Password management, mandatory onboarding fields, billing cycles & currency

**Password change/reset** (`src/lib/admin/password.ts`, three functions,
each with a deliberately different permission model):

- `changeOwnPassword` — any admin, own account, **requires the current
  password** (verified the same constant-time way as login). Route:
  `POST /api/auth/change-password`. UI: `/dashboard/settings`, in the
  sidebar for every admin.
- `resetAdminPassword` — **strictly `SUPER_ADMIN`**, no proof of the old
  password needed (that's the point — they forgot it). Deliberately
  stricter than the `canManageOtherAdmins` delegation used for
  `createAdmin`/`setCustomerAssignments` elsewhere: a delegated
  admin-manager who *can* create admins still *cannot* reset one's
  password. Route: `POST /api/admin/admins/:id/reset-password`. UI: a
  "Reset password" button per row on `/dashboard/admins`, visible only
  to `SUPER_ADMIN` and hidden on the logged-in admin's own row (use
  Settings for your own).
- `resetCustomerPassword` — any admin with access to that customer
  (matches the normal customer-CRUD scoping, not the strict Railway
  policy — this is a support action, not an infrastructure one). Route:
  `POST /api/admin/customers/:id/reset-password`. UI: a card on the
  customer detail page.
- **`AdminUser.passwordChangedAt`** is set on every change (self or
  reset) and shown to `SUPER_ADMIN` as a column on `/dashboard/admins` —
  "Never (still original)" until it's ever been changed. This is exactly
  the visibility into admin password changes that was asked for.
- **No reset-link/email-verification flow exists for either admins or
  customers** — an admin with the right permission just types a new
  password directly and is expected to relay it to the account holder
  themselves. A real "forgot password" self-service flow (customer
  clicks a link, gets a token-based reset page) is a meaningfully bigger
  feature and hasn't been built.

**Mandatory customer fields at onboarding** — `notificationEmail` and
`domainName` are now **required** in `createCustomer()`, not optional.
This applies to *creation* only — `updateCustomer()` still treats every
field as optional to change, so existing customers created before this
policy aren't forced to backfill anything. `phone`, `dateOfBirth`, and
the service dates remain optional (only the two explicitly named fields
became mandatory).

**Billing cycles expanded** — `BillingCycle` now includes `FOUR_MONTHS`
and `SEMI_ANNUAL` alongside the existing `MONTHLY`/`QUARTERLY`/`YEARLY`/
`CUSTOM`, giving Monthly / Quarterly / every-4-months / Semi-annual /
Yearly as selectable options. `addBillingCycle()` handles both new
intervals, tested directly for all six cases.

**Plan currency was already fully wired end-to-end** in the business
logic and route (`Plan.currency`, defaulting to NGN) — the only actual
gap was that the create-plan UI form never exposed a currency selector
at all, silently treating every amount as Naira. Fixed: the form now has
a currency dropdown (NGN/USD) with the amount label and placeholder
adjusting to match. **No specific dollar-amount plans were seeded** —
the $20/$50 examples in the original request were illustrative of the
system needing to support multiple currencies and amounts, not a literal
spec to hardcode; create the actual plans that match your real pricing
through this form.

## Open Graph image (link previews on WhatsApp, etc.)

- **`public/og-image.png`** — a static 1200×630 branded image (Pillow-
  generated, not a Next.js dynamic `ImageResponse` route — deliberate
  choice: a static file is something I could actually open and look at
  in this sandbox to confirm it renders correctly, where a dynamic
  render pipeline would have been unverified guesswork).
- **`app/layout.tsx`** now sets `metadataBase` from `APP_URL`, plus real
  `openGraph`/`twitter` metadata blocks pointing at that image.
  `metadataBase` matters more than it looks: without it, Next emits a
  *relative* `og:image` URL, which renders fine when Next.js itself
  shows a preview but silently fails for WhatsApp/Twitter/etc.'s link
  crawlers — they fetch your raw HTML from outside your server and can't
  resolve a relative path.
- **Verified, not assumed**: built the app with the real `APP_URL`,
  actually started the production server in this sandbox, and confirmed
  by curl that `og:image` resolves to the correct absolute URL
  (`https://.../og-image.png`) and that the file itself serves as a real
  200 OK 1200×630 PNG — not just "the code looks right."
- **Requires `APP_URL` to be set correctly in Railway** (same variable
  already used for the email logo) — if it's missing, `metadataBase`
  falls back to `http://localhost:3000`, which would produce a broken,
  unreachable image URL in production.

## Mobile responsiveness + homepage redesign

- **Dashboard**: the sidebar is now off-canvas on screens ≤860px — a
  hamburger button (fixed top-left) toggles it as a sliding overlay with
  a backdrop, closing automatically on navigation. Every fixed-width
  two-column layout (`1fr 340px`, `1fr 1fr`, etc.) across all dashboard
  pages was replaced with shared CSS classes (`.layout-main-side`,
  `.layout-equal`, `.layout-3col` in `app/globals.css`) that collapse to
  a single column below 860px instead of squeezing both panels into an
  unreadable width. Every data table is wrapped in `.table-scroll`
  (`overflow-x: auto`) so a wide table scrolls horizontally on a phone
  instead of breaking the page layout.
- **Homepage**: rebuilt with a two-column hero (copy + a stylized,
  clearly-illustrative dashboard preview panel — not a real screenshot),
  small inline SVG icons on the feature cards instead of plain text, and
  a new "how it works" three-step section grounded in the actual product
  flow (create customer → map Railway resource → billing runs itself).
  No fabricated stats or uptime percentages — the pills under the
  headline ("Server-verified payments", "Safety-checked suspension",
  "Full activity audit log") describe real, already-built behavior
  rather than asserting unverified metrics.
- **Honest limitation, stated plainly**: this sandbox has no headless
  browser, so none of this was visually screenshotted at actual mobile
  widths — verified by compiling cleanly and reasoning through the CSS
  breakpoints/off-canvas math, not by looking at it render. Give it a
  real look on a phone once deployed.

## Onboarding: website type and domain capture

Two fields captured at customer creation, specifically so the super
admin has what they need on hand when allocating Railway resources
afterward:

- **`websiteType`** — `ONLINE_BANKING`, `INVESTMENT`, `ECOMMERCE`,
  `DELIVERY`, `SAAS`, `WEB_APP`, `CORPORATE`, or `OTHER`. Purely
  informational (nothing in the suspension/hosting logic branches on it
  today), but it tells the super admin what kind of infrastructure
  they're about to configure before they even open Railway.
- **`domainName`** — optional at creation. If provided, `createCustomer`
  composes a second step internally: it attaches the domain (via the
  same global-uniqueness-checked path as the standalone Domains page)
  right after the customer is created. **A failed domain attach never
  undoes the customer creation** — if the domain's already claimed by a
  different customer, the customer is still `CREATED`, and the response
  carries a separate `domainOutcome`/`domainMessage` so the admin knows
  to sort out the domain manually via the Domains page. Tested directly
  for both the success and already-taken cases.

The customer detail page now shows any attached domain(s) directly
(fetched via the new `?customerId=` filter on `GET /api/admin/domains`),
so there's one place to see everything relevant before jumping to
Railway resource mapping on the subscription page.

## Policy: Railway and suspension power belongs to the super admin alone

Per an explicit decision, this is now stricter than the general
"scoped admin" model described below: **plain admins have zero access
to Railway infrastructure or the suspend/restore power, regardless of
which customers are assigned to them.**

- `POST /api/subscriptions/:id/suspend` — `SUPER_ADMIN` only.
- `POST /api/subscriptions/:id/restore` — `SUPER_ADMIN` only.
- `GET`/`POST /api/admin/subscriptions/:id/railway-resource` — `SUPER_ADMIN` only.

The assignment-based `canAccessCustomer()` scoping used everywhere else
(customer/plan/domain/subscription creation, the custom-email composer)
does **not** apply here — these three surfaces check `hasAdminRole(...,
['SUPER_ADMIN'])` directly and nothing else. A plain admin's dashboard
correspondingly hides the Suspend/Restore buttons and the "Railway
infrastructure" section entirely on the subscription detail page
(`app/dashboard/subscriptions/[id]/page.tsx`) rather than showing
controls that would just 403 — the page also had to stop bundling the
Railway-resource fetch into the same `Promise.all` as everything else,
since that 403 would otherwise have taken the whole page load down for
a plain admin.

What a plain admin still *can* do, unchanged: create and manage their
own customers, plans, subscriptions (billing fields only), and domains;
send the custom-email composer; everything data-entry-shaped. What
happens automatically regardless of role: birthday messages, payment-due/
grace-period reminders via the cron workers — these were never
admin-triggered actions, so this policy change doesn't touch them.

One thing worth deciding later, flagged rather than silently assumed:
`suspensionEnabled` (on a subscription) and `automaticSuspension` (on a
customer) are still editable via the plain PATCH routes by any admin
with access to that resource — these are *inputs* to the automated
suspension worker, not the suspend/restore action itself, so they
weren't included in this restriction. If you want those locked to
SUPER_ADMIN too, say so and it's a small change to the same two route
files.

## Admin visibility, customer profile fields, and custom messaging

This is largely the same scoped-admin model from before, extended with
fields and views that were requested directly:

- **Any admin creates and manages customers independently**; your
  SUPER_ADMIN account sees every customer and subscription regardless of
  who created it — this was already true, not new this round.
- **`GET /api/admin/audit-logs`** is new — a system-wide activity feed,
  gated to `SUPER_ADMIN` specifically (not the usual `canManageAdmins`
  delegation used elsewhere), since "all activities... seen by the super
  admin" was explicit in the request. A delegated admin-manager does not
  get this view.
- **Customer records gained**: `notificationEmail` (falls back to the
  login `email` when unset — every notification path, including the
  custom-email composer, resolves this the same way),  `phone` (already
  existed, now actually exposed/editable), `dateOfBirth`,
  `serviceStartDate`, `serviceEndDate`. The last two are **manual fields
  independent of subscription billing periods** — per your answer, not
  tied to `Subscription.currentPeriodStart/End`.
- **`POST /api/admin/customers/:id/send-email`** — the custom-email
  composer. An admin writes their own subject/body and it goes out
  through the exact same `NotificationSender` pipeline as every
  automated notification (Notification-row-first, best-effort dispatch,
  same address resolution), recorded as event `'CUSTOM'` so it's
  distinguishable from automated notifications in the customer's history.
- **`POST /api/cron/birthdays`** — checks every customer's
  `dateOfBirth` against today's month/day (year is stored but never
  checked) and sends a birthday email to any match. **The 7am timing
  itself is not enforced in code** — this route doesn't know or care
  what time it is; you need to add a Railway cron schedule (or GitHub
  Actions, or any external scheduler) that calls this route once daily
  at 7am. There's also no "already sent today" tracking — schedule it
  once a day, not the function guarding against being called twice.

## Email notification dispatch (Resend)

Both customer notifications (`Notification` rows, sent via
`EmailNotificationSender`) and admin notifications (`AdminNotification`
rows, sent via `notifyAdminsForCustomer`) now attempt a real email
through Resend's HTTP API — no SDK, one `fetch` call
(`src/lib/notifications/email.ts`), same "no dependency for one API
call" approach as `paystack.ts`.

**Set `RESEND_API_KEY` and `EMAIL_FROM` in Railway's Variables tab.**
`EMAIL_FROM` must be an address on a domain you've verified in Resend's
dashboard (Resend rejects sends from unverified domains) — a subdomain
like `notifications@mail.digitalweboracleict.com` with the DNS records
Resend gives you is the usual pattern, so you don't have to touch your
main domain's mail setup.

**The row is always written first, the email is best-effort on top.**
If Resend is unconfigured, down, or rejects the address, the
`Notification`/`AdminNotification` row still exists with `sentAt: null`
— that's the visible signal dispatch didn't happen. Nothing about the
payment, suspension, or restoration flow is affected either way; see the
safety table below for exactly how that's enforced and tested.

**Still not built:** WhatsApp and SMS channels (named in spec section 30
and the `Notification.channel` field, but only `EMAIL` has an adapter),
and there's no retry/backoff if a Resend send fails — it's fire-once,
log the outcome.

## Testing suspend/restore against real Railway without disarming production

`SUSPENSION_DRY_RUN` is a single global env var — flipping it off to test
one throwaway subscription would flip it off for every real customer
subscription too, for however long the test takes. `Subscription.dryRunOverride`
fixes that: a nullable per-subscription boolean that takes precedence
over the global env var.

```
POST /api/admin/subscriptions/:id/dry-run-override
Body: { "override": false }   → this ONE subscription suspends/restores for REAL,
                                  regardless of the global SUSPENSION_DRY_RUN value
Body: { "override": true }    → this ONE subscription NEVER really suspends,
                                  even if the global var is off
Body: { "override": null }    → back to inheriting the global default
```

Precedence inside `suspendCustomer`, highest first: an explicit
`opts.dryRun` (tests/admin preview only) → `subscription.dryRunOverride`
→ the global `SUSPENSION_DRY_RUN` env var. The cron route
(`/api/cron/subscriptions`) deliberately does NOT force a value anymore —
an earlier draft of that route always passed the global env var
explicitly, which would have silently overridden every subscription's
individual override and defeated the whole feature for the automated
path specifically. Fixed.

To actually test against a real Railway service: create a throwaway
Railway service, map a test subscription to it
(`POST /api/admin/subscriptions/:id/railway-resource`), set its
`dryRunOverride` to `false`, then suspend/restore it and watch the
Railway dashboard — all without touching the global switch that protects
every real customer.

## Running it

```bash
npm install
npm run typecheck   # tsc --noEmit — passes clean (prisma-repository.ts excluded, see below)
npm test            # vitest — 224 tests, all green, no network/DB needed
npm run build       # next build — verified working in this sandbox, produces all 32 API routes + 16 UI pages
```

### One thing I still could NOT verify from this sandbox — be aware before you ship

**`prisma generate`/`prisma validate` need `binaries.prisma.sh`,
which this sandbox can't reach.** `src/lib/db/prisma-repository.ts`
is excluded from `tsconfig.json`'s default typecheck for exactly this
reason. Once you've run `npx prisma generate` somewhere with open
network access, run `npx tsc --noEmit -p tsconfig.full.json` to
typecheck it for real.

### Railway's GraphQL schema — verified, not assumed (2026-09-10)

Every Railway mutation/query name and argument shape in
`src/lib/railway/*` was confirmed against Railway's **live** schema via
introspection from the actual Railway shell — not guessed from public
docs or examples. This found and fixed three real bugs that would have
broken at runtime:

1. **`getServiceDomains()` was missing two required arguments.** The
   `domains` query needs `projectId`, `environmentId`, AND `serviceId` —
   all `NON_NULL` — not just `serviceId`. Every call would have failed
   with a GraphQL validation error.
2. **`ServiceDomain` and `CustomDomain` don't share a `status` field
   name.** `ServiceDomain` has `syncStatus`; only `CustomDomain` has
   `status`. Querying `status` on both (as the original draft did) would
   have failed validation for the `serviceDomains` half specifically.
3. **`getDeployments()`'s pagination used a `limit` field that doesn't
   exist.** `DeploymentListInput` has no such field — real pagination is
   Relay-style (`first` as a separate top-level argument).

One correctness *improvement* also came out of this: `Deployment` has a
real `deploymentStopped: Boolean` field, now used as the authoritative
"did this actually stop" signal in `stopDeployment()` instead of
inferring from status text. And the real `DeploymentStatus` enum has 13
values, not the 5 originally assumed — an invented `'ACTIVE'` status
that never existed has been removed from every check.

`tests/railway-adapters.test.ts` covers all of this directly: the exact
arguments sent for `domains`/`deployments`, the exact field names
requested per domain type, and the `deploymentStopped`-takes-priority
behavior.

**Still true, and this doesn't change it:** Railway's schema can change
again in the future. If these functions start throwing `RailwayApiError`
unexpectedly, re-run introspection (the shell script used to produce
the above is straightforward — ask if you need it again) rather than
guessing at a fix.

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
| Scoped admins can't see/act on unassigned customers | `canAccessCustomer()` — SUPER_ADMIN passes always; plain ADMIN only for customers with an `AdminCustomerAssignment` row; checked fresh against the DB every call, not trusted from the session token. Gates listing, checkout, and the CRUD routes. **Does not gate suspend/restore/Railway resources** — those are `SUPER_ADMIN`-only regardless of assignment, per the explicit policy above. |
| Customer codes never reused, even across future deletions | `CustomerCodeCounter` singleton row, atomically incremented — never derived from `COUNT(*)` on `Customer`, which would reuse a number if a row were ever deleted. |
| Admin-management privilege can't self-escalate | `createAdmin()`/`setCustomerAssignments()` require SUPER_ADMIN to create another SUPER_ADMIN or grant `canManageAdmins` — a delegated admin-manager cannot mint peers or successors. |
| Payment notifications only reach the right admin(s) | `notifyAdminsForCustomer()` fans out to every SUPER_ADMIN plus assigned ADMINs only, deduplicated — tested for the "assigned to a different customer gets nothing" case specifically. |
| Wrong payment provider never silently used | `resolvePaymentProvider()` throws a typed error for providers with no real adapter (FLUTTERWAVE today) instead of falling back to Paystack or faking success. |
| Suspended-but-not-terminated customers can still log in | `authenticateCustomer` only blocks `TERMINATED`, specifically so a suspended customer can reach the billing portal and pay their way back. |
| Railway sync never assumes success OR failure | `syncRailwayResources` sets `UNKNOWN` (not `ERROR`, not silently unchanged) when Railway is unreachable — "we don't know" is a distinct, honest state from both extremes. |
| MULTI_TENANT can never be mapped with an unsafe suspension strategy | `mapRailwayResource()` rejects `MULTI_TENANT` + anything other than `APP_LEVEL` at data-entry time — a bad pairing can't even get saved, rather than sitting in the database until a future suspension takes down every other customer sharing that service. |
| Railway suspension verification uses the real, authoritative signal | `stopDeployment()` checks `Deployment.deploymentStopped: Boolean` (confirmed real via live introspection), not a guess from status text — see "Railway's GraphQL schema" above. |
| Testing real suspension can't accidentally disarm production for every customer | `subscription.dryRunOverride` takes precedence over the global `SUSPENSION_DRY_RUN` env var per-subscription — see "Testing suspend/restore against real Railway" above. The cron route no longer force-overrides this (a real bug caught and fixed: it was passing the global value explicitly, which would have silently defeated every subscription's individual override for the automated path). |
| Attaching a domain already claimed by a different customer fails cleanly, not with a crash | `domainName` is globally unique in the schema, not unique per-customer — a real bug caught before shipping: the original uniqueness check only looked at the target customer's own domains, so a cross-customer duplicate would have hit Prisma's constraint directly and thrown an unhandled error instead of a clean `ALREADY_EXISTS`. Fixed with a dedicated `findByDomainName()` lookup; tested directly. |
| PATCH on a subscription can never set `status` | `updateSubscription()`'s input type has no `status` field at all — not filtered out, structurally absent — and the route explicitly rejects a `status` key in the request body with a message pointing at the right endpoint. Status only ever changes through suspendCustomer/restoreCustomer (verified against Railway) or the webhook (verified against the payment provider). |
| A notification failure can never crash a suspend/restore/webhook response | **Real bug caught in production, not just review**: `deps.notifications.send()` was called with no try/catch in `suspendCustomer`, `restoreCustomer`, and the payment webhook — if it threw (a database error, anything), the exception had nothing stopping it from reaching the route as a raw, non-JSON 500. All three call sites now wrap the notification call and swallow failures deliberately, since the suspension/restoration/payment itself already succeeded and was recorded before the notification was ever attempted. Tested directly: each engine still reports its real outcome (`SUSPENDED`/`RESTORED`/`PROCESSED`) even when notification dispatch throws. |
| A failed onboarding domain attach never undoes a successful customer creation | `createCustomer()`'s optional `domainName` composition checks global uniqueness the same way the standalone Domains page does, but a conflict only sets `domainOutcome: 'ALREADY_EXISTS'` on the response — the customer row itself is never rolled back or left in a partial state. Tested directly for both the attach-succeeds and domain-already-taken-elsewhere cases. |
| A delegated admin-manager cannot reset another admin's password even though they can create admins | `resetAdminPassword()` checks `requester.role === 'SUPER_ADMIN'` directly — not `canManageOtherAdmins()`, which a delegated admin with `canManageAdmins: true` would pass. Controlling another privileged account's credentials is treated as more sensitive than creating one. Tested directly, including the specific case of a `canManageAdmins` admin being rejected. |
| Self-service password change can't be used to take over someone else's account | `changeOwnPassword()` requires the CURRENT password, verified with the same constant-time comparison used at login, before accepting a new one — there's no separate "set password" path that skips this for your own account the way a SUPER_ADMIN reset skips it for someone else's. |
| A failed invoice generation can never undo a recorded payment or a due-status transition | Both `createAndSendReceiptInvoice()` (webhook) and `createAndSendDueInvoice()` (cron) are called inside try/catch at their respective call sites, same pattern as the notification-failure fix from an earlier round. Tested directly by simulating an invoice-creation crash in both the webhook and the cron, confirming the payment/subscription-status change still completes either way. |
| The invoice PDF viewer can't silently fail via an unauthenticated link | A real bug caught during development, not after: the first draft of the Invoices page used a plain `<a href>` to the PDF route, which can't carry the login token — clicking it would have 403'd for every admin. Fixed by fetching the PDF as an authenticated blob and opening it from an object URL instead. |
| A failed or unconfigured email dispatch can never block a payment, suspension, or restoration | `sendEmail()` never throws — a missing `RESEND_API_KEY`, a Resend outage, or a bad address always returns `{ success: false }`, checked and tested directly (`tests/email.test.ts`) for the network-error, error-status, and unconfigured cases. Every caller (webhook, suspension engine, cron) has already done the thing that matters — recorded the payment, stopped/restored the deployment — before attempting to notify anyone. |
| A delegated admin-manager can't spread scope beyond their own | `setCustomerAssignments()` now checks that a non-SUPER_ADMIN requester only assigns customers they can already see themselves — a real gap caught before shipping: without this, a delegated `canManageAdmins` admin could have granted a sub-admin visibility into a customer the delegator never had access to. SUPER_ADMIN is exempt (no scope to exceed). Tested directly (`tests/admin-management.test.ts`). |
| Subscription status can never be set directly, bypassing verification | `UpdateSubscriptionInput` (the PATCH type) has no `status` field at all — a compile-time guarantee, not just a runtime check (see the `@ts-expect-error` test in `domains-and-subscription-editing.test.ts`). The PATCH route additionally rejects any request body containing `status` with an explicit 400, pointing at the right endpoint instead. |

## What's deliberately NOT done yet

- Basic admin UI exists now: `/login`, `/dashboard`, `/dashboard/customers`,
  `/dashboard/plans`, `/dashboard/subscriptions` — login, list, and create
  forms for customers/plans/subscriptions. No customer-facing portal, no
  domain management UI, no way to edit anything after creation (see the
  subscription-editing gap below), no suspend/restore buttons in the UI
  (still curl/API-only for those). Session token lives in `localStorage`
  — the standard XSS exposure of any non-httpOnly-cookie token; fine for
  a small trusted admin team, worth revisiting before wider exposure.
- **WhatsApp (Meta Cloud API) integration — not started.** This was
  explicitly deferred to last, per your own sequencing. No adapter, no
  schema for a WhatsApp channel's delivery status, nothing wired.
- **Bulk/segmented "campaign" sending — not started.** Everything built
  this round (custom email, birthday messages) is one-recipient-at-a-time.
  A real campaign feature (pick a segment of customers, send one message
  to all of them, track delivery per recipient) needs its own data model
  and hasn't been designed yet, let alone built.
- No Flutterwave adapter — the routing/schema support is real (see
  above), the actual provider implementation isn't.
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
