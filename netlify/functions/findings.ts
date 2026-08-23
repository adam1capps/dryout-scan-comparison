import { eq } from "drizzle-orm";
import { getStore } from "@netlify/blobs";
import { db } from "../../db/index";
import { findings } from "../../db/schema";
import {
  HttpError,
  handler,
  idFromQuery,
  json,
  methodIs,
  readJson,
  readPin,
  requireUser,
} from "./_lib";

const STATUSES = new Set(["Open", "Scheduled", "Repaired"]);

function readBody(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim() || "Unnamed finding";
  const note = String(body.note ?? "").trim();
  const status = String(body.status ?? "Open");
  if (!STATUSES.has(status)) throw new HttpError(400, `Unknown status "${status}".`);

  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "date must be yyyy-mm-dd.");
  }

  const photoKey = body.photoKey == null ? null : String(body.photoKey);
  return { name, note, status, foundOn: date, photoKey };
}

/** Deletes a finding's photo from Blobs. Never fails the request. */
async function dropPhoto(key: string | null) {
  if (!key) return;
  try {
    await getStore("finding-photos").delete(key);
  } catch (err) {
    // An orphaned blob is harmless; a 500 on delete is not. Log and move on.
    console.error("could not delete photo blob", key, err);
  }
}

export default handler(async (req: Request) => {
  const method = methodIs(req, "POST", "PATCH", "DELETE");
  await requireUser(req);

  if (method === "POST") {
    const body = await readJson<Record<string, unknown>>(req);
    const [created] = await db
      .insert(findings)
      .values({ ...readPin(body), ...readBody(body) })
      .returning();
    return json(created, 201);
  }

  if (method === "PATCH") {
    const id = idFromQuery(req);
    const body = await readJson<Record<string, unknown>>(req);

    const [existing] = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
    if (!existing) throw new HttpError(404, "That finding no longer exists.");

    const next = readBody(body);
    // Swapping or clearing the photo leaves the old blob unreferenced.
    if (existing.photoKey && existing.photoKey !== next.photoKey) {
      await dropPhoto(existing.photoKey);
    }

    const [updated] = await db
      .update(findings)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(findings.id, id))
      .returning();
    return json(updated);
  }

  const id = idFromQuery(req);
  const [existing] = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "That finding no longer exists.");
  await dropPhoto(existing.photoKey);
  await db.delete(findings).where(eq(findings.id, id));
  return json({ deleted: id });
});
