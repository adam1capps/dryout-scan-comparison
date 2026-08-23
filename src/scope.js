import { BUILDINGS } from "./data/project.js";

/**
 * Separates what was dried from what was never in the job.
 *
 * The pre-install baseline measured the area inside the original scope of work.
 * The post-install scan measures whatever is wet now — including areas found
 * later that were never part of that baseline. Comparing the two directly
 * charges the job with area it was never scoped to dry, understating the
 * result.
 *
 * So the change and the percentage are calculated against the in-scope figure,
 * and the out-of-scope area is reported separately rather than dropped: it is
 * real, it is still wet, and it is the subject of a proposed change order.
 *
 * Out-of-scope square footage is recorded on the proposed vents that cover it,
 * which is why this takes the annotations rather than reading from static data.
 */

/** Out-of-scope square footage on one building, or on one of its drawings. */
export function outOfScopeSf(proposals, buildingId, view) {
  const proposal = proposals.find((p) => p.building === buildingId);
  if (!proposal) return 0;
  return proposal.markers.reduce((total, m) => {
    if (view !== undefined && (m.view || "ov") !== view) return total;
    return total + (m.additionalSf || 0);
  }, 0);
}

/**
 * The figures for one building.
 *
 * `postScanned` is what the June scan measured. `postInScope` is that minus the
 * area outside the original scope, and is what `change` and `pct` derive from.
 */
export function buildingScope(building, proposals) {
  const outOfScope = outOfScopeSf(proposals, building.id);
  // Clamped at zero: more out-of-scope area than remaining wet area would mean
  // the whole remainder is out of scope, not that a negative amount is wet.
  const postInScope = Math.max(0, building.post - outOfScope);
  const change = postInScope - building.pre;
  return {
    pre: building.pre,
    postScanned: building.post,
    outOfScope,
    postInScope,
    change,
    pct: building.pre ? Math.round((change / building.pre) * 100) : 0,
  };
}

/** The same figures for the whole property, summed from the buildings. */
export function campusScope(proposals, buildings = BUILDINGS) {
  const rows = buildings.map((b) => buildingScope(b, proposals));
  const pre = rows.reduce((a, r) => a + r.pre, 0);
  const postScanned = rows.reduce((a, r) => a + r.postScanned, 0);
  const outOfScope = rows.reduce((a, r) => a + r.outOfScope, 0);
  const postInScope = rows.reduce((a, r) => a + r.postInScope, 0);
  const change = postInScope - pre;
  return {
    pre,
    postScanned,
    outOfScope,
    postInScope,
    change,
    pct: pre ? Math.round((change / pre) * 100) : 0,
  };
}
