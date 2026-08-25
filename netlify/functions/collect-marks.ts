import { and, eq } from "drizzle-orm";
import { db } from "../../db/index";
import { collectMarks } from "../../db/schema";
import {
  handler,
  idFromQuery,
  json,
  methodIs,
  readJson,
  readPin,
  requireJobFrom,
  requireUser,
} from "./_lib";

/** Installed vents marked on the placement map for collection. */
export default handler(async (req: Request) => {
  const method = methodIs(req, "POST", "DELETE");
  const job = await requireJobFrom(req);
  await requireUser(req, job);

  if (method === "POST") {
    const body = await readJson<Record<string, unknown>>(req);
    const [created] = await db
      .insert(collectMarks)
      .values({ jobId: job.id, ...readPin(body) })
      .returning();
    return json(created, 201);
  }

  const id = idFromQuery(req);
  await db
    .delete(collectMarks)
    .where(and(eq(collectMarks.id, id), eq(collectMarks.jobId, job.id)));
  return json({ deleted: id });
});
