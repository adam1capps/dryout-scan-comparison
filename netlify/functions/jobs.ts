import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index";
import { jobs } from "../../db/schema";
import { HttpError, handler, json, methodIs, readJson, requireUser } from "./_lib";

/**
 * Staff management of the jobs registry.
 *
 * GET  — list every job. Super-admin only: this is the cross-job view, so
 *        per-job editor lists do not grant it.
 * POST — create or update a job by slug (the New Job wizard's save). Also
 *        super-admin only: creating a job decides who may edit it, which a
 *        per-job editor must not be able to do for other jobs.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

function readStrings(value: unknown, label: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${label} must be a list.`);
  if (value.length > max) throw new HttpError(400, `${label} is too long.`);
  return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export default handler(async (req: Request) => {
  const method = methodIs(req, "GET", "POST");
  await requireUser(req);

  if (method === "GET") {
    const rows = await db.select().from(jobs).orderBy(asc(jobs.slug));
    return json({ jobs: rows });
  }

  const body = await readJson<Record<string, unknown>>(req);
  const slug = String(body.slug ?? "")
    .trim()
    .toLowerCase();
  if (!SLUG.test(slug)) {
    throw new HttpError(400, "slug must be 2-63 characters of a-z, 0-9 and hyphens.");
  }

  // Only fields present in the body are written — a manifest-only save must
  // never wipe a job's editors, hostnames, or comms config.
  const patch: Record<string, unknown> = {};
  if ("hostnames" in body) patch.hostnames = readStrings(body.hostnames, "hostnames", 20);
  if ("editors" in body) patch.editors = readStrings(body.editors, "editors", 50);
  if ("config" in body) patch.config = readObject(body.config, "config");
  if ("manifest" in body) patch.manifest = readObject(body.manifest, "manifest");

  const [saved] = await db
    .insert(jobs)
    .values({ slug, ...patch })
    .onConflictDoUpdate({
      target: jobs.slug,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return json(saved, 201);
});
