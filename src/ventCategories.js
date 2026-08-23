/**
 * Why a vent is being proposed, and how that rolls up.
 *
 * Categories are stored as slugs rather than their labels so the wording can be
 * revised — this is a document a school district reads — without a migration or
 * a backfill of existing rows.
 */

export const VENT_CATEGORIES = [
  {
    key: "ventilation",
    label: "Area requires additional ventilation",
    // Plain marker. Needing more airflow is the ordinary case, so it gets no
    // glyph — reserving them for the two conditions worth spotting at a glance.
    glyph: null,
  },
  {
    key: "moisture",
    label: "Increase in moisture. Possible leak.",
    glyph: "?",
  },
  {
    key: "leak",
    label: "Confirmed leak spot",
    glyph: "!",
  },
  {
    key: "other",
    label: "Other",
    glyph: null,
    // The only category that carries its own written explanation.
    takesNote: true,
  },
];

export const CATEGORY_BY_KEY = Object.fromEntries(
  VENT_CATEGORIES.map((c) => [c.key, c]),
);

export const categoryLabel = (key) => CATEGORY_BY_KEY[key]?.label ?? "Not yet categorised";

/** Square footage is recorded in 50 sq ft steps. */
export const SF_STEP = 50;

export const roundToStep = (n) =>
  Math.max(0, Math.round((Number(n) || 0) / SF_STEP) * SF_STEP);

/**
 * The glyph drawn inside a vent marker.
 *
 * Additional square footage wins over the category glyph: it is the billable
 * fact, and a marker has room for one character. A vent carrying both still
 * shows its category in the panel and in the recap.
 */
export function ventGlyph(vent) {
  if (vent.additionalSf > 0) return "+";
  return CATEGORY_BY_KEY[vent.category]?.glyph ?? null;
}

/**
 * Totals a set of vents by category.
 *
 * Categories with no vents are omitted entirely — an empty row invites the
 * reader to wonder what was missed. `uncategorised` is reported separately so
 * the editor can see what is still to be filled in without it reading as a
 * finding.
 */
export function summarise(vents) {
  const counts = new Map();
  let additionalSf = 0;
  let uncategorised = 0;

  for (const v of vents) {
    if (v.additionalSf > 0) additionalSf += v.additionalSf;
    if (!v.category || !CATEGORY_BY_KEY[v.category]) {
      uncategorised += 1;
      continue;
    }
    counts.set(v.category, (counts.get(v.category) || 0) + 1);
  }

  // Ordered by the list above so the recap reads the same way every time.
  const rows = VENT_CATEGORIES.filter((c) => counts.has(c.key)).map((c) => ({
    key: c.key,
    label: c.label,
    count: counts.get(c.key),
  }));

  return { rows, additionalSf, uncategorised, total: vents.length };
}

/** Every proposed vent on the project, flattened out of the per-building groups. */
export const allVents = (proposals) =>
  proposals.flatMap((p) => p.markers.map((m) => ({ ...m, building: p.building })));
