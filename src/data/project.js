/**
 * Everything the screens consume, derived from the job manifest.
 *
 * The manifest (src/job/manifest.js) holds scans as an ordered list of rounds;
 * the report compares the BASELINE (rounds[0], which the scope of work is
 * measured against) with the CURRENT round — per unit, the latest round that
 * actually has a figure, so a unit skipped on the latest visit still shows its
 * most recent measurement instead of nothing.
 *
 * The `pre`/`post` names survive on the derived shapes because a dozen
 * components speak them; they mean baseline/current now. Everything
 * runtime-authored (findings, proposed vents, collect marks) stays in
 * Postgres and arrives via /api/annotations, keyed by unit and section ids —
 * which is why unit ids must be stable for the life of a job.
 */
import { MANIFEST } from "../job/manifest.js";

export { MANIFEST };
export const TERMS = MANIFEST.terminology;
export const FEATURES = MANIFEST.features;
export const SCANS = MANIFEST.scans;
export const BASELINE = SCANS[0];
export const CURRENT = SCANS[SCANS.length - 1];
export const INSTALL = MANIFEST.install;

export const PROJECT = {
  name: MANIFEST.job.name,
  address: MANIFEST.job.address,
  placementReportDate: MANIFEST.placementReportDate,
};

/** The latest round id (at or before `scans`' end) for which `byRound` has a value. */
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
    // a section scanned once shows its baseline on both sides as "pending".
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

export const BUILDINGS = MANIFEST.units.map((u) => {
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

/**
 * Derived from the units unless the manifest states it explicitly (a job
 * mid-install may carry Scheduled counts). The McCallum report kept this
 * total in sync by hand; here it cannot drift.
 */
export const VENT_STATUS_SUMMARY = MANIFEST.ventStatusSummary ?? [
  { status: "Installed", count: BUILDINGS.reduce((a, b) => a + b.vents, 0) },
];

export const CAMPUS = {
  pre: BUILDINGS.reduce((a, b) => a + b.pre, 0),
  post: BUILDINGS.reduce((a, b) => a + b.post, 0),
  drawings: BUILDINGS.reduce((a, b) => a + b.drawings, 0),
  vents: VENT_STATUS_SUMMARY.reduce((a, s) => a + s.count, 0),
};

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
