/**
 * DEMO FIXTURE — not a real job.
 *
 * This file keeps the app runnable on day one of the platform repo. Its shape
 * is inherited from the McCallum report and is the starting point for the
 * PLAN.md Phase 1 refactor, where this static module becomes a runtime job
 * manifest (multi-round scans, terminology, feature flags) loaded per job.
 *
 * The placeholder images under /assets/demo/ were generated at the exact
 * pixel sizes the aspect strings below claim — the aspect must always match
 * the file's true dimensions, because annotation pins are stored as
 * percentages of the frame and a wrong ratio moves every pin.
 */
export const PROJECT = {
  school: "Demo Property",
  address: "123 Example Rd, Austin, TX",
  statusLine: "",
  preDate: "January 1, 2026",
  postDate: "June 1, 2026",
  placementReportDate: "June 15, 2026",
};

/** pre/post are needs-to-dry square footage (wet + damp). */
export const BUILDINGS = [
  {
    id: "A",
    name: "Building A",
    pre: 1000,
    post: 400,
    drawings: 1,
    vents: 4,
    views: {
      ov: {
        pre: "/assets/demo/pre-ov.png",
        preAspect: "600 / 400",
        post: "/assets/demo/post-ov.png",
        postAspect: "620 / 410",
        vent: "/assets/demo/vents-ov.png",
        ventAspect: "800 / 500",
        ventCount: 4,
      },
    },
  },
  {
    id: "B",
    name: "Building B",
    pre: 800,
    post: 700,
    drawings: 1,
    vents: 3,
    views: {
      ov: {
        pre: "/assets/demo/pre-ov.png",
        preAspect: "600 / 400",
        post: "/assets/demo/post-ov.png",
        postAspect: "620 / 410",
        vent: "/assets/demo/vents-ov.png",
        ventAspect: "800 / 500",
        ventCount: 3,
      },
    },
  },
];

export const VENT_STATUS_SUMMARY = [{ status: "Installed", count: 7 }];

export const CAMPUS = {
  pre: BUILDINGS.reduce((a, b) => a + b.pre, 0),
  post: BUILDINGS.reduce((a, b) => a + b.post, 0),
  drawings: BUILDINGS.reduce((a, b) => a + b.drawings, 0),
  vents: VENT_STATUS_SUMMARY.reduce((a, s) => a + s.count, 0),
};

export const findBuilding = (id) => BUILDINGS.find((b) => b.id === id) || null;
