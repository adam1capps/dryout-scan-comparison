import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Every annotation is pinned to a point on one roof drawing.
 *
 * `building` is the unit id from the job data ("A", "B", …)
 * and `view` is the drawing within it — "ov" for the section overview, or
 * "1".."n" for an individual roof section.
 *
 * `x` and `y` are percentages of the frame, not pixels. The scans are served at
 * whatever size the viewport allows and each drawing has its own aspect ratio,
 * so a pixel offset would land somewhere different on every screen. Percentages
 * survive both, which is why the prototype stored them that way too.
 */
const pin = {
  building: varchar({ length: 8 }).notNull(),
  view: varchar({ length: 8 }).notNull().default("ov"),
  x: doublePrecision().notNull(),
  y: doublePrecision().notNull(),
};

/** A deficiency found on the roof, pinned to the post install scan. */
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
  // Key into the Netlify Blobs "finding-photos" store. Null when there is no
  // photo. The image bytes never live in Postgres.
  photoKey: varchar("photo_key", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * One additional vent proposed on top of what was installed in April.
 *
 * The reason lives on the vent, not on the building. A roof can carry vents
 * proposed for different reasons — one over a confirmed leak, another simply
 * needing more ventilation — and they are billed differently, so a single
 * per-building note cannot describe them.
 */
export const proposedVents = pgTable("proposed_vents", {
  id: serial().primaryKey(),
  ...pin,
  // Slug from src/ventCategories.js. NULL means not yet categorised, which is
  // the state every vent placed before this existed is left in — they are kept
  // and shown as pending rather than deleted or guessed at.
  category: varchar({ length: 32 }),
  // Only meaningful when category is "other"; the free-text reason.
  note: text().notNull().default(""),
  // Billable square footage attached to this vent, in 50 sq ft steps. NULL
  // means none. Independent of category so a vent can carry both a reason and
  // an amount.
  additionalSf: integer("additional_sf"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * The rationale for the vents proposed in a building.
 *
 * One row per building rather than per vent: the campus overview shows a single
 * "why these vents" line per section, and the editor edits it in one field.
 */
export const ventProposalReasons = pgTable("vent_proposal_reasons", {
  id: serial().primaryKey(),
  building: varchar({ length: 8 }).notNull().unique(),
  reason: text().notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** An installed vent marked on the placement map for collection. */
export const collectMarks = pgTable("collect_marks", {
  id: serial().primaryKey(),
  ...pin,
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * A request from the client for a quote on the additional scope.
 *
 * Recorded as well as emailed. An email that bounces or lands in spam is a lost
 * lead nobody knows about, so the row is the record and the notification is the
 * convenience — `notifiedAt` says whether the message actually left.
 */
export const quoteRequests = pgTable("quote_requests", {
  id: serial().primaryKey(),
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

export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ProposedVent = typeof proposedVents.$inferSelect;
export type VentProposalReason = typeof ventProposalReasons.$inferSelect;
export type CollectMark = typeof collectMarks.$inferSelect;
