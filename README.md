# ReDry Scan Comparison

The platform that turns ReDry drying jobs into client-facing moisture scan
comparison reports — one multi-tenant app serving every job, seeded from the
McCallum High School report (`adam1capps/mccallum-drying-progress`).

**Read [`PLAN.md`](PLAN.md) first.** It is the build plan this repo executes:
what is generic vs per-job, the canonical equations, the multi-round scan
model, the drag-and-drop New Job wizard, the change-order module, and the
phase sequence.

## Day-one state

This is the freshly seeded skeleton — the McCallum app's generic core with the
job data swapped for a demo fixture:

- `src/` — both screens and every component, unchanged. The interaction engine
  (scan frames, percentage-pinned annotations, wipe compare, tables) is
  already job-agnostic.
- `src/data/project.js` — a **demo fixture**, not a real job. Phase 1 replaces
  this static module with a runtime job manifest.
- `netlify/functions/` + `db/` — the API, auth contract, and schema as shipped
  on McCallum. No `job_id` yet — multi-tenancy is Phase 2. The demo constants
  in `quote-request.ts` move to the jobs table then too.
- `public/assets/demo/` — generated placeholder scans whose pixel dimensions
  match the fixture's aspect strings exactly (pins are stored as percentages
  of the frame; the aspect must always match the file).
- Brand assets (ReDry / Roof MRI logos, Rapid-Vent photo) — shared by all jobs.

Deliberately **not** carried over from the McCallum repo: the 17 MB of real
scan images, the `design/` prototype export (stale data copy), the OG share
card with its duplicated numbers, and every McCallum-specific string the plan
catalogs.

## Local development

```bash
npm install
netlify dev          # app + functions + a local Postgres
npm run db:migrate   # apply pending migrations to the LOCAL database only
```

Copy `.env.example` to `.env` and fill in the Clerk keys and
`SENDGRID_API_KEY`. Without a Clerk publishable key the app runs read-only —
deliberate, so a misconfigured key can never take a client's report down.

## Build phases

| Phase | What lands |
|---|---|
| 1 | Template core: job config/manifest, multi-round scans, terminology + feature flags, generated per-job meta |
| 2 | Multi-tenant backend: jobs table, `job_id` scoping everywhere, per-job editors, content-addressed Blobs asset store |
| 3 | New Job wizard: drag-and-drop uploads, measured dimensions, add-a-round rescan flow |
| 4 | Change orders: pricing, branded PDF, SendGrid send, accept-in-report, revenue dashboard |
| 5 | Ops hardening: deploy cleanup, full-fidelity backups, SendGrid domain auth |
| 6 | McCallum import & cutover (optional, separately approved) |

Details, decisions, and open questions: [`PLAN.md`](PLAN.md).
