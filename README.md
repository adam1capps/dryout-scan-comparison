# ReDry Scan Comparison

The platform behind ReDry's client-facing drying progress reports. One app,
one database, every job: a new job is a form and a drag-and-drop, a rescan is
a re-drag, and the additional square footage found along the way becomes a
signed change order without leaving the app.

Live reports are served at `reports.re-dry.com/<job>`, with optional vanity
addresses per job.

**[`PLAN.md`](PLAN.md) is the build plan and the decision record.** Read it
first; §11 holds the eleven decisions everything here follows.

## Running a job

| What | Where | Roughly |
| --- | --- | --- |
| Create the job: name, address, editors, dates, buildings, figures | **Job setup** (staff link in the header) | 10 min |
| Drop in scan images and vent maps; sizes are measured from the files | Job setup | 10-20 min |
| Add a scan round after a rescan, enter that round's figures, re-drag | Job setup | 10 min |
| Mark findings and propose vents on the report | The report itself, signed in | as you go |
| Price and send a change order; the client signs it online | **Change orders** (staff link in the header) | 5 min |
| Optional vanity address `<job>.re-dry.com` | Netlify domain alias + one CNAME | 3 min |

## How it fits together

```
src/
  job/manifest.js     the demo fixture; the shape a job's manifest takes
  job/wizard.js       filename parsing, validation, draft-to-manifest assembly
  data/project.js     boots the job's manifest at runtime, derives what screens read
  screens/            CampusOverview, BuildingDetail, SetupScreen, ChangeOrders*
  components/         ScanFrame, FindingPanel, VentRecap, AppHeader, Lightbox
  scope.js            the drying math: in-scope, change, percent
  theme.js            brand tokens and the red-orange-yellow-green drying gradient
netlify/functions/
  _lib.ts             job resolution, the Clerk + allowlist auth contract
  _mail.ts            the shared SendGrid path and per-job comms identity
  _pdf.js             the branded change-order document and signature certificate
  job.ts / jobs.ts    public manifest read; staff registry CRUD
  assets.ts           content-addressed scan images (upload + CDN read)
  annotations.ts      the one public read: findings, proposed vents, collect marks
  findings.ts, proposed-vents.ts, collect-marks.ts, photo.ts
  quote-request.ts    the client's "quote it" request
  change-orders.ts    staff: create, edit, send, void
  change-order.ts     client: view, sign, decline
  export.ts           the authenticated full-fleet export the backup uses
db/schema.ts          jobs + every annotation table, all keyed by job
tools/backup.mjs      the off-platform snapshot
```

Two things worth knowing before editing:

**Pins are percentages, and aspect ratios are load-bearing.** Every marker is
stored as `x`/`y` in 0-100 relative to its frame, and the frame takes its shape
from the image's true pixel dimensions. That is why the wizard measures
uploads instead of asking anyone to type a ratio: a wrong ratio moves every
pin on that drawing.

**Tenancy is structural.** Every request resolves its job once
(`requireJobFrom`), and every query filters by it. Do not add a query that
reaches the database without a job id — that is the one mistake this
architecture is designed to make impossible rather than merely reviewable.

## Local development

```bash
npm install
netlify dev          # app + functions + a local Postgres
npm run db:migrate   # apply pending migrations to the LOCAL database only
npm run build        # lint + production build
```

Copy `.env.example` to `.env` and fill in the Clerk keys and
`SENDGRID_API_KEY`. Without a Clerk publishable key the app runs read-only:
deliberate, so a misconfigured key can never take a client's report down.

At `/` with no job in the database the bundled demo fixture renders, so the
app is runnable before any job exists.

## Changing the schema

```bash
# 1. edit db/schema.ts
npm run db:generate    # writes a migration into netlify/database/migrations
# 2. read the SQL
npm run db:migrate     # apply locally to test
# 3. commit the schema change and the migration together
```

Netlify applies whatever is in `netlify/database/migrations/` during the
deploy — preview branches first, then production on publish. Never apply a
migration to the hosted database by hand.

## Backups

```bash
BACKUP_TOKEN=eyJ... npm run backup            # every job, into ./backups
BACKUP_TOKEN=eyJ... npm run backup -- /path   # somewhere else
```

Authenticated on purpose: the public API redacts staff-only fields and never
exposes quote requests or change orders, so a credential-less backup would
quietly be a partial one. Get the token from the browser console while signed
in (`await window.Clerk.session.getToken()`) and run within about a minute —
Clerk session tokens expire fast, and the script stops rather than writing a
thin backup that claims to be complete.

## Deploy history is an attack surface

Netlify serves **every past deploy** permanently at its own public permalink,
and those old function bundles run against the **live** database and blob
store. Fixing an authorization flaw and deploying does not retire the flaw.

`.github/workflows/prune-deploys.yml` deletes everything older than the newest
five deploys after each push to `main`. It needs two repository secrets:
`NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.

The second defense is in the code: `REPORT_EDITORS` is versioned deliberately
(`_lib.ts`). Any future fix to the authorization check should rename it, which
takes the allowlist away from every older deploy at once and fails them closed.

## First-time setup

1. Netlify: **Add new project** from this repository. Build `npm run build`,
   publish `dist`, functions `netlify/functions` (all in `netlify.toml`).
2. `netlify database init` — provisions Postgres and injects `NETLIFY_DB_URL`.
3. Set four environment variables on the site: `VITE_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, `REPORT_EDITORS`, `SENDGRID_API_KEY`.
4. Point `reports.re-dry.com` at the site (one CNAME), or delegate the
   subdomain to Netlify DNS once and skip DNS work for every vanity address
   thereafter.
5. Add the two repository secrets above so deploy pruning runs.
6. Confirm SendGrid domain authentication for re-dry.com, then set
   `fromEmail` on jobs (or leave the platform default).

Clerk needs no per-job work: the re-dry.com production instance shares its
session across every subdomain.
