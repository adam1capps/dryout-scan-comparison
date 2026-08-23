import { and, eq } from "drizzle-orm";
import { db } from "../../db/index";
import { ventProposalReasons } from "../../db/schema";
import { HttpError, handler, json, methodIs, readJson, requireJobFrom, requireUser } from "./_lib";

/**
 * The old per-building vent note.
 *
 * Superseded by per-vent categories, because one note per building cannot
 * describe vents proposed for different reasons — and those are billed
 * differently. Notes written under the old model are kept rather than dropped:
 * this endpoint exists so they can be edited or cleared once their content has
 * been moved onto the individual vents.
 *
 * No new notes are created from the UI.
 */
export default handler(async (req: Request) => {
  methodIs(req, "PATCH");
  const job = await requireJobFrom(req);
  await requireUser(req, job);

  const body = await readJson<Record<string, unknown>>(req);
  const building = String(body.building ?? "").trim();
  if (!building) throw new HttpError(400, "building is required.");
  const reason = String(body.reason ?? "").slice(0, 2000);

  if (!reason.trim()) {
    await db
      .delete(ventProposalReasons)
      .where(
        and(eq(ventProposalReasons.jobId, job.id), eq(ventProposalReasons.building, building)),
      );
    return json({ building, reason: "" });
  }

  const [saved] = await db
    .insert(ventProposalReasons)
    .values({ jobId: job.id, building, reason })
    .onConflictDoUpdate({
      target: [ventProposalReasons.jobId, ventProposalReasons.building],
      set: { reason, updatedAt: new Date() },
    })
    .returning();
  return json(saved);
});
