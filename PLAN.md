# ReDry Scan Comparison — Platform Plan

**Goal:** turn the one-off McCallum drying-progress report into **ReDry Scan Comparison** —
a repeatable platform, in its own new repo, that produces the same client-facing report
for any ReDry job with drag-and-drop setup, supports **as many scan rounds as a job
needs** (not just pre/post), and can **generate and send change orders** for additional
wet square footage found along the way.

This plan was produced by seven investigation passes over the McCallum codebase (data
inventory, equations, UI architecture, photo/asset pipeline, backend/auth/security,
delivery tooling, plus an adversarial verification pass that cross-checked all claims
against the source). Every file:line cited below was verified against commit `812e483`.
This document is written to stand alone: it is the seed document for the new repo.

---

## 1. Executive summary

- **The McCallum app is closer to a template than it looks.** The interaction engine —
  scan frames, percentage-pinned annotations, wipe compare, tables, rollups, auth, photo
  uploads — is already job-agnostic. The McCallum-ness is concentrated in
  `src/data/project.js`, ~40 hardcoded strings across the two screens, the `index.html`
  OG head, four constants in `quote-request.ts`, and `tools/`.
- **Recommended architecture: one multi-tenant app** (`reports.re-dry.com`), one Netlify
  site + one database, jobs stored in Postgres, scan images in Netlify Blobs, and a
  staff-only **New Job wizard with drag-and-drop upload** that measures image dimensions
  automatically. Per-job cost drops from ~2–4 hours of code editing to **~35–60 minutes
  of form-filling and dragging files**, with zero deploys, zero DNS, zero env vars per
  job. It lives in the new repo (**`dryout-scan-comparison`**), seeded from the McCallum
  code but developed independently.
- **Scan rounds are a first-class list, not a pre/post pair.** A job holds an ordered
  series of scans (baseline, then as many progress rounds as it takes to get dry). The
  report compares baseline against the latest round by default, any two rounds on
  demand, and shows the drying trend per building. A rescan is a re-drag in the wizard,
  not a redeploy.
- **Change orders become a module, not just an email.** The additional out-of-scope SF
  the app already tracks (via proposed-vent markers) feeds a staff-initiated change
  order: priced line items → branded ReDry document → sent via SendGrid → client
  accepts in the report itself → acceptance recorded with name/title/timestamp. A
  cross-job dashboard shows every outstanding change order — the trickle-in revenue
  radar.
- **The clone-the-repo-per-job alternative was scored and rejected** for "a lot of
  jobs": Netlify caps databases per account (50 on Pro), template repos have no fix
  propagation (every bug fix = N merges + N deploys + N deploy-permalink cleanups), and
  per-job setup never gets cheaper than hand-authoring a 350-line data file with
  pixel-accurate aspect ratios — the single most error-prone step today, since a wrong
  ratio silently moves every saved pin.
- **McCallum stays live and untouched** while the platform is built. Migrating it in as
  job #1 (flipping one CNAME) is the recommended final phase, but it is a separate,
  reversible decision — nothing before it touches `mccallum.re-dry.com`.
- **Tool verdicts:** Netlify — yes, everything stays here (Functions, DB, Blobs).
  SendGrid — already integrated and working in `quote-request.ts`; keep the exact
  pattern, extend it to change orders, confirm domain authentication. Git/GitHub +
  Claude Code — build and evolve the platform; no longer needed per job. **Render — no
  role**; everything here is static + short functions, exactly Netlify's shape.

---

## 2. What changes per job vs what is generic

### Job data (entered per job, via the wizard)

