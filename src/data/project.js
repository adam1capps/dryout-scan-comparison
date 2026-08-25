/**
 * Everything the screens consume, derived from the job manifest.
 *
 * The manifest arrives at runtime from GET /api/job (the row the wizard
 * saves); the bundled demo manifest is the fallback for the demo slug and
 * local development. `initJob()` runs BEFORE React mounts (src/main.jsx), so
 * by the time any component renders, every export below is settled.
 *
 * Exports are `let` bindings reassigned by applyManifest — ES module live
 * bindings mean importers always read the current value. The one rule that
 * keeps this sound: components must not capture these at module scope (build
 * derived constants inside the component body), which is why CampusOverview
 * assembles its column and timeline definitions during render.
 *
 * The `pre`/`post` names survive on the derived shapes because a dozen
 * components speak them; they mean baseline/current now — per unit, the
 * latest round that actually has a figure.
 */
import { MANIFEST as DEMO_MANIFEST } from "../job/manifest.js";
import { JOB, loadJob } from "../api.js";

export let MANIFEST = DEMO_MANIFEST;
export let TERMS = DEMO_MANIFEST.terminology;
export let FEATURES = DEMO_MANIFEST.features;
export let SCANS = DEMO_MANIFEST.scans;
export let BASELINE = SCANS[0];
export let CURRENT = SCANS[SCANS.length - 1];
export let INSTALL = DEMO_MANIFEST.install;
export let PROJECT = {};
export let BUILDINGS = [];
export let VENT_STATUS_SUMMARY = [];
export let CAMPUS = {};

/** The latest round id for which `byRound` has a value. */
function latestWith(byRound) {
  for (let i = SCANS.length - 1; i >= 0; i--) {
    const v = byRound?.[SCANS[i].id];
    if (v !== undefined && v !== null) return SCANS[i].id;
  }
  return null;
}

function deriveViews(sections) {
  const views = {};
  for (const [key, section] of Object.entries(sections || {})) {
    const images = section.images || {};
    const baseImg = images[BASELINE.id] || null;
    const currentId = latestWith(images);
    // The baseline never counts as "current" unless it is the only round —
    // a section scanned once shows "pending" on the latest side.
    const curImg = currentId && currentId !== BASELINE.id ? images[currentId] : null;
    views[key] = {
      pre: baseImg?.src ?? null,
      preAspect: baseImg?.aspect ?? null,
      post: curImg?.src ?? null,
      postAspect: curImg?.aspect ?? null,
      vent: section.vent?.src ?? null,
      ventAspect: section.vent?.aspect ?? null,
      ventCount: section.vent ? section.vent.count : section.ventCount,
    };
  }
  return views;
}

/** Recomputes every derived export from a manifest. Runs before mount. */
export function applyManifest(next) {
  MANIFEST = next;
  TERMS = { ...DEMO_MANIFEST.terminology, ...next.terminology };
  FEATURES = { ...DEMO_MANIFEST.features, ...next.features };
  SCANS = next.scans;
  BASELINE = SCANS[0];
  CURRENT = SCANS[SCANS.length - 1];
  INSTALL = next.install ?? { range: "" };
  PROJECT = {
    name: next.job?.name ?? "",
    address: next.job?.address ?? "",
    placementReportDate: next.placementReportDate ?? "",
  };
  BUILDINGS = next.units.map((u) => {
    const currentId = latestWith(u.needsToDry);
    return {
      id: u.id,
      name: u.name || `${TERMS.unit} ${u.id}`,
      pre: u.needsToDry?.[BASELINE.id] ?? 0,
      post: currentId ? u.needsToDry[currentId] : (u.needsToDry?.[BASELINE.id] ?? 0),
      drawings: u.drawings,
      vents: u.vents,
      views: deriveViews(u.sections),
    };
  });
  // Derived from the units unless the manifest states it explicitly, so the
  // total can never drift out of sync by hand.
  VENT_STATUS_SUMMARY = next.ventStatusSummary ?? [
    { status: "Installed", count: BUILDINGS.reduce((a, b) => a + b.vents, 0) },
  ];
  CAMPUS = {
    pre: BUILDINGS.reduce((a, b) => a + b.pre, 0),
    post: BUILDINGS.reduce((a, b) => a + b.post, 0),
    drawings: BUILDINGS.reduce((a, b) => a + b.drawings, 0),
    vents: VENT_STATUS_SUMMARY.reduce((a, s) => a + s.count, 0),
  };
}

const usable = (m) => Array.isArray(m?.units) && m.units.length > 0 && Array.isArray(m?.scans) && m.scans.length > 0;

/**
 * Loads the job's manifest before the app mounts.
 *
 * A real job must never silently render the demo fixture — if its manifest
 * cannot be loaded, the reader gets an honest error instead of another
 * client's placeholder numbers. The demo slug (and therefore local dev, which
 * falls back to it) keeps the bundled fixture as its manifest of last resort.
 */
export async function initJob() {
  try {
    const remote = await loadJob();
    if (usable(remote?.manifest)) {
      applyManifest(remote.manifest);
      return { ok: true, source: "remote" };
    }
    if (JOB === "demo") {
      applyManifest(DEMO_MANIFEST);
      return { ok: true, source: "demo" };
    }
    return { ok: false, error: "This report has not been set up yet." };
  } catch (err) {
    if (JOB === "demo") {
      applyManifest(DEMO_MANIFEST);
      return { ok: true, source: "demo" };
    }
    return {
      ok: false,
      error:
        err?.message === "Unknown report."
          ? "There is no report at this address."
          : "The report could not be loaded. Check the connection and refresh.",
    };
  }
}

export const findBuilding = (id) => BUILDINGS.find((b) => b.id === id) || null;

/** One unit's needs-to-dry series across rounds, for the drying trend. */
export function unitSeries(unitId) {
  const u = MANIFEST.units.find((x) => x.id === unitId);
  if (!u) return [];
  return SCANS.map((round, index) => ({ round, index, sf: u.needsToDry?.[round.id] }))
    .filter((p) => p.sf !== undefined && p.sf !== null);
}

/**
 * The whole property's series — only rounds every unit was measured in, so a
 * partially-scanned round never masquerades as a site-wide improvement.
 */
export function campusSeries() {
  return SCANS.map((round, index) => {
    const values = MANIFEST.units.map((u) => u.needsToDry?.[round.id]);
    if (values.some((v) => v === undefined || v === null)) return null;
    return { round, index, sf: values.reduce((a, v) => a + v, 0) };
  }).filter(Boolean);
}

/** A section's image for one specific round, for the round-picker comparison. */
export function sectionImage(unitId, sectionKey, roundId) {
  const img = MANIFEST.units.find((x) => x.id === unitId)?.sections?.[sectionKey]?.images?.[roundId];
  return img ? { src: img.src, aspect: img.aspect } : null;
}

// The demo fixture is also the boot state, so imports evaluated before
// initJob() (module-level code in screens must still avoid capturing these)
// see coherent values rather than undefined.
applyManifest(DEMO_MANIFEST);
