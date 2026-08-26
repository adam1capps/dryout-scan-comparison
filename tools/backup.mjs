#!/usr/bin/env node
/**
 * Takes an independent snapshot of every job on the platform.
 *
 * The code is in git and the images are content-addressed in Netlify Blobs;
 * everything staff and clients author — findings, proposed vents, collect
 * marks, quote requests, change orders and their signatures, and each job's
 * manifest — lives only in Postgres. This writes all of it, plus the finding
 * photos, to a timestamped folder that does not depend on the hosting account
 * staying healthy.
 *
 * The export is authenticated on purpose: the public API redacts staff-only
 * fields and never exposes quote requests or change orders, so a
 * credential-less backup would quietly be a partial one. The token is probed
 * before anything is written, and a rejected token stops the run rather than
 * producing a thin backup that claims to be complete.
 *
 * Clerk session tokens expire about 60 seconds after they are issued, so
 * paste and run in one motion:
 *
 *   BACKUP_TOKEN=eyJ... npm run backup
 *   BACKUP_TOKEN=eyJ... npm run backup -- /some/other/folder
 *
 * Get the token from the browser while signed in on the platform:
 *   await window.Clerk.session.getToken()
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SITE = (process.env.BACKUP_SITE || "https://reports.re-dry.com").replace(/\/$/, "");
const DEFAULT_DIR = process.env.BACKUP_DIR || "./backups";
const TOKEN = process.env.BACKUP_TOKEN || "";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(process.argv[2] || DEFAULT_DIR, `redry-backup-${stamp}`);

const fail = (msg) => {
  console.error(`backup failed: ${msg}`);
  process.exit(1);
};

if (!TOKEN) {
  fail(
    "BACKUP_TOKEN is required. Sign in on the platform, run " +
      "`await window.Clerk.session.getToken()` in the browser console, and run " +
      "this within about a minute: BACKUP_TOKEN=eyJ... npm run backup",
  );
}

const auth = { authorization: `Bearer ${TOKEN}` };

const res = await fetch(`${SITE}/api/export`, { cache: "no-store", headers: auth }).catch((e) =>
  fail(`could not reach ${SITE} (${e.message})`),
);
if (res.status === 401 || res.status === 403) {
  fail(
    `the API rejected BACKUP_TOKEN (${res.status}). Clerk session tokens expire about ` +
      "60 seconds after they are issued — get a fresh one and run again immediately.",
  );
}
if (!res.ok) fail(`the export API answered ${res.status}`);
const data = await res.json();

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "export.json"), JSON.stringify(data, null, 2));

// Photos live in Blobs, not in the JSON — pull the bytes too, or the backup
// restores findings that point at images that are gone.
let photos = 0;
let photoFailures = 0;
for (const entry of data.jobs) {
  const withPhotos = entry.findings.filter((f) => f.photoKey);
  if (!withPhotos.length) continue;
  const dir = join(outDir, "photos", entry.job.slug);
  await mkdir(dir, { recursive: true });
  for (const f of withPhotos) {
    try {
      const r = await fetch(`${SITE}/api/photo?key=${encodeURIComponent(f.photoKey)}`);
      if (!r.ok) throw new Error(`status ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(join(dir, f.photoKey.replace(/[/\\]/g, "-")), buf);
      photos += 1;
    } catch (e) {
      photoFailures += 1;
      console.warn(`  ${entry.job.slug}: could not fetch photo ${f.photoKey}: ${e.message}`);
    }
  }
}

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const lines = [`ReDry Scan Comparison — backup ${stamp}`, `source ${SITE}`, ``];
let openMoney = 0;
let wonMoney = 0;
for (const entry of data.jobs) {
  const co = entry.changeOrders;
  const unsent = entry.quoteRequests.filter((q) => !q.notifiedAt).length;
  openMoney += co.filter((c) => c.status === "sent").reduce((a, c) => a + c.totalCents, 0);
  wonMoney += co.filter((c) => c.status === "accepted").reduce((a, c) => a + c.totalCents, 0);
  lines.push(
    `${entry.job.slug} — ${entry.job.config?.name ?? ""}`,
    `  findings        ${entry.findings.length} (${entry.findings.filter((f) => f.photoKey).length} with photos)`,
    `  proposed vents  ${entry.proposedVents.length}`,
    `  collect marks   ${entry.collectMarks.length}`,
    `  quote requests  ${entry.quoteRequests.length}${unsent ? ` (${unsent} never emailed)` : ""}`,
    `  change orders   ${co.length}` +
      (co.length
        ? ` — ${co.filter((c) => c.status === "accepted").length} accepted, ` +
          `${co.filter((c) => c.status === "sent").length} awaiting a decision`
        : ""),
    ``,
  );
}
lines.push(
  `Across all jobs: ${money(wonMoney)} accepted, ${money(openMoney)} awaiting a decision.`,
  `Photos saved: ${photos}${photoFailures ? ` (${photoFailures} failed)` : ""}`,
  ``,
  `Restore: create each job through POST /api/jobs (the job objects in`,
  `export.json carry slug, editors, hostnames, config and manifest), then`,
  `re-POST its findings, proposed vents and collect marks through their`,
  `endpoints while signed in, re-upload photos/ via /api/photo and PATCH the`,
  `returned keys onto their findings. quoteRequests and changeOrders are the`,
  `revenue record — keep them; do NOT replay them through the public`,
  `endpoints, which would re-email clients and re-snapshot different figures.`,
);
const summary = lines.join("\n");
await writeFile(join(outDir, "SUMMARY.txt"), summary);

console.log(summary);
console.log(`\nwritten to ${outDir}`);