| Data | Today (McCallum) | Real-life source |
|---|---|---|
| Property name, address, client name/contact | `project.js:20-21`, plus duplicated in `index.html`, `quote-request.ts:6`, `backup.mjs:23`, README | Client intake / CRM |
| Scan rounds (date + label each), install window(s), placement report date | `project.js:24-26` holds exactly two scan dates; install dates hardcoded twice in `CampusOverview.jsx:29,62` | Roof MRI reports + install log |
| Per-building needs-to-dry SF **per scan round** (wet + damp) | `BUILDINGS[].pre/post` — exactly two values; duplicated in `og-card.html:179-185` | Roof MRI moisture report per round |
| Building/section structure incl. gaps (C runs 1,2,3,5; F runs 2–7) | `views` keys in `project.js` | The printed Vent Placement Guide — numbering must match what the crew reads |
| Scan images **per drawing per round** + vent maps, with true pixel aspect ratios | 85 files in `public/assets/`, ~81 hand-typed aspect strings | Roof MRI grid PNGs + ReDry placement maps |
| Vent counts per drawing/building/status summary | `project.js` + hand-summed 144 at `:338` | ReDry vent placement report |
| Change-order pricing (rate per additional SF, terms, client signer) | Does not exist — Quote It only emails a lead | Proposal / contract |
| Editor emails | `REPORT_EDITORS` env var | Per job |
| Report URL / subdomain, OG share card | `index.html:23-42`, `og-card.html`, `quote-request.ts:7` | Per-job provisioning |

### Generic (build once, never touch per job)

Theme/brand layer (`theme.js`, design-system tokens, DM Sans, logos, footer), all scope
math (`scope.js`), vent category taxonomy and 50-SF stepping (`ventCategories.js`), both
screens' table/sort/rollup machinery, `ScanFrame`/pin placement/wipe compare/lightbox,
the annotations store and API client, the entire auth contract (`_lib.ts`: Clerk
verification + fail-closed verified-email allowlist + anonymous-read redaction), photo
upload/GC pipeline, `netlify.toml`, `vite.config.js`.

### Needs parameterization (one-time work, in the new repo)

- **Scan rounds**: the fixed pre/post pair becomes an ordered `scans[]` list (see §4).
  This is the largest structural change and lands first, in the data model.
- **Terminology**: "Campus/Building/Roof Section" must become a config word-set
  ("Property/Wing/…", "Facility/Warehouse/…"). ~15 user-visible strings, including two
  places that print `Building {id}` while ignoring the building's display name
  (`CampusOverview.jsx:402,504`).
- **Feature flags**: vents are currently structural — a no-vent job still renders the
  whole Vents section, the Rapid-Vent product card, and "map pending" panels. Needs
  `features.vents / proposedVents / ventCollection / quoteIt / changeOrders /
  landing:"auto"` (auto = skip the overview screen for single-building jobs).
- **`scope.js:1`** imports `BUILDINGS` at module level — the math must take units as an
  argument (first refactor).
- **`index.html` OG head** must be generated per job (scrapers never run JS). Today's
  meta is hardcoded **and already stale** — the live report reads 35,300 → 14,650 SF
  (58%) since out-of-scope tracking landed (commit `ea69855`), while the meta still says
  18,900/46%.
- Drop dead fields (`statusLine`, `aerial*`, `breakdown`), the legacy vent-note
  migration UI (`BuildingDetail.jsx:725-760`), and the McCallum staff checklist
  (`CampusOverview.jsx:570-607`).

---

## 3. The equations (canonical, generalized to N scan rounds)

Raw inputs per building: needs-to-dry SF **per scan round** (wet + damp), `vents`,
`drawings`, per-drawing images per round + vent counts. Out-of-scope SF is authored at
runtime as `additionalSf` on proposed-vent markers (50-SF steps, ≤100,000).

Derived (generalizing `src/scope.js`, which today hardcodes rounds 0 and 1 as
`pre`/`post`):

```
baseline               = scans[0]                       // the pre-install scan
current                = latest completed round          // default comparison target
outOfScope(building)   = Σ additionalSf over the building's proposed-vent markers
inScope(building, r)   = max(0, needsToDry[r] − outOfScope)   // clamped at zero
change(building)       = inScope(current) − needsToDry[baseline]   // signed
pct(building)          = round(change / needsToDry[baseline] × 100)  // guarded ÷0
site totals            = sums of the building rows; site % recomputed from totals
vents per 1,000 SF wet = vents / (inScope(current) / 1000), one decimal, "—" when ≤ 0
quote / CO figure      = job-scoped SQL sum of additionalSf, snapshotted per request
drying trend           = needsToDry[r] per round, per building — sparkline + table
```

