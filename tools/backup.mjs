#!/usr/bin/env node
/**
 * Takes an independent snapshot of everything authored in the report.
 *
 * The scans and the code are in git; the annotations are not — they live only
 * in the Netlify Postgres database, and the photos only in Netlify Blobs. This
 * writes both to a timestamped folder so there is a copy that does not depend
 * on the hosting account staying healthy, or on anyone's memory of what was
 * entered.
 *
 * Reads through the public API, so it needs no credentials and can be run from
 * anywhere. Writes into the client's Google Drive folder by default, which puts
 * the copy off this machine as well.
 *
 *   npm run backup
 *   npm run backup -- /some/other/folder
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Per-job values — parameterized (and looped over all jobs) in PLAN.md Phase 5.
const SITE = process.env.BACKUP_SITE || "https://reports.re-dry.com/demo";
const DEFAULT_DIR = process.env.BACKUP_DIR || "./backups";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(process.argv[2] || DEFAULT_DIR, `report-${stamp}`);

const fail = (msg) => {
  console.error(`backup failed: ${msg}`);
  process.exit(1);
};

const res = await fetch(`${SITE}/api/annotations`, { cache: "no-store" }).catch((e) =>
  fail(`could not reach ${SITE} (${e.message})`),
);
if (!res.ok) fail(`the API answered ${res.status}`);
const data = await res.json();

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "annotations.json"), JSON.stringify(data, null, 2));

// Photos live in Blobs, not in the JSON — pull the bytes too, or the backup
// restores findings that point at images that are gone.
const withPhotos = data.findings.filter((f) => f.photoKey);
if (withPhotos.length) {
  await mkdir(join(outDir, "photos"), { recursive: true });
  for (const f of withPhotos) {
    try {
      const r = await fetch(`${SITE}/api/photo?key=${encodeURIComponent(f.photoKey)}`);
      if (!r.ok) throw new Error(`status ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(join(outDir, "photos", f.photoKey), buf);
    } catch (e) {
      console.warn(`  could not fetch photo ${f.photoKey}: ${e.message}`);
    }
  }
}

const vents = data.proposals.reduce((a, p) => a + p.markers.length, 0);
const sf = data.proposals.reduce(
  (a, p) => a + p.markers.reduce((b, m) => b + (m.additionalSf || 0), 0),
  0,
);

// A human-readable companion, so the backup is legible without running anything.
const summary = [
  `ReDry Scan Comparison — backup ${stamp}`,
  ``,
  `findings        ${data.findings.length}`,
  `  with photos   ${withPhotos.length}`,
  `proposed vents  ${vents}`,
  `  additional SF ${sf.toLocaleString("en-US")}`,
  `collect marks   ${data.collect.length}`,
  ``,
  `Per building:`,
  ...data.proposals.map((p) => {
    const bsf = p.markers.reduce((a, m) => a + (m.additionalSf || 0), 0);
    return `  ${p.building}: ${p.markers.length} vents, ${bsf.toLocaleString("en-US")} SF`;
  }),
  ``,
  `Restore: POST the rows in annotations.json back through /api/findings,`,
  `/api/proposed-vents and /api/collect-marks while signed in, then re-upload`,
  `photos/ via /api/photo and PATCH the returned keys onto their findings.`,
].join("\n");
await writeFile(join(outDir, "SUMMARY.txt"), summary);

console.log(summary);
console.log(`\nwritten to ${outDir}`);
