/**
 * The job manifest — the single per-job input to the whole report.
 *
 * This is the shape the New Job wizard (PLAN.md Phase 3) will produce and the
 * multi-tenant backend (Phase 2) will serve per job. Until then it ships as a
 * static module with demo data, and src/data/project.js derives everything the
 * screens consume from it.
 *
 * Shape notes:
 * - `scans` is an ordered list of rounds. scans[0] is the BASELINE — the scan
 *   the original scope of work is measured against (decision §11.5 in
 *   PLAN.md). A job carries as many rounds as it takes to get dry.
 * - `units[].needsToDry` maps scan-round id → wet+damp SF measured that round.
 *   A round may be missing for a unit (not scanned that visit); the report
 *   compares the baseline against the latest round that has a figure.
 * - `sections[key].images` maps scan-round id → {src, aspect}. The aspect
 *   string must match the image's true pixel dimensions — pins are stored as
 *   percentages of the frame, so a wrong aspect silently moves every pin. The
 *   wizard measures dimensions from the file; they are never hand-typed.
 * - Section keys are the numbers printed on the Vent Placement Guide, gaps
 *   and all ("ov" is the overview drawing). Never renumber them.
 * - `ventStatusSummary` may be omitted; the total is then derived from
 *   units[].vents, which removes the hand-kept-in-sync total the McCallum
 *   report carried.
 */
export const MANIFEST = {
  job: {
    slug: "demo",
    name: "Demo Property",
    address: "123 Example Rd, Austin, TX",
  },

  // Decision §11.7: Location → Building → Roof Section by default; per-job
  // overrides are just different strings here.
  terminology: {
    site: "Location",
    unit: "Building",
    section: "Roof Section",
    ventProduct: "Rapid-Vent",
    ventProductPlural: "Rapid-Vents",
  },

  features: {
    vents: true,
    quoteIt: true, // decision §11.8: on by default (self-hides at 0 SF)
  },

  install: {
    // Display string for the timeline and the vent status line.
    range: "March 3 to March 5, 2026",
  },
  placementReportDate: "March 20, 2026",

  scans: [
    { id: "r0", label: "Baseline scan", date: "January 5, 2026" },
    { id: "r1", label: "Scan 2", date: "June 1, 2026" },
    { id: "r2", label: "Scan 3", date: "August 15, 2026" },
  ],

  units: [
    {
      id: "A",
      name: "Building A",
      vents: 4,
      drawings: 1,
      needsToDry: { r0: 1000, r1: 700, r2: 400 },
      sections: {
        ov: {
          images: {
            r0: { src: "/assets/demo/pre-ov.png", aspect: "600 / 400" },
            r1: { src: "/assets/demo/post-ov.png", aspect: "620 / 410" },
            r2: { src: "/assets/demo/post-ov.png", aspect: "620 / 410" },
          },
          vent: { src: "/assets/demo/vents-ov.png", aspect: "800 / 500", count: 4 },
        },
      },
    },
    {
      // Deliberately a hard case for the demo: B dried by round 2 and then got
      // wetter by round 3, so the drying gradient has something honest to show.
      id: "B",
      name: "Building B",
      vents: 3,
      drawings: 1,
      needsToDry: { r0: 800, r1: 500, r2: 700 },
      sections: {
        ov: {
          images: {
            r0: { src: "/assets/demo/pre-ov.png", aspect: "600 / 400" },
            r2: { src: "/assets/demo/post-ov.png", aspect: "620 / 410" },
          },
          vent: { src: "/assets/demo/vents-ov.png", aspect: "800 / 500", count: 3 },
        },
      },
    },
  ],
};