Formatting: `toLocaleString("en-US") + " SF"` everywhere; integer percents; zeros render
"—".

UI consequences of N rounds (all confirmed against the current screens):

- The building screen's pre/post panels become **round pickers**: compare baseline vs
  latest by default; the wipe slider compares any two chosen rounds.
- The campus table's Pre/Change/Post/% columns read baseline vs current; a per-building
  drying-trend column (sparkline over rounds) replaces nothing and adds the story
  "possibly many more scans before we get it dry" is really about.
- The timeline lists every round + install window(s), not three fixed entries.
- **Annotations bind to the round they were placed on** (nullable = current). Pins are
  stored as percentages of the image frame, and each round's image is its own frame —
  without the round reference, a pin placed on round 2's scan could drift on round 3's.

**Validation rules the wizard must enforce** (none are checked today):

1. Vent triangle: Σ per-section ventCount = overview ventCount = building.vents, and
   Σ building.vents = status-summary total (the 144 is currently hand-kept in sync).
2. `drawings` = number of non-"ov" sections (single-roof exception: A-pattern).
3. Every image's stored aspect matches its true pixel dimensions — **never hand-typed**
   (a wrong ratio silently moves every saved pin).
4. Baseline SF > 0 per building (the % sort at `CampusOverview.jsx:23` divides
   unguarded).
5. Warn when out-of-scope > current-round SF (the clamp currently hides it silently).
6. Section keys come from the printed guide, gaps allowed, never auto-numbered.
7. Scan rounds are strictly dated and ordered; a round may cover only some drawings
   (F-3 already ships with no post image — "scan pending" is a real state).
8. Server-side building/view whitelist for annotations — today an orphaned marker with
   a bad building id renders nowhere but **still bills into the quote email's SF sum**
   (`quote-request.ts:95-98`).

**Known display bug to fix during templating:** all Change/% cells are green regardless
of sign, and the hero always says "reduction" via `Math.abs` — a building that got
wetter renders as a green positive. Building E (8,700 → 8,100) shows near-stall is real,
and with multiple rounds a temporary worsening between rounds is expected, so the trend
display must handle it honestly.

---

## 4. Architecture: one multi-tenant app (recommended)

Three options were scored (setup time, fix-across-20-jobs, blast radius, Netlify cost,
DNS/Clerk friction, deploy-permalink hygiene, automatability):

- **A — GitHub template repo, one site + DB per job.** Best isolation; everything else
  loses: 2–4 h/job, no fix propagation, the deploy-permalink cleanup ritual × N sites ×
  every fix, and a hard wall at Netlify's ~50-databases-per-account cap on Pro.
- **B — one multi-tenant app.** One site, one DB, `jobs` table, scans in Blobs, wizard
  onboarding. ~35–60 min/job, one commit fixes every job, one deploy history to police.
  Cost: blast radius (one bad deploy affects all reports) and tenancy discipline.
- **C — shared core package + thin per-job repos.** A's operational burden plus a
  package-release process; rejected.

**Recommendation: B**, built in the new `dryout-scan-comparison` repo, with tenancy made
structural, not conventional:

- Resolve the job **once** in `_lib.ts` from the Host header (vanity domains) or path
  (`reports.re-dry.com/<slug>`), and force every query through job-scoped helpers so a
  missed `WHERE job_id` is impossible, not merely reviewable.
- `jobs` table: slug, hostnames, display name/address, client contact, terminology,
  features, branding overrides, notify/from addresses, per-job editor list,
  change-order pricing/terms, and the report manifest (units, sections, **scan
  rounds**, image references) as JSONB.
