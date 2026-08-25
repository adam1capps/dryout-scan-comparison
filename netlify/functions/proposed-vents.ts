import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index";
import { proposedVents } from "../../db/schema";
import {
  HttpError,
  handler,
  idFromQuery,
  json,
  methodIs,
  readJson,
  readPin,
  requireJobFrom,
  requireUser,
} from "./_lib";

/** Kept in step with src/ventCategories.js. */
const CATEGORIES = new Set(["ventilation", "moisture", "leak", "other"]);
const SF_STEP = 50;
const MAX_SF = 100000;
/** One click-drag of ⌘-select should not be able to rewrite the whole project. */
const MAX_BULK = 200;

/**
 * Validates the editable fields of a vent.
 *
 * Every field is optional so a bulk apply can set a category across a selection
 * without disturbing the square footage each vent already carries.
 */
function readVentFields(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  if ("category" in body) {
    const raw = body.category;
    if (raw === null || raw === "") {
      patch.category = null;
    } else {
      const category = String(raw);
      if (!CATEGORIES.has(category)) {
        throw new HttpError(400, `Unknown vent category "${category}".`);
      }
      patch.category = category;
    }
  }

  if ("note" in body) {
    patch.note = String(body.note ?? "").slice(0, 2000);
  }

  if ("additionalSf" in body) {
    const raw = body.additionalSf;
    if (raw === null || raw === "" || raw === 0) {
      patch.additionalSf = null;
    } else {
      const sf = Number(raw);
      if (!Number.isFinite(sf) || sf < 0 || sf > MAX_SF) {
        throw new HttpError(400, "Additional square footage is out of range.");
      }
      if (sf % SF_STEP !== 0) {
        throw new HttpError(400, `Square footage must be a multiple of ${SF_STEP}.`);
      }
      patch.additionalSf = sf;
    }
  }

  return patch;
}

/**
 * Proposed vent markers.
 *
 * POST   — place a marker, optionally already categorised
 * PATCH  — update one vent (?id=) or a selection ({ids:[...]}) in one call
 * DELETE — remove a marker by id
 *
 * The bulk PATCH exists because vents are categorised in groups: an editor
 * ⌘-clicks the six vents over one wet area and sets them all at once.
 */
export default handler(async (req: Request) => {
  const method = methodIs(req, "POST", "PATCH", "DELETE");
  const job = await requireJobFrom(req);
  await requireUser(req, job);

  if (method === "POST") {
    const body = await readJson<Record<string, unknown>>(req);
    const [created] = await db
      .insert(proposedVents)
      .values({ jobId: job.id, ...readPin(body), ...readVentFields(body) })
      .returning();
    return json(created, 201);
  }

  if (method === "PATCH") {
    const body = await readJson<Record<string, unknown>>(req);
    const patch = readVentFields(body);
    if (Object.keys(patch).length === 0) {
      throw new HttpError(400, "Nothing to update.");
    }
    patch.updatedAt = new Date();

    // A selection, when the body carries ids; otherwise the single vent named
    // in the query string.
    if (Array.isArray(body.ids)) {
      const ids = body.ids
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0);
      if (ids.length === 0) throw new HttpError(400, "No valid vent ids given.");
      if (ids.length > MAX_BULK) {
        throw new HttpError(400, `Cannot update more than ${MAX_BULK} vents at once.`);
      }
      const updated = await db
        .update(proposedVents)
        .set(patch)
        .where(and(inArray(proposedVents.id, ids), eq(proposedVents.jobId, job.id)))
        .returning();
      return json({ updated });
    }

    const id = idFromQuery(req);
    const [updated] = await db
      .update(proposedVents)
      .set(patch)
      .where(and(eq(proposedVents.id, id), eq(proposedVents.jobId, job.id)))
      .returning();
    if (!updated) throw new HttpError(404, "That vent marker no longer exists.");
    return json({ updated: [updated] });
  }

  const id = idFromQuery(req);
  const [existing] = await db
    .select()
    .from(proposedVents)
    .where(and(eq(proposedVents.id, id), eq(proposedVents.jobId, job.id)))
    .limit(1);
  if (!existing) throw new HttpError(404, "That vent marker no longer exists.");

  await db
    .delete(proposedVents)
    .where(and(eq(proposedVents.id, id), eq(proposedVents.jobId, job.id)));
  return json({ deleted: id });
});
