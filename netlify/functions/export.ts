import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/index";
import {
  changeOrders,
  collectMarks,
  findings,
  jobs,
  proposedVents,
  quoteRequests,
  ventProposalReasons,
} from "../../db/schema";
import { HttpError, handler, json, methodIs, requireUser } from "./_lib";

/**
 * The staff export: everything authored on every job, in one authenticated
 * read. This is what tools/backup.mjs snapshots.
 *
 * The McCallum backup read the public API and so silently lost the staff-only
 * vent reasons and never saw the quote requests at all. This endpoint exists
 * so a backup is a backup: nothing is redacted, nothing is missing, and the
 * one call covers the whole fleet.
 *
 * Super-admin only (REPORT_EDITORS), because it crosses jobs.
 */
export default handler(async (req: Request) => {
  methodIs(req, "GET");
  await requireUser(req);

  const slug = new URL(req.url).searchParams.get("job")?.trim().toLowerCase();

  const rows = await db.select().from(jobs).orderBy(asc(jobs.slug));
  const wanted = slug ? rows.filter((j) => j.slug === slug) : rows;
  if (slug && wanted.length === 0) throw new HttpError(404, "Unknown job.");

  const exported = [];
  for (const job of wanted) {
    const [f, v, r, c, q, co] = await Promise.all([
      db.select().from(findings).where(eq(findings.jobId, job.id)).orderBy(asc(findings.id)),
      db.select().from(proposedVents).where(eq(proposedVents.jobId, job.id)).orderBy(asc(proposedVents.id)),
      db.select().from(ventProposalReasons).where(eq(ventProposalReasons.jobId, job.id)),
      db.select().from(collectMarks).where(eq(collectMarks.jobId, job.id)).orderBy(asc(collectMarks.id)),
      db.select().from(quoteRequests).where(eq(quoteRequests.jobId, job.id)).orderBy(desc(quoteRequests.createdAt)),
      db.select().from(changeOrders).where(eq(changeOrders.jobId, job.id)).orderBy(asc(changeOrders.number)),
    ]);
    exported.push({
      job: {
        slug: job.slug,
        hostnames: job.hostnames,
        editors: job.editors,
        config: job.config,
        manifest: job.manifest,
      },
      findings: f,
      proposedVents: v,
      ventProposalReasons: r,
      collectMarks: c,
      quoteRequests: q,
      changeOrders: co,
    });
  }

  return json({ exportedAt: new Date().toISOString(), jobs: exported });
});