- `job_id` FK on all annotation tables; `vent_proposal_reasons` unique becomes
  composite `(job_id, building)`; job-scoped SF sums; job-prefixed blob keys.
- `REPORT_EDITORS` survives as the global super-admin list (keeps the fail-closed
  property); per-job editors live on the jobs row.
- Add `authorizedParties` to `verifyToken` (`_lib.ts:47`) as the subdomain count grows —
  Clerk's own recommendation.

**Clerk is the big reuse win, verified:** the re-dry.com production instance shares its
session cookie across **all** subdomains automatically. Per job: zero Clerk work.

**Why this is safe enough:** these are link-shared client documents, not adversarial
tenants; Netlify deploy previews get an automatic database branch to rehearse schema
changes; rollbacks are instant; and the versioned-env-var kill switch plus a scripted
deploy-permalink cleanup (one site now, so it actually happens) carry over from the
McCallum hardening work.

### Seeding the new repo

`dryout-scan-comparison` starts from the McCallum code minus the McCallum data:

- **Copy in**: `src/` (screens, components, theme, scope math, vent categories),
  `netlify/functions/`, `db/`, `netlify.toml`, `vite.config.js`, build tooling, the
  brand assets (logos, Rapid-Vent photo), and this plan as `PLAN.md`.
- **Leave behind**: `public/assets/` scan images, `src/data/project.js` contents (the
  shape becomes the manifest schema), `design/` and `HANDOFF-README.md` (the design
  export contains a stale second copy of the McCallum dataset, personal residue, and
  names of other private repos), `tools/og-card.html`'s hardcoded data, the McCallum
  README.
- Day-one state: repo builds and runs with a demo job fixture; Phase 1 refactoring
  happens there, not in the McCallum repo.

### McCallum migration (final phase, separately decided)

Build the platform in the new repo/site — `mccallum.re-dry.com` stays untouched and
serving throughout. When (and only when) the platform has proven itself on new jobs:

1. Import McCallum as job #1 — annotations + photos come through the same
   credential-free export `tools/backup.mjs` already uses; images bulk-upload with
   dimensions read from PNG headers (no hand-typing, no pin risk). Its two scans import
   as rounds 0 and 1 — the multi-round model contains pre/post as a special case.
2. Short edit freeze; diff annotations between old and new site, pin positions included.
3. Add `mccallum.re-dry.com` as a domain alias on the new site; flip the CNAME. Same
   URL, zero downtime.
4. Keep the old site intact for a rollback week, then delete its deploys (closing its
   permalink attack surface for good) and archive the repo.

Until then the old repo remains the McCallum system of record. If you prefer never to
migrate it, the platform simply starts at job #2 — nothing in this plan depends on it.

---

## 5. Drag-and-drop job setup (the wizard)

A staff-only `/setup` flow on the new app, gated by the same `requireUser` contract as
every other write.

- **Drop zones per scan round**: the wizard shows the job's scan rounds (baseline +
  add-a-round button) plus Vent maps and Share image zones. The round/zone a file is
  dropped in — not the filename — decides what it is, which kills today's
  three-convention naming mess at the root.
- **Dimensions are measured, never typed**: on drop, `createImageBitmap(file)` (with
  EXIF-orientation handling; `Image.decode()` fallback) reads true pixel width/height.
  The exact technique already exists in the McCallum repo
  (`design/image-slot.js:259-273`, `src/api.js:116-139`).
- **Filename auto-mapping with manual override**: one regex maps `B-1.png`, `b1.png`,
  `vents-b1.png`, `vents-b-overview.png` → building B / section 1 / overview. Files land
  in a buildings × sections grid of thumbnails per round; unparseable files go to an
  "Unassigned" tray; conflicts are flagged; every cell can be reassigned by drag — the
  `vents-c4.png` → section 5 case proves the override is necessary. Section lists are
  editable per building (handles "no Section 4 on C", "F runs 2–7").
- **Numbers entered once, inline**: ventCount per vent-map cell; per-building SF per
  round; name/address/dates. No second copy anywhere — the OG card and meta generate
  from the same manifest.
