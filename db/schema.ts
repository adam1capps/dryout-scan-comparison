import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * One row per job — the tenancy root of the whole platform.
 *
 * Every annotation table below carries this row's id, and the API resolves
 * which job a request addresses exactly once (netlify/functions/_lib.ts,
 * requireJobFrom) before any query runs. That makes cross-job leakage a
 * missing-column compile error rather than a forgotten WHERE clause.
 */
export const jobs = pgTable("jobs", {
  id: serial().primaryKey(),
  // URL identity: reports.re-dry.com/<slug>. Stable for the life of the job —
  // annotations and blob keys hang off the row id, but links carry the slug.
  slug: varchar({ length: 64 }).notNull().unique(),
  // Vanity hostnames (e.g. mccallum.re-dry.com) aliased onto this site that
  // should resolve to this job. Lowercase, no port.
  hostnames: jsonb().$type<string[]>().notNull().default([]),
  // Verified emails allowed to edit THIS job, lowercase. The REPORT_EDITORS
  // env allowlist stays on top as the global super-admin list — and keeps its
  // fail-closed property: with it unset, nobody edits anything anywhere.
  editors: jsonb().$type<string[]>().notNull().default([]),
  // Per-job comms + operational config: { name, address, publicUrl,
  // notifyEmail, fromEmail, fromName, pricing... }. Public reads expose only a
  // whitelisted subset (see netlify/functions/job.ts).
  config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  // The report manifest — the shape of src/job/manifest.js: terminology,
  // features, scans, units with per-round figures and image references.
  manifest: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Every annotation is pinned to a point on one roof drawing of one job.
 *
 * `building` is the unit id from the job's manifest ("A", "B", …) and `view`
 * is the drawing within it — "ov" for the overview, or the guide's own section
 * numbers.
 *
 * `x` and `y` are percentages of the frame, not pixels. The scans are served
 * at whatever size the viewport allows and each drawing has its own aspect
 * ratio, so a pixel offset would land somewhere different on every screen.
 */
const pin = {
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  building: varchar({ length: 8 }).notNull(),
  view: varchar({ length: 8 }).notNull().default("ov"),
  x: doublePrecision().notNull(),
  y: doublePrecision().notNull(),
};

/** A deficiency found on the roof, pinned to the latest scan. */
export const findings = pgTable("findings", {
  id: serial().primaryKey(),
  ...pin,
  name: varchar({ length: 200 }).notNull(),
  note: text().notNull().default(""),
  // Open | Scheduled | Repaired. Kept as text rather than a Postgres enum so
  // adding a status later is a code change, not a migration on a live table.
  status: varchar({ length: 20 }).notNull().default("Open"),
  // ISO yyyy-mm-dd. A calendar date with no time or zone — the day the crew
  // found it — so a timestamp would invite an off-by-one at midnight.
  foundOn: varchar("found_on", { length: 10 }).notNull(),
  // Key into the Netlify Blobs "finding-photos" store, prefixed by job id.
  // Null when there is no photo. The image bytes never live in Postgres.
  photoKey: varchar("photo_key", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * One additional vent proposed on top of what was installed.
 *
 * The reason lives on the vent, not on the building: a roof can carry vents
 * proposed for different reasons — one over a confirmed leak, another simply
 * needing more ventilation — and they are billed differently.
 */
export const proposedVents = pgTable("proposed_vents", {
  id: serial().primaryKey(),
  ...pin,
  // Slug from src/ventCategories.js. NULL means not yet categorised.
  category: varchar({ length: 32 }),
  // Only meaningful when category is "other"; the free-text reason.
  note: text().notNull().default(""),
  // Billable square footage attached to this vent, in 50 sq ft steps. NULL
  // means none. This is what the quote and change-order figures sum.
  additionalSf: integer("additional_sf"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * The legacy per-building vent rationale. Unique per (job, building) — the
 * McCallum schema's global unique on building alone would have let one job's
 * "A" block every other job's "A".
 */
export const ventProposalReasons = pgTable(
  "vent_proposal_reasons",
  {
    id: serial().primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    building: varchar({ length: 8 }).notNull(),
    reason: text().notNull().default(""),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.jobId, t.building)],
);

/** An installed vent marked on the placement map for collection. */
export const collectMarks = pgTable("collect_marks", {
  id: serial().primaryKey(),
  ...pin,
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * A request from the client for a quote on the additional scope.
 *
 * Recorded as well as emailed. An email that bounces or lands in spam is a
 * lost lead nobody knows about, so the row is the record and the notification
 * is the convenience — `notifiedAt` says whether the message actually left.
 */
export const quoteRequests = pgTable("quote_requests", {
  id: serial().primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  name: varchar({ length: 120 }).notNull(),
  email: varchar({ length: 200 }).notNull(),
  company: varchar({ length: 160 }).notNull(),
  jobTitle: varchar("job_title", { length: 120 }).notNull(),
  // The additional square footage at the moment of the request. Snapshotted
  // because the survey keeps changing, and a quote must be traceable to the
  // figure the requester actually saw.
  additionalSf: integer("additional_sf").notNull().default(0),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ProposedVent = typeof proposedVents.$inferSelect;
export type VentProposalReason = typeof ventProposalReasons.$inferSelect;
export type CollectMark = typeof collectMarks.$inferSelect;