- **Adding a rescan round later** is the same screen: "Add scan round" → date + label →
  drag the new PNGs → per-building SF for that round → save. No deploy, no code. This is
  the workflow "possibly many more before we get it dry" needs.
- **Storage: Netlify Blobs, content-addressed** (`sha256(bytes)` keys) behind a function
  GET with `Cache-Control` + `Netlify-CDN-Cache-Control: durable, immutable`. New round
  → new keys → viewers can never be stuck on a stale scan, and immutable CDN caching
  becomes *correct* (today's `must-revalidate` rule exists only because rescans
  overwrite paths in place). Scale check: ~15–20 MB/round; even 100 jobs × several
  rounds stays in single-digit GB — negligible against Blobs limits.
- **Save** writes the manifest (units, sections, rounds, blob URLs, measured dims) to
  the jobs row; the report boots from the manifest.
- The existing finding-photo pipeline (client-side shrink to 900px JPEG → auth-gated
  POST → 4 MB cap → public immutable GET → GC on row change) is the strongest piece of
  the McCallum codebase and carries over unchanged.

---

## 6. Change orders — capturing the additional-scope revenue

Today the app *finds* the revenue (staff mark proposed vents with `additionalSf`; the
out-of-scope total surfaces on the report; Quote It emails a lead to Adam). The money
then leaves the system. The change-order module closes the loop **inside the app**:

**Data.** A `change_orders` table: `job_id`, sequential CO number per job, status
(`draft → sent → viewed → accepted / declined / void`), line items (JSONB: description,
qty, unit, rate, amount — prefilled from the job's live out-of-scope SF and proposed
vents, editable before sending), totals, the client contact it went to, the generated
document's blob key, and a full snapshot of the SF/vent state at send time (same
snapshot principle `quote_requests.additionalSf` already uses — a CO must be traceable
to the figures the client saw). Timestamps: `sentAt`, `viewedAt`, `decidedAt`, plus
decider name/title.

**Pricing.** Two platform-default options (decision §11.9), selectable per change
order, with per-job overrides: **Lease Per Unit at $750/unit**, or **$2 per SF with a
$2,500 minimum** (installed on the next scan visit). SF line items align to the
existing 50-SF stepping. Standard terms text lives at the platform level; the wizard
asks only for deviations.

**Flow.**
1. Staff open "Create change order" on a job → line items prefill from the current
   out-of-scope SF and proposed-vent list → review/edit → save draft.
2. The app renders a **branded ReDry change-order document** (the existing ReDry brand
   template system — navy/orange, Trebuchet document stack — is the source of truth for
   its look) to PDF, stored content-addressed in Blobs.
3. Send via SendGrid (same record-first-then-email pattern, same delivery-receipt
   stamping as quote requests) to the client contact, with a link back to the report's
   change-order page.
4. The client opens it in the report (marks `viewedAt`) and accepts or declines in
   place with a **legal e-signature in the ReDry Proposal Builder's format** (decision
   §11.10 — same fields, consent language, and record shape as that app's `/accept`
   flow); both sides get the confirmation email with the PDF attached.
5. Accepted COs show on the report (client-visible) and adjust the "original scope"
   baseline for subsequent rounds — dried area that was bought via CO counts as
   in-scope from its acceptance date forward.

**Quote It ties in** rather than duplicating: a client-initiated quote request now
creates a draft change order and notifies staff, instead of dead-ending in an inbox.

**The revenue radar.** A staff dashboard across all jobs: outstanding drafts, sent COs
awaiting decision, accepted-not-yet-invoiced, plus the existing
saved-but-unsent-quote-request gap (`notifiedAt IS NULL`) — every trickle-in dollar
visible in one place.

---

## 7. SendGrid, and the rest of the toolbelt

- **SendGrid** is already live: `quote-request.ts` records the request in Postgres
  first, then sends staff-notify + client-confirm via a zero-dependency `fetch` to the
  v3 API, stamping `notifiedAt` as the delivery receipt. Keep all of it; change orders
  reuse the same send path. Changes:
  1. `JOB_NAME` / `REPORT_URL` / `NOTIFY` / `FROM` move to the jobs row; cooldown
     becomes per (job, email).
  2. Confirm **domain authentication** for re-dry.com in SendGrid (only the dashboard
     knows; the repo proves at least single-sender works). Then send from
     `reports@re-dry.com`.
  3. Add the staff "unnotified requests" surface (folded into the revenue radar, §6).
  4. Add `SENDGRID_API_KEY` to `.env.example` (required by the code, missing from docs).
- **Netlify**: everything stays. One-time win available: delegate a standalone subdomain
  (e.g. `reports.re-dry.com` zone) to Netlify DNS to erase even the per-vanity-domain
  CNAME step. Deploy-permalink cleanup becomes a post-deploy GitHub Action calling
  `netlify api deleteDeploy` (keep last N) — one site, so it actually runs.
- **Git/GitHub + Claude Code**: build the platform in `dryout-scan-comparison`, evolve
  it, and drive one-off tasks (importers, DNS API calls). Per-job, no agent needed at
  all.
- **Render**: honestly, no role. Static bundle + sub-second functions is exactly
  Netlify's shape; Postgres is already solved (escape hatch is claiming the DB into
  Neon, still not Render); the one cron-shaped need (backups) fits GitHub Actions or a
  Netlify Scheduled Function. A second host would add a bill, a pipeline, a credential
  store, and a CORS boundary for nothing.
- **Backups**: generalize `tools/backup.mjs` — authenticate so the staff-only vent
  reasons stop being silently lost to redaction, include `quote_requests`,
  `change_orders` + generated PDFs, and the manifest's assets, loop over all jobs, and
  land per-job folders in the client's Drive folder from the jobs row (plus a `pg_dump`
  belt-and-braces layer).

---

## 8. Per-job runbook (target state)

| # | Step | How | Minutes |
|---|---|---|---|
| 1 | Collect Roof MRI deliverables into one folder | Manual | 5 |
| 2 | New Job: name, address, slug, dates, per-building SF, editors, terminology, CO pricing | Wizard form | 10 |
| 3 | Drag baseline scans + vent maps onto the grid; dims auto-measured; vent counts inline | Wizard drag-and-drop | 10–20 |
| 4 | Optional vanity `<job>.re-dry.com`: one domain-alias API call + one CNAME | Claude Code prompt / DNS | 3 |
| 5 | QA: spot-check one pin per building, one test quote request, both emails arrive | Manual | 5–10 |
| 6 | Send the client the link | Manual | 2 |

**~35–60 minutes, no code, no deploy, no env vars.**

**Each rescan round:** drag the new PNGs into "Add scan round," enter that round's
per-building SF, save — the report updates live. **Each change order:** prefilled draft
→ review → send → client accepts in the report.

---

## 9. Build phases

- **Phase 0 — Decisions & pre-flight**: **DONE 2026-08-23** — repo seeded, all eleven
  decisions locked (§11). Still open on Adam's side: confirm SendGrid domain
  authentication in the dashboard.
- **Phase 1 — Extract the template core** (in the new repo): config-driven refactor
  (schema in §2/§3: terminology, features, units, copy), **multi-round scans data
  model**, parameterize `scope.js`, string sweep, generated `index.html` head + OG card
  from the manifest, drop dead fields/legacy UI, fix the known hazards (hand-summed 144,
  unguarded % sort, honest worsening display, favicon — there is none today and the SPA
  catch-all serves HTML as `/favicon.ico`).
- **Phase 2 — Multi-tenant backend**: `jobs` table + `job_id` everywhere + composite
  uniques; host/path job resolution; scoped query helpers; job-scoped quote flow;
  job-prefixed content-addressed asset store; per-job editors.
- **Phase 3 — The wizard**: drop zones per round, auto-mapping grid, validation rules
  (§3), add-a-round rescan flow, manifest save.
- **Phase 4 — Change orders**: schema, pricing config, branded PDF generation, SendGrid
  send + accept-in-report flow, Quote It integration, the cross-job revenue radar.
- **Phase 5 — Ops hardening**: deploy-cleanup Action, generalized authenticated backup,
  SendGrid domain auth + `reports@`, DNS delegation, docs.
- **Phase 6 — McCallum import & cutover** (optional, separately approved; see §4).

Phases 1–4 are the build; each lands as a reviewable PR on the new repo. The McCallum
repo gets only: this plan, plus (if approved) the standalone fixes below.

## 10. Small fixes worth shipping on McCallum now, regardless of the platform

1. `index.html` meta figures are stale (say 18,900/46%; live report is 14,650/58%).
2. Add `SENDGRID_API_KEY` to `.env.example`.
3. Add a favicon (today `/favicon.ico` returns the HTML page via the SPA catch-all).
4. Backup: authenticate + capture `quote_requests`.
5. Quarantine `design/` + `HANDOFF-README.md` from the platform seed — the design
   export contains a **stale second copy** of the McCallum dataset (Building F drawings:
   4 vs live 6), personal residue (`adam@capps.co`, sample client copy), and names of
   other private repos.

## 11. Decisions — locked by Adam, 2026-08-23

All eleven gating questions are answered. These are binding for the build:

1. **Architecture: one multi-tenant app.** Confirmed.
2. **URLs: canonical `reports.re-dry.com/<slug>`** with optional vanity
   `<job>.re-dry.com` aliases per job.
3. **McCallum: freeze for now, decide later.** The live report stays exactly where it
   is. The Phase 6 cutover (import as job #1, pin-for-pin diff, CNAME flip — invisible
   to viewers, same URL, rollback week) stays on the shelf until the platform has run
   2–3 real jobs. Nothing before Phase 6 touches it.
4. **Editors: Abby and Regina edit**, in addition to Adam. Per-job editor lists are
   required (Phase 2); the wizard collects editor emails per job; `REPORT_EDITORS`
   stays as the global super-admin list.
5. **Scope baseline ≡ baseline scan, always.** No separate scope-SF field. Accepted
   change orders extend the in-scope baseline from their acceptance date.
6. **Progress color is a gradient, never unconditional green.** Green means moisture
   left the substrate; the goal is 0 SF. Each building's status moves along
   **red → orange → yellow → green** as it dries, and backward when it gets wetter.
   Implementation: color the Change/% cells and the per-round trend by remaining
   in-scope moisture relative to the baseline (thresholds proposed in Phase 1 for
   Adam's sign-off; the McCallum bug of green ink on a worsening building dies here).
   "Reduction" wording is used only when moisture actually went down.
7. **Terminology defaults: Location → Building → Roof Section 1, 2, 3…** (per-job
   overrides remain available in the manifest).
8. **Quote It: on for every job by default** (self-hides at 0 SF as today).
9. **Change-order pricing — two platform-default options**, selectable per change
   order (per-job overrides allowed):
   - **Lease Per Unit** — $750 per unit.
   - **Per square foot** — $2 per SF with a **$2,500 minimum**, installed on the next
     scan visit.
10. **Acceptance: legal e-signature collected in-app**, in the same format as the
    ReDry Proposal Builder (`adam1capps/redry-proposal-app`) — its `/accept` flow is
    the reference implementation (fields captured, consent language, record format).
11. **Change-order document: generated**, following the Proposal Builder's ReportLab
    document format (the L.D. Tebben-style branded layout). The extraction of both
    formats into a build spec is in `docs/proposal-app-extraction.md` (produced from
    the proposal app's source).

Non-blocking defaults in effect unless Adam overrides: per-section SF as an optional
field feeding the currently-"Pending" table; vent status vocabulary beyond "Installed";
OG regeneration on every manifest save; deep links via hash routing (`#/b/B/3`);
operational caps (10-min cooldown, 4 MB photos) stay global.
